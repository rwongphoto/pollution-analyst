import type { Metadata } from "next";
import Link from "next/link";

import { Ic } from "@/components/site/icons";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Sparkline } from "@/components/site/Sparkline";
import { USMapClient } from "@/components/site/USMapClient";
import { loadCounty, loadHome, loadNationalCountyBurdens, loadSiteCounts, loadStateMapSummaries } from "@/lib/data";
import { SITE_URL } from "@/lib/seo";
import type { FeaturedEntity } from "@/lib/types";

const HOME_DESCRIPTION =
  "Federal pollution data, made readable. TRI factory releases, AQS air-monitor readings, AirToxScreen cancer risk, SDWIS drinking-water violations, and CDC health rates — paired with the demographic context for who lives next to it.";

const HOME_TITLE = "Pollution Trend Intelligence | Pollution Analyst";

export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { url: "/", title: HOME_TITLE, description: HOME_DESCRIPTION },
  twitter: { title: HOME_TITLE, description: HOME_DESCRIPTION },
};

const KIND_LABEL: Record<FeaturedEntity["kind"], string> = {
  facility: "TRI FACILITY",
  water: "PUBLIC WATER SYSTEM",
  superfund: "SUPERFUND / NPL SITE",
  city: "CITY",
  county: "COUNTY",
};

const KIND_HREF: Record<FeaturedEntity["kind"], (e: FeaturedEntity) => string> = {
  facility: (e) => `/state/${e.state}/facility/${e.slug}`,
  water: (e) => `/state/${e.state}/water/${e.slug}`,
  superfund: (e) => `/state/${e.state}/superfund/${e.slug}`,
  city: (e) => `/state/${e.state}/city/${e.slug}`,
  county: (e) => `/state/${e.state}/county/${e.slug}`,
};

const KIND_COLOR: Record<FeaturedEntity["kind"], string> = {
  facility: "#FF6B6B",
  water: "#22D3EE",
  superfund: "#E6B450",
  city: "#6FCF97",
  county: "#A78BFA",
};

function HomeHero({ totals, citiesTracked, briefingLabel }: {
  totals: { facilities_tracked: number; utilities_tracked: number; superfund_tracked: number; counties_covered: number; chemicals_indexed: number };
  citiesTracked: number;
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
              We turn EPA, AQS, AirToxScreen, and CDC PLACES into something a person can actually read. Multi-decade chemical-release histories at the factory, air-monitor readings rolled up to your county, drinking-water violations for your utility, hazardous-air cancer risk where you live — paired with the demographic context for who lives next to it.
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
                <span>SUPERFUND SITES</span>
                <span>{(totals.superfund_tracked ?? 0).toLocaleString()}</span>
              </li>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>COUNTIES</span>
                <span>{totals.counties_covered.toLocaleString()}</span>
              </li>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>CITIES</span>
                <span>{citiesTracked.toLocaleString()}</span>
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

function StartHereSection() {
  const surfaces = [
    {
      label: "COUNTY RANKINGS",
      title: "Most Polluted Counties",
      desc: "Top 10 nationally, ranked by PM2.5, lifetime cancer risk (AirToxScreen), TRI air releases, and greenhouse-gas emissions — one table per indicator.",
      href: "/rankings/counties",
      cta: "See county rankings",
    },
    {
      label: "CITY RANKINGS",
      title: "Most Polluted Cities",
      desc: "City-grain rankings on TRI air releases, plus the county-derived measures (PM2.5, AirToxScreen) attached to each city's containing county.",
      href: "/rankings/cities",
      cta: "See city rankings",
    },
    {
      label: "FACILITY RANKINGS",
      title: "Most Polluting Facilities",
      desc: "Industrial facilities reporting the largest TRI chemical releases — split into total, air, water, and land so you can see who tops each medium.",
      href: "/rankings/facilities",
      cta: "See facility rankings",
    },
  ];
  return (
    <section className="section section-tint">
      <div className="wrap">
        <div style={{ marginBottom: 40 }}>
          <div className="eyebrow">Where to start</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            Most Polluted, At Every Scale
          </h2>
          <p className="lead" style={{ maxWidth: "62ch", marginTop: 14 }}>
            Pollution data lives at different scales because the questions do. Pick the ranking that matches what you actually want to know — counties, cities, or industrial facilities.
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

function NationalMapSection({
  burdens,
  stateSummaries,
  reportingYear,
  statesCovered,
}: {
  burdens: { fips: string; total_releases_pounds: number }[];
  stateSummaries: import("@/lib/data").StateMapSummary[];
  reportingYear: number;
  statesCovered: number;
}) {
  return (
    <section className="section" id="map">
      <div className="wrap">
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">Where the pollution sits</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            National TRI Choropleth, County By County
          </h2>
          <p style={{ fontSize: 15, marginTop: 10, maxWidth: "62ch" }}>
            Every published county shaded by its EPA Toxics Release Inventory total — pounds of toxic chemicals released to air, water, and land. Darker counties report more. Counties in states not yet ingested render as &ldquo;no TRI data&rdquo;.
          </p>
          <p className="muted" style={{ fontSize: 14, marginTop: 6, maxWidth: "62ch" }}>
            Shaded by {reportingYear} TRI reporting-year totals across {statesCovered} ingested states. Hover a county for its state summary; click to open the state page.
          </p>
        </div>
        <USMapClient burdens={burdens} stateSummaries={stateSummaries} />
      </div>
    </section>
  );
}

function PrinciplesSection() {
  const items = [
    { ic: Ic.trend,  t: "Trend, Not Totals", d: "TRI volumes are noisy year over year but tell a strong long-arc story. We surface the multi-decade direction, not just last year's number." },
    { ic: Ic.shield, t: "Equity in Plain Sight", d: "EPA's EJScreen pairs pollution with population characteristics. We surface those indexes on every entity and county page — they're not buried in a footnote." },
    { ic: Ic.layers, t: "Federal-Only Sources",  d: "EPA TRI and GHGRP for industrial releases, AQS for criteria air pollutants, AirToxScreen for hazardous-air cancer risk, SDWIS for drinking water, CDC PLACES for community health, Census ACS for demographics. All public-domain, all reproducible." },
    { ic: Ic.doc,    t: "Methodology Open",     d: "Every metric, every threshold, every caveat is on the methodology page. Read the rules; reproduce the numbers." },
  ];
  return (
    <section className="section">
      <div className="wrap">
        <div className="how-intro-grid">
          <div>
            <div className="eyebrow">How it works</div>
            <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
              Four Principles For Federal Pollution Data
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
            Three Pollution Trends Worth A Read
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

function EquityBand({
  indexes,
  geographyLabel,
}: {
  indexes: { label: string; pct_us: number }[];
  geographyLabel: string;
}) {
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
              Environmental Justice Context On <em className="h-italic">Every Pollution Page</em>
            </h2>
            <p className="lead" style={{ margin: "0 0 24px", maxWidth: "48ch" }}>
              We pair every pollution surface with the population context — demographic shares, EPA-style national percentiles per indicator, and EJ disparity scores — so readers can see who lives next to the burden, not just the pounds released.
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
              NATIONAL PERCENTILE · {geographyLabel.toUpperCase()}
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
              {indexes.map((row) => {
                const pct = row.pct_us;
                return (
                  <li key={row.label} style={{ display: "grid", gridTemplateColumns: "1fr 60px", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "var(--fg-2)" }}>{row.label}</span>
                    <span className="num-mono" style={{ textAlign: "right", color: pct >= 90 ? "var(--red)" : pct >= 80 ? "var(--amber)" : "var(--fg-2)" }}>
                      {pct.toFixed(0)}
                    </span>
                    <span style={{ gridColumn: "1 / -1", height: 4, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", width: `${pct}%`, background: pct >= 90 ? "var(--red)" : pct >= 80 ? "var(--amber)" : "var(--blue)" }} />
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
              Percentile rank vs all US block groups, population-weighted. 80th and above warrants a closer look.
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
            Browse Kern County <Ic.arrow s={14} />
          </Link>
          <Link href="/state/ca/facility/chevron-products-co-richmond-refinery" className="btn btn-ghost">
            Chevron Richmond Refinery
          </Link>
          <Link href="/state/ca/city/stockton" className="btn btn-ghost">
            Stockton city hub
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
  const [data, kern, siteCounts, nationalBurdens, stateSummaries] = await Promise.all([
    loadHome(),
    loadCounty("ca", "kern"),
    loadSiteCounts(),
    loadNationalCountyBurdens(),
    loadStateMapSummaries(),
  ]);
  const kernTopIndexes = [...kern.equity.ej_indexes]
    .sort((a, b) => b.pct_us - a.pct_us)
    .slice(0, 5)
    .map(({ label, pct_us }) => ({ label, pct_us }));
  const kernGeoLabel = `${kern.county.name}, ${kern.county.state.toUpperCase()}`;
  const citiesTracked = siteCounts.city;
  const statesCovered = new Set(nationalBurdens.map((b) => b.fips.slice(0, 2))).size;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: "Pollution Analyst",
        description: HOME_DESCRIPTION,
        publisher: { "@id": `${SITE_URL}/#org` },
        inLanguage: "en-US",
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#org`,
        name: "Pollution Analyst",
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
        <HomeHero totals={data.totals} citiesTracked={citiesTracked} briefingLabel={data.briefing_label} />
        <StartHereSection />
        <NationalMapSection
          burdens={nationalBurdens}
          stateSummaries={stateSummaries}
          reportingYear={data.reporting_year}
          statesCovered={statesCovered}
        />
        <PrinciplesSection />
        <FeaturedSection featured={data.featured} />
        <EquityBand indexes={kernTopIndexes} geographyLabel={kernGeoLabel} />
        <HomeCTA />
      </main>
      <SiteFooter briefingLabel={data.briefing_label} />
    </>
  );
}
