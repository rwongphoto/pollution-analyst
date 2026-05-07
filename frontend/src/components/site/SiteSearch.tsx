"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

type IndexItem = {
  t: "s" | "co" | "ci" | "sf";
  n: string;
  s: string;
  l: string;
  c?: string;
};

type IndexFile = { version: number; generated_at: string; items: IndexItem[] };

// Module-scoped cache: index payload + Fuse instance survive across mount/
// unmount of the input (e.g. when the mobile overlay opens and closes).
let cachedIndex: IndexItem[] | null = null;
let cachedFuse: { search: (q: string) => { item: IndexItem }[] } | null = null;
let inflight: Promise<void> | null = null;

async function ensureIndex(): Promise<void> {
  if (cachedFuse) return;
  if (inflight) return inflight;
  inflight = (async () => {
    const [res, FuseMod] = await Promise.all([
      fetch("/search-index.json"),
      import("fuse.js"),
    ]);
    if (!res.ok) throw new Error(`search-index fetch failed: ${res.status}`);
    const data: IndexFile = await res.json();
    cachedIndex = data.items;
    const Fuse = FuseMod.default;
    cachedFuse = new Fuse(data.items, {
      keys: [
        { name: "n", weight: 0.7 },
        { name: "c", weight: 0.2 },
        { name: "l", weight: 0.1 },
      ],
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  })();
  try {
    await inflight;
  } finally {
    inflight = null;
  }
}

const TYPE_ORDER: Record<IndexItem["t"], number> = {
  s: 0,
  co: 1,
  ci: 2,
  sf: 3,
};

const TYPE_LABEL: Record<IndexItem["t"], string> = {
  s: "State",
  co: "County",
  ci: "City",
  sf: "Superfund",
};

function hrefFor(item: IndexItem): string {
  // For non-state items the index encodes "state/slug" in `s`; the routes
  // nest entity type under /state/[state]/, so split and re-assemble.
  if (item.t === "s") return `/state/${item.s}`;
  const [state, slug] = item.s.split("/", 2);
  switch (item.t) {
    case "co": return `/state/${state}/county/${slug}`;
    case "ci": return `/state/${state}/city/${slug}`;
    case "sf": return `/state/${state}/superfund/${slug}`;
  }
}

function search(query: string, max = 8): IndexItem[] {
  const q = query.trim();
  if (q.length < 2) return [];
  if (cachedFuse) {
    const hits = cachedFuse.search(q).slice(0, max * 2).map((r) => r.item);
    hits.sort((a, b) => TYPE_ORDER[a.t] - TYPE_ORDER[b.t]);
    return hits.slice(0, max);
  }
  // Fallback substring scan if Fuse is still loading — keeps the UI
  // responsive on the very first keystroke.
  if (cachedIndex) {
    const lower = q.toLowerCase();
    const out: IndexItem[] = [];
    for (const it of cachedIndex) {
      if (it.n.toLowerCase().includes(lower)) {
        out.push(it);
        if (out.length >= max * 2) break;
      }
    }
    out.sort((a, b) => TYPE_ORDER[a.t] - TYPE_ORDER[b.t]);
    return out.slice(0, max);
  }
  return [];
}

type Mode = "inline" | "overlay";

function ResultRow({
  item,
  active,
  onSelect,
}: {
  item: IndexItem;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <Link
      href={hrefFor(item)}
      role="option"
      aria-selected={active}
      className={`site-search-result ${active ? "is-active" : ""}`}
      onClick={onSelect}
    >
      <span className="ssr-name">{item.n}</span>
      <span className="ssr-meta">
        {item.c ? <span className="ssr-context">{item.c}</span> : null}
        <span className="ssr-state">{item.l}</span>
        <span className="ssr-type">{TYPE_LABEL[item.t]}</span>
      </span>
    </Link>
  );
}

function SearchPanel({
  mode,
  onClose,
}: {
  mode: Mode;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [, force] = useState(0);
  const listboxId = useId();

  // Kick off lazy load on mount of the panel (focus or overlay-open).
  useEffect(() => {
    let cancelled = false;
    void ensureIndex().then(() => {
      if (!cancelled) force((n) => n + 1);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Both modes auto-focus on mount: inline opens via the placeholder
    // button, overlay opens via icon-tap — in both cases the user expects
    // the cursor in the input.
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => search(query), [query]);

  const onQueryChange = useCallback((v: string) => {
    setQuery(v);
    setActive(0);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const target = results[active];
        if (target) {
          e.preventDefault();
          onClose();
          router.push(hrefFor(target));
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (query) setQuery("");
        else onClose();
      }
    },
    [results, active, onClose, router, query],
  );

  return (
    <div className={`site-search-panel ${mode}`} role="search">
      <div className="site-search-input-wrap">
        <SearchIcon />
        <input
          ref={inputRef}
          type="search"
          placeholder="Search states, cities…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
          aria-label="Search states, counties, cities, superfund sites"
          aria-controls={listboxId}
          aria-activedescendant={
            results[active] ? `${listboxId}-${active}` : undefined
          }
        />
        {mode === "overlay" ? (
          <button
            type="button"
            className="site-search-close"
            onClick={onClose}
            aria-label="Close search"
          >
            ×
          </button>
        ) : null}
      </div>
      <div
        ref={listRef}
        id={listboxId}
        role="listbox"
        className="site-search-results"
      >
        {query.trim().length < 2 ? (
          <div className="site-search-hint">
            Type a state, county, city, or superfund site name.
          </div>
        ) : results.length === 0 ? (
          <div className="site-search-hint">
            {cachedFuse ? "No matches." : "Loading index…"}
          </div>
        ) : (
          results.map((item, i) => (
            <div
              key={`${item.t}-${item.s}`}
              id={`${listboxId}-${i}`}
              onMouseEnter={() => setActive(i)}
            >
              <ResultRow
                item={item}
                active={i === active}
                onSelect={onClose}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      className="site-search-icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" />
    </svg>
  );
}

export function SiteSearch() {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [inlineOpen, setInlineOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close inline popover when clicking outside, and overlay on Escape.
  useEffect(() => {
    if (!inlineOpen) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setInlineOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [inlineOpen]);

  useEffect(() => {
    if (!overlayOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [overlayOpen]);

  return (
    <div className="site-search" ref={wrapRef}>
      {/* Desktop: always-visible 200px input that expands its result panel
          on focus. */}
      <div className="site-search-inline">
        <button
          type="button"
          className="site-search-inline-trigger"
          onClick={() => setInlineOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={inlineOpen}
        >
          <SearchIcon />
          <span>Search states, cities…</span>
        </button>
        {inlineOpen ? (
          <SearchPanel mode="inline" onClose={() => setInlineOpen(false)} />
        ) : null}
      </div>

      {/* Sub-980px: icon-only trigger that opens a fullscreen overlay. */}
      <button
        type="button"
        className="site-search-icon-trigger"
        onClick={() => setOverlayOpen(true)}
        aria-label="Open search"
      >
        <SearchIcon />
      </button>
      {overlayOpen ? (
        <div className="site-search-overlay" role="dialog" aria-modal="true">
          <SearchPanel mode="overlay" onClose={() => setOverlayOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
