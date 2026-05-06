"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { LIVE_STATES } from "../../lib/states";
import { Brand } from "./Brand";

type Active =
  | "home"
  | "facility"
  | "city"
  | "water"
  | "county"
  | "state"
  | "method"
  | "rankings-states"
  | "rankings-counties"
  | "rankings-cities"
  | "rankings-facilities"
  | undefined;

export function SiteHeader({ active }: { active?: Active }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [statesOpen, setStatesOpen] = useState(false);
  const statesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mobileOpen && !statesOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setStatesOpen(false);
      setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, statesOpen]);

  useEffect(() => {
    if (!statesOpen) return;
    const onClick = (e: MouseEvent) => {
      if (statesRef.current && !statesRef.current.contains(e.target as Node)) {
        setStatesOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [statesOpen]);

  const closeAll = () => {
    setStatesOpen(false);
    setMobileOpen(false);
  };

  return (
    <header className={`site-header ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="wrap row">
        <Brand />
        <nav className="site-nav" aria-label="Primary" id="site-nav">
          <div
            ref={statesRef}
            className={`nav-item ${statesOpen ? "open" : ""}`}
          >
            {/* Parent button intentionally has no href — `/rankings/states`
                is unbuilt. Swap to <Link href="/rankings/states"> when that
                page ships. */}
            <button
              type="button"
              className={active === "state" || active === "rankings-states" ? "active" : ""}
              aria-haspopup="menu"
              aria-expanded={statesOpen}
              onClick={() => setStatesOpen((v) => !v)}
            >
              States
              <span className="caret" aria-hidden="true" />
            </button>
            <div className="submenu" role="menu">
              {LIVE_STATES.map((s) => (
                <Link
                  key={s.slug}
                  href={`/state/${s.slug}`}
                  role="menuitem"
                  onClick={closeAll}
                >
                  <span>{s.name}</span>
                  <span className="sub-meta">{s.abbr}</span>
                </Link>
              ))}
            </div>
          </div>
          <Link
            href="/rankings/counties"
            className={active === "rankings-counties" ? "active" : ""}
            onClick={closeAll}
          >
            Counties
          </Link>
          <Link
            href="/rankings/cities"
            className={active === "rankings-cities" ? "active" : ""}
            onClick={closeAll}
          >
            Cities
          </Link>
          <Link
            href="/rankings/facilities"
            className={active === "rankings-facilities" ? "active" : ""}
            onClick={closeAll}
          >
            Facilities
          </Link>
          <Link
            href="/methodology"
            className={active === "method" ? "active" : ""}
            onClick={closeAll}
          >
            Methodology
          </Link>
        </nav>
        <div className="header-actions">
          <Link href="/methodology" className="btn btn-primary btn-sm cta-desktop">
            How it works<span style={{ marginLeft: 4 }}>→</span>
          </Link>
          <button
            type="button"
            className="nav-toggle"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="site-nav"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <span className="nav-toggle-bars" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
