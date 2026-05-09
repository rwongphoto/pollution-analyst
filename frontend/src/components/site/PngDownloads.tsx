"use client";

import { useEffect } from "react";

const PROCESSED_ATTR = "data-png-processed";
const BG = "#0E1116";
const FG = "#E8ECF2";
const FG_2 = "#BFC6D4";
const FG_3 = "#8A93A6";
const LINE = "#2A3142";

// Mounts once at the root layout. On hydration, scans the DOM for shareable
// modules — tables (class "tbl"), chart SVGs (role="img" + aria-label),
// card grids (.cities-grid), and named sections (section[id]) — and
// injects a "DOWNLOAD PNG" button above each. Clicking rasterises the
// target with html2canvas-pro and composites a self-contained PNG: title
// (nearest heading), snapshot, divider, Pollution Analyst brand mark, and
// page URL. Sections capture their inner `.wrap` so the full-bleed
// background tint isn't included in the image.
export function PngDownloads() {
  useEffect(() => {
    let cancelled = false;

    const attach = () => {
      if (cancelled) return;
      document.querySelectorAll<HTMLTableElement>("table.tbl").forEach((t) => {
        attachButton(t, "table");
      });
      document
        .querySelectorAll<SVGSVGElement>('svg[role="img"][aria-label]')
        .forEach((svg) => {
          const r = svg.getBoundingClientRect();
          if (r.width >= 200 && r.height >= 80) {
            attachButton(svg, "chart");
          }
        });
      document
        .querySelectorAll<HTMLElement>(".cities-grid")
        .forEach((g) => attachButton(g, "grid"));
      // Opt-in marker for heterogeneous modules (e.g. Equity Context where
      // the cities-grid alone misses the EJ indicators list below it).
      document
        .querySelectorAll<HTMLElement>("[data-pngable]")
        .forEach((m) => attachButton(m, "module"));
    };

    attach();
    // Some pages mount content asynchronously (BackToTop visibility, jump
    // strips, etc.). Re-scan a couple of frames later as a safety net.
    const t1 = window.setTimeout(attach, 250);
    const t2 = window.setTimeout(attach, 1000);

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return null;
}

type Kind = "table" | "chart" | "grid" | "module";

function attachButton(el: Element, kind: Kind) {
  if (el.hasAttribute(PROCESSED_ATTR)) return;
  el.setAttribute(PROCESSED_ATTR, "1");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "png-export-btn";
  btn.setAttribute("aria-label", "Download as PNG");
  btn.title = "Download as PNG";
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg><span>Download PNG</span>`;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    void downloadPng(el, kind, btn);
  });

  // Anchor placement strategy varies by kind so the button always sits
  // above the visual block without disrupting layout.
  if (kind === "chart") {
    const anchor = el.parentElement ?? el;
    anchor.parentNode?.insertBefore(btn, anchor);
    return;
  }
  if (kind === "module") {
    // Opt-in module: place the button at the top of the marked element.
    el.insertBefore(btn, el.firstChild);
    return;
  }
  // table or grid: previous sibling.
  el.parentNode?.insertBefore(btn, el);
}

async function downloadPng(el: Element, kind: Kind, btn: HTMLButtonElement) {
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = "<span>Rendering…</span>";

  // Hide every export button from the snapshot so they don't appear in
  // the PNG when capturing a section that contains nested per-table /
  // per-grid buttons.
  const allBtns = Array.from(
    document.querySelectorAll<HTMLElement>(".png-export-btn"),
  );
  const prevDisplay = allBtns.map((b) => b.style.display);
  allBtns.forEach((b) => (b.style.display = "none"));
  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    const mod = await import("html2canvas-pro");
    const html2canvas = mod.default;

    const target: HTMLElement =
      kind === "chart"
        ? ((el.parentElement ?? el) as HTMLElement)
        : (el as HTMLElement);

    const snapshot = await html2canvas(target, {
      backgroundColor: BG,
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const title = findNearestHeading(el) ?? "Pollution Analyst";
    const final = await composeFinal(snapshot, title, window.location.href);
    const filename = sanitizeFilename(title) + ".png";
    final.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after a tick so Safari has time to start the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    }, "image/png");
  } catch (err) {
    console.error("PNG export failed", err);
  } finally {
    allBtns.forEach((b, i) => (b.style.display = prevDisplay[i]));
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

function findNearestHeading(el: Element): string | null {
  // Walk up to a section/article/main and search for the first h1/h2/h3
  // that precedes the element in document order. Falls back to the
  // document <h1> if nothing is found locally.
  let scope: Element | null = el.parentElement;
  while (scope) {
    const tag = scope.tagName.toLowerCase();
    if (tag === "section" || tag === "article" || tag === "main") break;
    scope = scope.parentElement;
  }
  const root = scope ?? document.body;
  const headings = root.querySelectorAll<HTMLElement>("h1, h2, h3");
  let best: string | null = null;
  for (const h of Array.from(headings)) {
    const pos = el.compareDocumentPosition(h);
    const before = (pos & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
    if (before || h.contains(el)) {
      best = (h.textContent ?? "").trim() || best;
    }
  }
  if (!best) {
    const h1 = document.querySelector("h1");
    best = h1?.textContent?.trim() ?? null;
  }
  return best;
}

function sanitizeFilename(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "pollution-analyst"
  );
}

async function composeFinal(
  snapshot: HTMLCanvasElement,
  title: string,
  pageUrl: string,
): Promise<HTMLCanvasElement> {
  const scale = 2;
  const padX = 32 * scale;
  const padTop = 28 * scale;
  const titleSize = 22 * scale;
  const titleGap = 24 * scale;
  const footerGap = 24 * scale;
  const footerH = 56 * scale;

  // Cap the snapshot width so very wide tables don't blow out the PNG.
  const maxSnapW = 2400; // device pixels
  const drawSnapW = Math.min(snapshot.width, maxSnapW);
  const drawSnapH = (snapshot.height * drawSnapW) / snapshot.width;

  const finalW = drawSnapW + padX * 2;
  const finalH =
    padTop + titleSize + titleGap + drawSnapH + footerGap + footerH;

  const canvas = document.createElement("canvas");
  canvas.width = finalW;
  canvas.height = finalH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return snapshot;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, finalW, finalH);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = FG;
  ctx.font = `600 ${titleSize}px Inter, -apple-system, BlinkMacSystemFont, sans-serif`;
  drawWrappedText(
    ctx,
    title,
    padX,
    padTop + titleSize,
    finalW - padX * 2,
    titleSize * 1.25,
    2,
  );

  ctx.drawImage(
    snapshot,
    padX,
    padTop + titleSize + titleGap,
    drawSnapW,
    drawSnapH,
  );

  // Divider above footer
  const footerY = padTop + titleSize + titleGap + drawSnapH + footerGap;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1 * scale;
  ctx.beginPath();
  ctx.moveTo(padX, footerY);
  ctx.lineTo(finalW - padX, footerY);
  ctx.stroke();

  // Footer: brand mark + name (left), URL (right)
  await drawBrandFooter(ctx, padX, footerY + 8 * scale, scale);
  drawFooterRight(ctx, pageUrl, finalW - padX, footerY + 8 * scale, scale);

  return canvas;
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const next = current ? current + " " + w : w;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines) {
    // Truncate last line with ellipsis if more text remains.
    const last = lines[maxLines - 1];
    const remaining = words.slice(words.indexOf(last.split(" ").pop()!) + 1);
    if (remaining.length > 0) {
      let truncated = last;
      while (
        ctx.measureText(truncated + "…").width > maxWidth &&
        truncated.length > 0
      ) {
        truncated = truncated.slice(0, -1);
      }
      lines[maxLines - 1] = truncated + "…";
    }
  }
  lines.forEach((line, i) => {
    ctx.fillText(line, x, y + i * lineHeight);
  });
}

async function drawBrandFooter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
) {
  const markSize = 32 * scale;
  const img = await loadBrandMark(markSize);
  ctx.drawImage(img, x, y, markSize, markSize);

  const labelX = x + markSize + 10 * scale;
  ctx.fillStyle = FG;
  ctx.font = `600 ${15 * scale}px Inter, -apple-system, sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Pollution Analyst", labelX, y + markSize / 2 + 1 * scale);

  ctx.fillStyle = FG_3;
  ctx.font = `500 ${10 * scale}px JetBrains Mono, ui-monospace, monospace`;
  ctx.fillText(
    "POLLUTIONANALYST.COM",
    labelX,
    y + markSize / 2 + 16 * scale,
  );
}

function drawFooterRight(
  ctx: CanvasRenderingContext2D,
  pageUrl: string,
  rightX: number,
  y: number,
  scale: number,
) {
  let display = pageUrl;
  try {
    const u = new URL(pageUrl);
    display = u.host + u.pathname;
  } catch {
    /* keep raw */
  }
  // Trim trailing slash for cleanliness
  display = display.replace(/\/$/, "");

  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = FG_2;
  ctx.font = `500 ${11 * scale}px JetBrains Mono, ui-monospace, monospace`;
  ctx.fillText("SOURCE", rightX, y + 14 * scale);
  ctx.fillStyle = FG;
  ctx.font = `500 ${12 * scale}px JetBrains Mono, ui-monospace, monospace`;
  // Truncate long URLs from the left so the most specific path stays visible.
  const maxW = 600 * scale;
  let trimmed = display;
  while (ctx.measureText(trimmed).width > maxW && trimmed.length > 4) {
    trimmed = trimmed.slice(1);
  }
  if (trimmed !== display) trimmed = "…" + trimmed.slice(1);
  ctx.fillText(trimmed, rightX, y + 30 * scale);
  ctx.textAlign = "start";
}

let cachedBrandImg: { size: number; img: HTMLImageElement } | null = null;

function loadBrandMark(size: number): Promise<HTMLImageElement> {
  if (cachedBrandImg && cachedBrandImg.size === size) {
    return Promise.resolve(cachedBrandImg.img);
  }
  return new Promise((resolve, reject) => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
  <defs>
    <linearGradient id="smoke" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#E6B450" stop-opacity="0.95"/>
      <stop offset="0.55" stop-color="#D97A30" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#C44545" stop-opacity="0.55"/>
    </linearGradient>
  </defs>
  <g>
    <circle cx="14" cy="20" r="3.0" fill="url(#smoke)" opacity="0.55"/>
    <circle cx="18" cy="14" r="3.8" fill="url(#smoke)" opacity="0.75"/>
    <circle cx="13" cy="11" r="2.6" fill="url(#smoke)" opacity="0.6"/>
    <circle cx="32" cy="8"  r="4.6" fill="url(#smoke)" opacity="0.85"/>
    <circle cx="38" cy="13" r="3.4" fill="url(#smoke)" opacity="0.7"/>
    <circle cx="26" cy="13" r="3.2" fill="url(#smoke)" opacity="0.65"/>
    <circle cx="50" cy="18" r="3.2" fill="url(#smoke)" opacity="0.6"/>
    <circle cx="46" cy="13" r="3.6" fill="url(#smoke)" opacity="0.75"/>
    <circle cx="54" cy="13" r="2.4" fill="url(#smoke)" opacity="0.55"/>
  </g>
  <g fill="${FG}">
    <rect x="11" y="22" width="8"  height="34" rx="1.2"/>
    <rect x="9"  y="22" width="12" height="2.6" rx="0.6"/>
    <rect x="28" y="18" width="10" height="38" rx="1.4"/>
    <rect x="26" y="18" width="14" height="3"   rx="0.7"/>
    <rect x="46" y="22" width="8"  height="34" rx="1.2"/>
    <rect x="44" y="22" width="12" height="2.6" rx="0.6"/>
  </g>
</svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      cachedBrandImg = { size, img };
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
