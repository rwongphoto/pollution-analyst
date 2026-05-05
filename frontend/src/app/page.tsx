import type { Metadata } from "next";
import Link from "next/link";

import { Ic } from "@/components/site/icons";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Sparkline } from "@/components/site/Sparkline";
import { loadHome } from "@/lib/data";
import { SITE_URL } from "@/lib/seo";
import type { FeaturedEntity } from "@/lib/types";

const HOME_DESCRIPTION =
  "Pollution trend intelligence built from federal public data — facility releases, drinking-water violations, and equity context at county and entity scale.";

const HOME_TITLE = "Pollution Trend Intelligence | Pollution Analyst.ai";

export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { url: "/", title: HOME_TITLE, description: HOME_DESCRIPTION },
  twitter: { title: HOME_TITLE, description: HOME_DESCRIPTION },
};

const KIND_LABEL: Record<FeaturedEntity["kind"], string> = {
  facility: "TRI FACILITY",
  city: "CITY · PUBLIC WATER SYSTEM",
  county: "COUNTY",
};

const KIND_HREF: Record<FeaturedEntity["kind"], (e: FeaturedEntity) => string> = {
  facility: (e) => `/state/${e.state}/facility/${e.slug}`,
  city: (e) => `/state/${e.state}/city/${e.slug}`,
  county: (e) => `/state/${e.state}/county/${e.slug}`,
};

const KIND_COLOR: Record<FeaturedEntity["kind"], string> = {
  facility: "#FF6B6B",
  city: "#22D3EE",
  county: "#A78BFA",
};

function HomeHero({ totals, briefingLabel }: {
  totals: { facilities_tracked: number; utilities_tracked: number; counties_covered: number; chemicals_indexed: number };
  briefingLabel: string;
}) {
  return (
    <section className="home-hero">
      <div className="wrap">
        <div className="grid">
          <div>
            <div className="eyebrow">Pollution trend intelligence · public data</div>
            <h1>
              Federal pollution data — what&apos;s actually <em>changing</em>, and who lives next to it
            </h1>
            <p className="lead lede">
              Pollution Analyst.ai turns EPA&apos;s public datasets into <strong>tracked trends</strong>, facility-level histories, and county-level overviews — paired with EPA&apos;s own equity indexes so the population context is visible, not buried.
            </p>
            <div className="actions">
              <Link href="/state/ca/county/kern" className="btn btn-primary">
                Browse a county <Ic.arrow s={14} />
              </Link>
              <Link href="/state/ca/facility/chevron-products-co-richmond-refinery" className="btn btn-ghost">
                See a facility
              </Link>
              <Link href="/methodology" className="btn btn-ghost">
                How it works
              </Link>
            </div>
          </div>
          <aside style={{ borderLeft: "1px solid var(--rule)", paddingLeft: 32 }}>
            <div className="kicker" style={{ marginBottom: 10 }}>{briefingLabel}</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>FACILITIES (TRI)</span>
                <span>{totals.facilities_tracked.toLocaleString()}</span>
              </li>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>UTILITIES (SDWIS)</span>
                <span>{totals.utilities_tracked.toLocaleString()}</span>
              </li>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>COUNTIES</span>
                <span>{totals.counties_covered.toLocaleString()}</span>
              </li>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--rule)", paddingTop: 8, marginTop: 4 }}>
                <span>CHEMICALS INDEXED</span>
                <span>{totals.chemicals_indexed.toLocaleString()}</span>
              </li>
            </ul>
          </aside>
        </div>
      </div>
    </section>
  );
}

function SurfacesSection() {
  const surfaces = [
    {
      label: "TIER 1 · ENTITY",
      title: "Facility & utility pages",
      desc: "One page per TRI facility and per SDWIS public water system. Search intent: people Googling the plant, refinery, or utility serving them.",
      href: "/state/ca/facility/chevron-products-co-richmond-refinery",
      cta: "Open a facility",
    },
    {
      label: "TIER 2 · PLACE",
      title: "County aggregations",
      desc: "Every US county. TRI rolled up, GHG totals, and the EJScreen equity overlay for the population that lives there.",
      href: "/state/ca/county/kern",
      cta: "Open a county",
    },
    {
      label: "TIER 3 · NEIGHBORHOOD",
      title: "Coming after launch",
      desc: "NATA + EJScreen rolled up to neighborhood polygons in cities with curated boundaries. Gated by polygon availability; additive on top of Tiers 1 and 2.",
      href: "/methodology",
      cta: "Read methodology",
    },
  ];
  return (
    <section className="section section-tint">
      <div className="wrap">
        <div style={{ marginBottom: 40 }}>
          <div className="eyebrow">Coverage</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            Three programmatic surfaces
          </h2>
          <p className="lead" style={{ maxWidth: "62ch", marginTop: 14 }}>
            Pollution data is geographically anchored at multiple scales. We render at all three so the search intent — &ldquo;is this plant safe,&rdquo; &ldquo;what&apos;s in this county,&rdquo; &ldquo;how does my neighborhood compare&rdquo; — has a matching surface.
          </p>
        </div>
        <div className="cities-grid">
          {surfaces.map((s) => (
            <Link key={s.label} href={s.href} className="city-tile live">
              <div className="tile-meta"><span>{s.label}</span></div>
              <h3>{s.title}</h3>
              <p className="desc">{s.desc}</p>
              <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--blue)", fontSize: 13, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {s.cta} <Ic.arrow s={13} />
                </span>
                <span className="meta-mono">→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function PrinciplesSection() {
  const items = [
    { ic: Ic.trend,  t: "Trend, not totals", d: "TRI volumes are noisy year over year but tell a strong long-arc story. We surface the multi-decade direction, not just last year's number." },
    { ic: Ic.shield, t: "Equity in plain sight", d: "EPA's EJScreen pairs pollution with population characteristics. We surface those indexes on every entity and county page — they're not buried in a footnote." },
    { ic: Ic.layers, t: "Federal-only sources",  d: "Every dataset is public-domain federal data. No commercial sensors, no proprietary indices, no paywall. Reproducibility is the default." },
    { ic: Ic.doc,    t: "Methodology open",     d: "Every metric, every threshold, every caveat is on the methodology page. Read the rules; reproduce the numbers." },
  ];
  return (
    <section className="section">
      <div className="wrap">
        <div className="how-intro-grid">
          <div>
            <div className="eyebrow">How it works</div>
            <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
              Four principles
            </h2>
          </div>
          <p className="lead" style={{ margin: 0, maxWidth: "60ch" }}>
            EPA&apos;s data is rich, public, and underused outside compliance offices. We built this so the analytics-and-narrative layer most people actually need is one URL away.
          </p>
        </div>
        <div className="principles">
          {items.map((p, i) => (
            <div key={i} className="principle">
              <div className="ic"><p.ic s={26} /></div>
              <h3>{p.t}</h3>
              <p>{p.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturedSection({ featured }: { featured: FeaturedEntity[] }) {
  return (
    <section className="section section-tint">
      <div className="wrap">
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow">Featured this update</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            Three places to start
          </h2>
        </div>
        <div className="anomaly-strip">
          {featured.slice(0, 3).map((e) => {
            const href = KIND_HREF[e.kind](e);
            const color = KIND_COLOR[e.kind];
            return (
              <div key={`${e.kind}-${e.state}-${e.slug}`} className={`anomaly-card ${e.kind === "city" ? "rare" : e.kind === "facility" ? "spike" : "drop"}`}>
                <div className="head">
                  <span className="chip ink">{KIND_LABEL[e.kind]} · {e.state_label.toUpperCase()}</span>
                </div>
                <h3>
                  <Link href={href} style={{ color: "inherit", textDecoration: "none" }}>
                    {e.name}
                  </Link>
                </h3>
                <p>{e.headline}</p>
                <p className="meta-mono" style={{ color: "var(--fg-3)", fontSize: 11, marginTop: 12 }}>
                  {e.metric_label.toUpperCase()} · {e.metric_value}
                </p>
                {e.trend_24mo && e.trend_24mo.length > 0 && (
                  <div style={{ marginTop: 14, height: 44 }}>
                    <Sparkline values={e.trend_24mo} width={400} height={44} color={color} strokeWidth={1.7} />
                  </div>
                )}
                <Link
                  href={href}
                  style={{ color: "var(--blue)", fontSize: 13, marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  Read the page <Ic.arrow s={13} />
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function EquityBand() {
  return (
    <section className="story-band">
      <div className="wrap">
        <div className="city-showcase" style={{ alignItems: "center" }}>
          <div>
            <div className="eyebrow">Methodology divergence</div>
            <h2
              className="h-display"
              style={{ fontSize: "clamp(32px,3.6vw,48px)", margin: "12px 0 18px", lineHeight: 1.05 }}
            >
              Equity context, paired — <em className="h-italic">not buried</em>.
            </h2>
            <p className="lead" style={{ margin: "0 0 24px", maxWidth: "48ch" }}>
              EPA&apos;s EJScreen pairs pollution exposure with the demographics of the people exposed. We surface those indexes verbatim on every facility and county page, with attribution. The reasoning behind this — and why it&apos;s a deliberate inversion of our companion crime site&apos;s stance on demographics — is documented in full.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/methodology#equity" className="btn btn-primary">
                Read the equity-overlay stance <Ic.arrow s={14} />
              </Link>
              <Link href="/state/ca/county/kern#equity" className="btn btn-ghost">
                See it on a county page
              </Link>
            </div>
          </div>
          <div
            style={{
              background: "var(--graphite)",
              borderRadius: 10,
              border: "1px solid var(--line-2)",
              padding: 24,
            }}
          >
            <div className="meta-mono" style={{ color: "#BFC6D4", fontSize: 11, letterSpacing: "0.08em", marginBottom: 16 }}>
              EJSCREEN INDEX · HARRIS COUNTY, TX
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
              {[
                { label: "Air toxics cancer risk", pct: 91 },
                { label: "Air toxics respiratory hazard", pct: 88 },
                { label: "Particulate matter (PM2.5)", pct: 79 },
                { label: "Toxic releases to air", pct: 97 },
                { label: "Diesel particulate", pct: 90 },
              ].map((row) => (
                <li key={row.label} style={{ display: "grid", gridTemplateColumns: "1fr 60px", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "var(--fg-2)" }}>{row.label}</span>
                  <span className="num-mono" style={{ textAlign: "right", color: row.pct >= 90 ? "var(--red)" : row.pct >= 80 ? "var(--amber)" : "var(--fg-2)" }}>
                    {row.pct}
                  </span>
                  <span style={{ gridColumn: "1 / -1", height: 4, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${row.pct}%`, background: row.pct >= 90 ? "var(--red)" : row.pct >= 80 ? "var(--amber)" : "var(--blue)" }} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
              Percentile rank vs all US block groups. EPA flags 80th-percentile-and-above for closer examination.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeCTA() {
  return (
    <section className="section" style={{ textAlign: "center" }}>
      <div className="wrap-narrow">
        <p
          className="h-display"
          style={{ fontWeight: 400, fontSize: "clamp(28px,3.6vw,46px)", lineHeight: 1.12, margin: 0, textWrap: "balance" }}
        >
          Federal pollution data, with the <em className="h-italic">analytics layer</em> already done.
        </p>
        <div style={{ marginTop: 32, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/state/ca/county/kern" className="btn btn-primary">
            Browse Harris County <Ic.arrow s={14} />
          </Link>
          <Link href="/state/ca/facility/chevron-products-co-richmond-refinery" className="btn btn-ghost">
            ExxonMobil Baytown
          </Link>
          <Link href="/state/mi/city/flint" className="btn btn-ghost">
            Flint, Michigan water
          </Link>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 18 }}>
          Free. No accounts. No tracking. Built on public-domain federal data.
        </p>
      </div>
    </section>
  );
}

export default async function HomePage() {
  const data = await loadHome();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: "Pollution Analyst.ai",
        description: HOME_DESCRIPTION,
        publisher: { "@id": `${SITE_URL}/#org` },
        inLanguage: "en-US",
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#org`,
        name: "Pollution Analyst.ai",
        url: `${SITE_URL}/`,
        description: HOME_DESCRIPTION,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader active="home" />
      <main>
        <HomeHero totals={data.totals} briefingLabel={data.briefing_label} />
        <SurfacesSection />
        <PrinciplesSection />
        <FeaturedSection featured={data.featured} />
        <EquityBand />
        <HomeCTA />
      </main>
      <SiteFooter briefingLabel={data.briefing_label} />
    </>
  );
}
