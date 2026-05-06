import Link from "next/link";

import { Brand } from "./Brand";

export function SiteFooter({ briefingLabel }: { briefingLabel?: string }) {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="grid">
          <div>
            <Brand small />
            <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 14, maxWidth: "32ch" }}>
              Pollution trend intelligence built from federal public data. Methodology-first. Updated on each source&apos;s native cadence.
            </p>
          </div>
          <nav className="col" aria-label="Surfaces">
            <p className="col-title">Surfaces</p>
            <Link href="/state/ca">States</Link>
            <Link href="/state/ca/county/kern">Counties</Link>
            <Link href="/state/ca/city/stockton">Cities</Link>
            <Link href="/state/ca/facility/chevron-products-co-richmond-refinery">Facilities (TRI)</Link>
          </nav>
          <nav className="col" aria-label="Methodology">
            <p className="col-title">Method</p>
            <Link href="/methodology">Methodology overview</Link>
            <Link href="/methodology#equity">Equity overlay stance</Link>
            <Link href="/methodology#sources">Data sources</Link>
          </nav>
          <nav className="col" aria-label="Elsewhere">
            <p className="col-title">Elsewhere</p>
            <a href="https://www.publicanalyst.ai" target="_blank" rel="noreferrer">Public Analyst.ai</a>
          </nav>
        </div>
        <div className="legal">
          <span>© {new Date().getFullYear()} Pollution Analyst</span>
          <span>Built on federal public-domain data{briefingLabel ? ` · ${briefingLabel}` : ""}</span>
        </div>
      </div>
    </footer>
  );
}
