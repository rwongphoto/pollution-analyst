import type { Metadata } from "next";
import Link from "next/link";

import { NotableSignals } from "@/components/site/AnomalyCard";
import { Crumbs } from "@/components/site/Crumbs";
import { EquityStub } from "@/components/site/EquityStub";
import { HeroChart, MediaSplitBar } from "@/components/site/HeroChart";
import { Ic } from "@/components/site/icons";
import { JumpStrip } from "@/components/site/JumpStrip";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Sparkline } from "@/components/site/Sparkline";
import { loadFacility } from "@/lib/data";
import { cityHref, loadPlaceSlugs } from "@/lib/placeLinks";
import {
  isEquityStub,
  longArcLanguage,
  magnitudeLanguage,
  pctSigned,
  poundsFormat,
} from "@/lib/prose";
import { pageMeta, SITE_URL } from "@/lib/seo";
import type { ChemicalRelease, FacilityPagePayload } from "@/lib/types";

function facilityDescription(data: FacilityPagePayload): string {
  return `${data.facility.name} reported ${poundsFormat(data.totals.total_releases_pounds)} of TRI-tracked toxic releases in ${data.reporting_year}. ${data.totals.chemicals_reported} chemicals; equity context from EJScreen.`;
}

// Big tree: render on demand + 24h revalidate (the fast-deploy ISR model). The
// per-facility JSON is fetched from the data CDN at request time.
export const dynamicParams = true;
export const revalidate = 86400;

type RouteParams = { state: string; slug: string };

export async function generateStaticParams(): Promise<RouteParams[]> {
  return []; // pure on-demand: zero build-time big-tree reads (CDN-served at runtime)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { state, slug } = await params;
  const data = await loadFacility(state, slug);
  return pageMeta({
    title: `${data.facility.name} — TRI Releases | Pollution Analyst`,
    description: facilityDescription(data),
    path: `/state/${state}/facility/${slug}`,
  });
}

const CHEM_COLOR: Record<ChemicalRelease["category"], string> = {
  carcinogen: "#FF6B6B",
  pbt: "#E6B450",
  neurotoxin: "#A78BFA",
  respiratory: "#22D3EE",
  general: "#60A5FA",
};

const CHEM_LABEL: Record<ChemicalRelease["category"], string> = {
  carcinogen: "CARCINOGEN",
  pbt: "PBT",
  neurotoxin: "NEUROTOXIN",
  respiratory: "RESPIRATORY",
  general: "GENERAL",
};

function FacilityHero({ data }: { data: FacilityPagePayload }) {
  const f = data.facility;
  const t = data.totals;
  const yoyLanguage = magnitudeLanguage(t.yoy_pct_change);
  const longArcText = t.long_arc_pct_change != null
    ? longArcLanguage(t.long_arc_pct_change, "Total releases", t.long_arc_baseline_year)
    : null;
  return (
    <section className="home-hero">
      <div className="wrap">
        <div>
          <div className="eyebrow">TRI facility · {data.briefing_label}</div>
          <h1>{f.name}</h1>
          <p className="lead lede" style={{ maxWidth: "70ch" }}>
            Total reported releases <strong>{poundsFormat(t.total_releases_pounds)}</strong>{" "}
            {yoyLanguage} year over year ({pctSigned(t.yoy_pct_change)}).
            {longArcText ? <> {longArcText}</> : null}
          </p>
          <p className="muted" style={{ marginTop: 8 }}>
            {f.address}, {f.city}, {f.state_label} · {f.naics_label}
            {f.parent_company ? <> · operated by {f.parent_company}</> : null}
          </p>
          <div className="actions">
            <Link href={`/state/${f.state}/county/${f.county_slug}`} className="btn btn-primary">
              See {f.county} <Ic.arrow s={14} />
            </Link>
            <a href="#chemicals" className="btn btn-ghost">
              Chemicals
            </a>
            <a href="#equity" className="btn btn-ghost">
              Equity context
            </a>
            <Link href="/methodology" className="btn btn-ghost">
              How we read TRI
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr minmax(260px, 360px)", gap: 32, alignItems: "start" }}>
          <div>
            <div className="meta-mono" style={{ color: "var(--fg-3)", fontSize: 11, marginBottom: 6 }}>
              TOTAL RELEASES · {t.long_arc_baseline_year}–{data.reporting_year}
            </div>
            <HeroChart history={t.history} units="lb" color="var(--blue)" height={170} />
          </div>
          <aside style={{ borderLeft: "1px solid var(--rule)", paddingLeft: 24 }}>
            <div className="kicker" style={{ marginBottom: 10 }}>Release breakdown · {data.reporting_year}</div>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "grid", gap: 8 }}>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>AIR</span>
                <span>{poundsFormat(t.air_releases_pounds)}</span>
              </li>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>WATER</span>
                <span>{poundsFormat(t.water_releases_pounds)}</span>
              </li>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>LAND/OFF-SITE</span>
                <span>{poundsFormat(t.land_releases_pounds)}</span>
              </li>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--rule)", paddingTop: 8, marginTop: 4 }}>
                <span>CHEMICALS</span>
                <span>{t.chemicals_reported}</span>
              </li>
            </ul>
            <MediaSplitBar
              air={t.air_releases_pounds}
              water={t.water_releases_pounds}
              land={t.land_releases_pounds}
            />
          </aside>
        </div>
      </div>
    </section>
  );
}

function ChemicalsSection({ chemicals, facilityName }: { chemicals: ChemicalRelease[]; facilityName: string }) {
  return (
    <section className="section" id="chemicals">
      <div className="wrap">
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow">Chemicals reported · most recent year</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            What Toxic Chemicals {facilityName} Releases
          </h2>
        </div>
        <div className="cities-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {chemicals.map((c) => {
            const color = CHEM_COLOR[c.category];
            const values = c.history.map((p) => p.value);
            const years = c.history.map((p) => p.year);
            return (
              <div key={c.cas} className="city-tile live" style={{ cursor: "default" }}>
                <div className="tile-meta">
                  <span style={{ color }}>{CHEM_LABEL[c.category]}</span>
                  <span>CAS {c.cas}</span>
                </div>
                <h3>{c.chemical}</h3>
                <p className="meta-mono" style={{ margin: "4px 0 12px", fontSize: 12 }}>
                  {poundsFormat(c.total_pounds_recent)} · {pctSigned(c.yoy_pct_change)} YoY
                </p>
                <div style={{ height: 50, marginBottom: 12 }}>
                  <Sparkline values={values} years={years} width={260} height={50} color={color} strokeWidth={1.7} />
                </div>
                <p className="desc" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                  {longArcLanguage(c.long_arc_pct_change, c.chemical, c.long_arc_baseline_year)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function EquitySection({ data }: { data: FacilityPagePayload }) {
  // Facility equity is deliberately scoped to who lives within 3 miles —
  // pop-weighted block-group demographics. National-percentile and
  // EJ-disparity indicator scores are rendered on state, county, and city
  // pages; on a facility page they'd over-claim that the facility is
  // responsible for those wider indicator levels.
  const e = data.equity;
  if (isEquityStub(e)) {
    return (
      <EquityStub
        geographyLabel={e.geography_label}
        population={e.population}
        scopeLabel="Around this facility"
      />
    );
  }
  return (
    <section className="section section-tint" id="equity">
      <div className="wrap" data-pngable>
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">Equity context · ACS 2018-2022 block-group demographics</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            Who Lives Near {data.facility.name}
          </h2>
          <p className="lead" style={{ maxWidth: "62ch", marginTop: 14 }}>
            {e.geography_label}: a population of <strong>{e.population.toLocaleString()}</strong>.{" "}
            <Link href="/methodology#equity">Why we surface this →</Link>
          </p>
        </div>

        <div className="cities-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", marginBottom: 32 }}>
          {[
            { label: "Low-income", value: e.pct_low_income },
            { label: "People of color", value: e.pct_people_of_color },
            { label: "Under age 5", value: e.pct_under_5 },
            { label: "Over age 64", value: e.pct_over_64 },
          ].map((row) => (
            <div key={row.label} className="city-tile live" style={{ cursor: "default" }}>
              <div className="tile-meta"><span>POPULATION SHARE</span></div>
              <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--fg)" }}>
                {row.value == null ? "—" : `${row.value.toFixed(1)}%`}
              </div>
              <p className="desc" style={{ margin: 0 }}>{row.label}</p>
            </div>
          ))}
        </div>

        <p className="muted" style={{ fontSize: 12.5, marginTop: 14, maxWidth: "62ch" }}>
          Source: {e.source}. Indicator-level percentile and EJ-disparity scores are surfaced on the
          {" "}<Link href={`/state/${data.facility.state}/county/${data.facility.county_slug}#equity`}>county page</Link>
          {" "}and the state page — they describe wider regional exposure burdens, not effects attributable to a single facility.
        </p>
      </div>
    </section>
  );
}

function SourceFooter({ data }: { data: FacilityPagePayload }) {
  return (
    <section className="section" id="sources" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 24, fontSize: 13, color: "var(--ink-3)" }}>
          <p>
            <strong>Source.</strong>{" "}
            <a href={data.source.url} target="_blank" rel="noreferrer">{data.source.label}</a>{" "}
            · retrieved {data.source.retrieved}. Reporting year {data.reporting_year}. TRI is a federal public-domain dataset under 17 USC §105.
          </p>
          <p style={{ marginTop: 8 }}>
            <strong>What this is not.</strong> TRI quantifies releases reported by the facility under EPCRA §313 — not ambient air or water concentrations measured at receptors. We do not attribute individual health outcomes to specific facilities; that exceeds what the data can support.
          </p>
        </div>
      </div>
    </section>
  );
}

export default async function FacilityPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { state, slug } = await params;
  const [data, placeSlugs] = await Promise.all([loadFacility(state, slug), loadPlaceSlugs()]);
  const f = data.facility;
  const stateUrl = `${SITE_URL}/state/${state}`;
  const countyUrl = `${stateUrl}/county/${f.county_slug}`;
  // Link to the city hub only when one was actually published (the raw TRI city
  // string often maps to no hub, or a differently-slugged one).
  const cityPath = cityHref(placeSlugs, state, f.city);
  const cityUrl = cityPath ? `${SITE_URL}${cityPath}` : null;
  const pageUrl = `${stateUrl}/facility/${slug}`;
  const description = facilityDescription(data);
  const publishedAt = data._published_at ?? data.source.retrieved;
  const breadcrumbItems: Array<{
    "@type": "ListItem";
    position: number;
    item: { "@id": string; name: string };
  }> = [
    { "@type": "ListItem", position: 1, item: { "@id": `${SITE_URL}/`, name: "Home" } },
    { "@type": "ListItem", position: 2, item: { "@id": stateUrl, name: f.state_label } },
    { "@type": "ListItem", position: 3, item: { "@id": countyUrl, name: f.county } },
  ];
  if (cityUrl) {
    breadcrumbItems.push({ "@type": "ListItem", position: breadcrumbItems.length + 1, item: { "@id": cityUrl, name: f.city } });
  }
  breadcrumbItems.push({ "@type": "ListItem", position: breadcrumbItems.length + 1, item: { "@id": pageUrl, name: f.name } });
  const postalAddress = {
    "@type": "PostalAddress" as const,
    streetAddress: f.address,
    addressLocality: f.city,
    addressRegion: state.toUpperCase(),
    addressCountry: "US",
  };
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: breadcrumbItems },
      {
        "@type": "Organization",
        "@id": pageUrl,
        name: f.name,
        url: pageUrl,
        description,
        address: postalAddress,
      },
      {
        "@type": "Article",
        mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
        headline: `${f.name} — TRI Releases | Pollution Analyst`,
        description,
        image: {
          "@type": "ImageObject",
          url: `${SITE_URL}/icon.png`,
          width: 512,
          height: 512,
        },
        datePublished: publishedAt,
        dateModified: publishedAt,
        publisher: {
          "@type": "Organization",
          "@id": `${SITE_URL}/#organization`,
          name: "Pollution Analyst",
          url: SITE_URL,
          logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.png` },
        },
      },
      {
        "@type": "Place",
        name: f.name,
        description,
        url: pageUrl,
        address: postalAddress,
      },
    ],
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader active="facility" />
      <main>
        <Crumbs
          items={[
            { label: f.state_label, href: `/state/${f.state}` },
            { label: f.county, href: `/state/${f.state}/county/${f.county_slug}` },
            ...(cityPath ? [{ label: f.city, href: cityPath }] : []),
            { label: f.name },
          ]}
        />
        <FacilityHero data={data} />
        <JumpStrip
          items={[
            { id: "signals", label: "Signals" },
            { id: "chemicals", label: "Chemicals", show: data.chemicals.length > 0 },
            { id: "equity", label: "Equity" },
            { id: "sources", label: "Sources" },
          ]}
        />
        <NotableSignals
          flags={data.flags ?? []}
          emptyLabel="No notable signals at this facility for the current reporting year. See chemicals and equity context below for the full picture."
          id="signals"
        />
        <ChemicalsSection chemicals={data.chemicals} facilityName={data.facility.name} />
        <EquitySection data={data} />
        <SourceFooter data={data} />
      </main>
      <SiteFooter briefingLabel={data.briefing_label} />
    </>
  );
}
