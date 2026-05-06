import type { Metadata } from "next";
import Link from "next/link";

import { NotableSignals } from "@/components/site/AnomalyCard";
import { ChemicalCell } from "@/components/site/ChemicalCell";
import { Crumbs } from "@/components/site/Crumbs";
import { EquityStub } from "@/components/site/EquityStub";
import { HealthIndicators } from "@/components/site/HealthIndicators";
import { HeroChart } from "@/components/site/HeroChart";
import { Ic } from "@/components/site/icons";
import { InfoTip } from "@/components/site/InfoTip";
import { JumpStrip } from "@/components/site/JumpStrip";
import { RelatedPlaces } from "@/components/site/RelatedPlaces";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Sparkline } from "@/components/site/Sparkline";
import { SuperfundSection } from "@/components/site/SuperfundSection";
import { listCitySlugs, loadCityHub } from "@/lib/data";
import {
  disparityLanguage,
  equityIndexLanguage,
  isEquityStub,
  longArcLanguage,
  magnitudeLanguage,
  pctSigned,
  poundsFormat,
} from "@/lib/prose";
import { getEjIndicatorRisk } from "@/lib/ejIndicatorRisk";
import { getPathwayHealthRisk } from "@/lib/pathwayHealthRisk";
import { pageMeta, SITE_URL } from "@/lib/seo";
import type { CityHubPayload, PollutantSummary } from "@/lib/types";

function cityDescription(data: CityHubPayload): string {
  return `${data.place.name}, ${data.place.state_label} — ${data.totals.facilities_in_city} TRI facilities in the city, ${data.totals.utilities_serving} public water systems serving residents, with EPA equity context.`;
}

// Mirrors `_COUNTY_SUFFIXES_LOWER` in pipeline/src/publish/site.py. AK
// (Borough / Census Area / City and Borough / Municipality), LA (Parish),
// and PR (Municipio) carry native suffixes through the data; the publisher
// strips them before slugifying, and the frontend has to match. Order is
// significant: " city and borough" must come before " borough" so Juneau
// strips fully.
const COUNTY_SUFFIXES = [
  " city and borough",
  " borough",
  " parish",
  " census area",
  " municipality",
  " municipio",
  " county",
];

function stripCountySuffix(name: string): string {
  const low = name.toLowerCase();
  for (const suffix of COUNTY_SUFFIXES) {
    if (low.endsWith(suffix)) return name.slice(0, -suffix.length).trimEnd();
  }
  return name;
}

function countySlugFromName(countyName: string): string {
  return stripCountySuffix(countyName).toLowerCase().replace(/\s+/g, "-");
}

function countyLabelFromName(countyName: string): string {
  const low = countyName.toLowerCase();
  for (const suffix of COUNTY_SUFFIXES) {
    if (low.endsWith(suffix)) return countyName;
  }
  return `${countyName} County`;
}

export const dynamicParams = false;

type RouteParams = { state: string; slug: string };

export async function generateStaticParams(): Promise<RouteParams[]> {
  return listCitySlugs();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { state, slug } = await params;
  const data = await loadCityHub(state, slug);
  return pageMeta({
    title: `${data.place.name} ${data.place.state.toUpperCase()} Pollution | Pollution Analyst`,
    description: cityDescription(data),
    path: `/state/${state}/city/${slug}`,
  });
}

const PATHWAY_COLOR: Record<PollutantSummary["pathway"], string> = {
  criteria_air: "#60A5FA",
  hazardous_air: "#FF6B6B",
  ghg: "#E6B450",
  drinking_water: "#22D3EE",
  tri_release: "#A78BFA",
  tri_air: "#60A5FA",
  tri_water: "#22D3EE",
  tri_land: "#E6B450",
  pesticide: "#6FCF97",
};

function CityHero({ data }: { data: CityHubPayload }) {
  const p = data.place;
  const t = data.totals;
  const yoyLanguage = magnitudeLanguage(t.yoy_pct_change);
  const longArcText =
    t.long_arc_pct_change != null
      ? longArcLanguage(t.long_arc_pct_change, "Toxic releases", t.long_arc_baseline_year)
      : null;
  return (
    <section className="home-hero">
      <div className="wrap">
        <div>
          <div className="eyebrow">City · {data.briefing_label}</div>
          <h1>
            {p.name}, {p.state_label} Pollution
          </h1>
          <p className="lead lede" style={{ maxWidth: "70ch" }}>
            <strong>{t.facilities_in_city}</strong> TRI facilities inside the city limits and{" "}
            <strong>{t.utilities_serving}</strong> public water system{t.utilities_serving === 1 ? "" : "s"} serving residents.
            {t.facilities_in_city > 0 ? (
              <>
                {" "}In-city TRI releases {yoyLanguage} year over year ({pctSigned(t.yoy_pct_change)}).
                {longArcText ? <> {longArcText}</> : null}
              </>
            ) : null}
          </p>
          <p className="muted" style={{ marginTop: 8 }}>
            FIPS {p.fips}
            {p.population > 0 ? <> · population {p.population.toLocaleString()}</> : null}
            {p.county_name ? (
              <>
                {" "}·{" "}
                <Link href={`/state/${p.state}/county/${(p.county_name || "").toLowerCase().replace(/\s+county$/, "").replace(/\s+/g, "-")}`}>
                  {p.county_name}
                </Link>
              </>
            ) : null}
          </p>
          <div className="actions">
            {data.facilities.length > 0 && (
              <a href="#facilities" className="btn btn-primary">
                Top facilities <Ic.arrow s={14} />
              </a>
            )}
            {data.water.utilities_count > 0 && (
              <a href="#water" className="btn btn-ghost">
                Water systems
              </a>
            )}
            <a href="#pathways" className="btn btn-ghost">
              Pathways
            </a>
            <a href="#equity" className="btn btn-ghost">
              Equity context
            </a>
          </div>
        </div>

        {t.history.length > 1 && t.facilities_in_city > 0 && (
          <div style={{ marginTop: 28 }}>
            <div className="meta-mono" style={{ color: "var(--fg-3)", fontSize: 11, marginBottom: 6 }}>
              IN-CITY TRI RELEASES · {t.history[0].year}–{t.history[t.history.length - 1].year}
            </div>
            <HeroChart
              history={t.history.map((h) => ({ year: h.year, value: h.value }))}
              units="lb"
              color="var(--blue)"
              height={170}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function PathwaysSection({ pathways, cityName }: { pathways: PollutantSummary[]; cityName: string }) {
  if (pathways.length === 0) return null;
  return (
    <section className="section" id="pathways">
      <div className="wrap">
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow">Pollutant pathways</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            {cityName} Pollutant Multi-Year Trends
          </h2>
        </div>
        <div className="cities-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {pathways.map((p) => {
            const color = PATHWAY_COLOR[p.pathway];
            const valueLabel =
              p.units === "lb"
                ? poundsFormat(p.current)
                : p.units.startsWith("metric tons")
                ? `${(p.current / 1_000_000).toFixed(1)}M ${p.units}`
                : `${p.current.toFixed(p.units === "ppm" ? 3 : p.units === "µg/m³" ? 2 : 1)} ${p.units}`;
            const hasTrend = p.history.length >= 2;
            const tooltip = getPathwayHealthRisk(p.pathway, p.label);
            return (
              <div key={`${p.pathway}-${p.label}`} className="city-tile live" style={{ cursor: "default" }}>
                <div className="tile-meta">
                  <span style={{ color }}>{p.pathway.toUpperCase().replace("_", " ")}</span>
                  <span>{hasTrend ? `SINCE ${p.baseline_year}` : `${p.baseline_year} VINTAGE`}</span>
                </div>
                <h3>
                  {p.label}
                  {tooltip ? <InfoTip heading="Health risk" body={tooltip} /> : null}
                </h3>
                {hasTrend ? (
                  <>
                    <p className="meta-mono" style={{ margin: "4px 0 12px", fontSize: 12 }}>
                      {valueLabel} · {pctSigned(p.yoy_pct_change)} YoY · {pctSigned(p.long_arc_pct_change)} since {p.baseline_year}
                    </p>
                    <div style={{ height: 50, marginBottom: 12 }}>
                      <Sparkline values={p.history.map((h) => h.value)} years={p.history.map((h) => h.year)} width={260} height={50} color={color} strokeWidth={1.7} />
                    </div>
                    <p className="desc" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                      {longArcLanguage(p.long_arc_pct_change, p.label, p.baseline_year)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="meta-mono" style={{ margin: "4px 0 12px", fontSize: 12 }}>
                      {valueLabel} · {p.baseline_year} vintage
                    </p>
                    <p className="desc" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                      Single-vintage exposure modeling — EPA cadence is multi-year, so no trend line yet.
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FacilitiesSection({ data }: { data: CityHubPayload }) {
  if (data.facilities.length === 0) return null;
  return (
    <section className="section section-tint" id="facilities">
      <div className="wrap">
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow">Top facilities · TRI {data.reporting_year}</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            Largest Emitters Inside The City
          </h2>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Facility</th>
              <th>Top chemical</th>
              <th className="right">Total releases</th>
              <th className="right">YoY</th>
            </tr>
          </thead>
          <tbody>
            {data.facilities.map((f) => (
              <tr key={f.slug}>
                <td className="name">
                  <Link href={`/state/${f.state}/facility/${f.slug}`}>{f.name}</Link>
                  {f.parent_company ? (
                    <span className="muted" style={{ display: "block", fontSize: 12 }}>
                      {f.parent_company}
                    </span>
                  ) : null}
                </td>
                <td><ChemicalCell name={f.top_chemical} /></td>
                <td className="right num-mono">{poundsFormat(f.total_pounds_recent)}</td>
                <td
                  className={`right num-mono ${
                    (f.yoy_pct_change ?? 0) <= -5
                      ? "delta-up"
                      : (f.yoy_pct_change ?? 0) >= 5
                      ? "delta-down"
                      : "delta-flat"
                  }`}
                >
                  {pctSigned(f.yoy_pct_change)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WaterSection({ data }: { data: CityHubPayload }) {
  const w = data.water;
  if (w.utilities_count === 0) return null;
  const compliancePosture =
    w.unresolved_total > 0
      ? `${w.unresolved_total} unresolved violation${w.unresolved_total === 1 ? "" : "s"} on the SDWIS record across utilities serving this city.`
      : w.health_based_5yr_total > 0
      ? `${w.health_based_5yr_total} health-based SDWIS violation${w.health_based_5yr_total === 1 ? "" : "s"} in the past 5 years across utilities serving this city; none currently unresolved.`
      : `No health-based SDWIS violations recorded across utilities serving this city in the past 5 years.`;
  return (
    <section className="section" id="water">
      <div className="wrap">
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">Drinking water · SDWIS</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            Water Systems Serving {data.place.name}
          </h2>
          <p className="lead" style={{ maxWidth: "62ch", marginTop: 14 }}>
            {compliancePosture}
          </p>
        </div>

        <div className="cities-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", marginBottom: 32 }}>
          {[
            { label: "Utilities serving", value: w.utilities_count.toLocaleString() },
            { label: "Population served", value: w.population_served_total.toLocaleString() },
            { label: "Health-based · 5yr", value: w.health_based_5yr_total.toLocaleString() },
            { label: "Unresolved", value: w.unresolved_total.toLocaleString() },
          ].map((row) => (
            <div key={row.label} className="city-tile live" style={{ cursor: "default" }}>
              <div className="tile-meta"><span>SDWIS · 5-YR WINDOW</span></div>
              <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--fg)" }}>
                {row.value}
              </div>
              <p className="desc" style={{ margin: 0 }}>{row.label}</p>
            </div>
          ))}
        </div>

        {(() => {
          // Only surface utilities worth attention — health-based violation count
          // > 0 OR currently unresolved. Compliant systems with zero recorded
          // health-based violations fold into a footnote so the table doesn't
          // become a long roster of mobile-home parks with clean records.
          const flagged = w.utilities.filter(
            (u) => u.health_based_violations_5yr > 0 || u.unresolved,
          );
          const compliantCount = w.utilities.length - flagged.length;
          if (flagged.length === 0) {
            return (
              <p className="muted" style={{ maxWidth: "62ch" }}>
                Every public water system serving this city is in compliance with
                no recorded health-based SDWIS violations in the past 5 years.
                The {w.utilities.length} system{w.utilities.length === 1 ? "" : "s"} on
                record are not individually tabulated here; click through any
                utility to see its full record.
              </p>
            );
          }
          return (
            <>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Water system</th>
                    <th>PWSID</th>
                    <th className="right">Population served</th>
                    <th className="right">Health-based · 5yr</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {flagged.map((u) => (
                    <tr key={u.slug}>
                      <td className="name">
                        <Link href={`/state/${u.state}/water/${u.slug}`}>{u.name}</Link>
                      </td>
                      <td className="num-mono">{u.pwsid}</td>
                      <td className="right num-mono">{u.population_served.toLocaleString()}</td>
                      <td
                        className={`right num-mono ${
                          u.health_based_violations_5yr === 0
                            ? "delta-up"
                            : u.health_based_violations_5yr >= 3
                            ? "delta-down"
                            : "delta-flat"
                        }`}
                      >
                        {u.health_based_violations_5yr}
                      </td>
                      <td>
                        {u.unresolved ? (
                          <span className="chip low">UNRESOLVED</span>
                        ) : (
                          <span className="muted">Returned to compliance</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {compliantCount > 0 ? (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 14, maxWidth: "62ch" }}>
                  Showing the {flagged.length} {flagged.length === 1 ? "system" : "systems"} with
                  recorded health-based or unresolved violations.{" "}
                  {compliantCount} additional {compliantCount === 1 ? "system is" : "systems are"} in
                  compliance with no recorded health-based violations in the past
                  5 years and {compliantCount === 1 ? "is" : "are"} not individually tabulated.
                </p>
              ) : null}
            </>
          );
        })()}
        <p className="muted" style={{ fontSize: 12.5, marginTop: 14, maxWidth: "62ch" }}>
          A <strong>public water system</strong> is the regulated entity, not the city. EPA&apos;s SDWIS definition covers anything serving 25+ people for 60+ days a year or with 15+ service connections — that includes municipal utilities (City of Stockton), water districts, mobile home parks operating their own wells, schools, and small private subdivisions. Each system is independently monitored. Some systems serve multiple cities; some cities are served by many systems.
        </p>
      </div>
    </section>
  );
}

function EquitySection({ data }: { data: CityHubPayload }) {
  const e = data.equity;
  if (isEquityStub(e)) {
    return <EquityStub geographyLabel={e.geography_label} population={e.population} scopeLabel="City" />;
  }
  const topDisp = (e.disparity_scores ?? [])[0];
  return (
    <section className="section section-tint" id="equity">
      <div className="wrap">
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">Equity context · ACS 2018-2022 · USEPA-clone EJ disparity</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            Who Lives In {data.place.name}
          </h2>
          <p className="lead" style={{ maxWidth: "62ch", marginTop: 14 }}>
            {e.geography_label}: <strong>{e.population.toLocaleString()}</strong> residents.
            {topDisp ? (
              <>
                {" "}City disparity score for {topDisp.label.toLowerCase()} sits {disparityLanguage(topDisp.score)} ({topDisp.score.toFixed(0)}).
              </>
            ) : null}{" "}
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

        {(e.ej_indexes?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 32 }}>
            <p className="meta-mono" style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 14 }}>
              NATIONAL PERCENTILE · vs all US block groups (population-weighted; ranked against the national EJScreen indicator distribution)
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 14 }}>
              {e.ej_indexes.map((row) => {
                const pct = row.pct_us;
                const barColor = pct >= 90 ? "var(--red)" : pct >= 80 ? "var(--amber)" : pct >= 60 ? "var(--blue)" : "var(--green)";
                const numColor = pct >= 80 ? "var(--red)" : pct >= 60 ? "var(--amber)" : "var(--fg-2)";
                const tip = getEjIndicatorRisk(row.label);
                return (
                  <li key={row.label} style={{ display: "grid", gridTemplateColumns: "1fr 60px 220px", gap: 12, alignItems: "center" }}>
                    <span style={{ fontSize: 14, color: "var(--fg-2)" }}>
                      {row.label}
                      {tip ? <InfoTip heading="Health risk" body={tip} /> : null}
                    </span>
                    <span className="num-mono" style={{ textAlign: "right", color: numColor, fontSize: 14 }}>
                      {pct.toFixed(0)}
                    </span>
                    <span className="muted" style={{ fontSize: 12.5 }}>{equityIndexLanguage(pct)}</span>
                    <span style={{ gridColumn: "1 / -1", height: 6, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", width: `${pct}%`, background: barColor }} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {(e.disparity_scores?.length ?? 0) > 0 && (
          <table className="tbl">
            <caption style={{ captionSide: "top", textAlign: "left", padding: "0 0 12px", fontSize: 13, color: "var(--ink-3)" }}>
              EJ disparity scores · population-weighted across city block groups (100 = national reference; higher = greater disparate burden)
            </caption>
            <thead>
              <tr>
                <th>Indicator</th>
                <th className="right">Disparity score</th>
                <th>Reading</th>
              </tr>
            </thead>
            <tbody>
              {e.disparity_scores!.map((row) => (
                <tr key={row.label}>
                  <td className="name">{row.label}</td>
                  <td
                    className={`right num-mono ${
                      row.score >= 150 ? "delta-down" : row.score >= 110 ? "delta-flat" : "delta-up"
                    }`}
                  >
                    {row.score.toFixed(0)}
                  </td>
                  <td className="muted">{disparityLanguage(row.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
          Source: {e.source}.
        </p>
      </div>
    </section>
  );
}

function SourcesFooter({ data }: { data: CityHubPayload }) {
  return (
    <section className="section" id="sources" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 24, fontSize: 13, color: "var(--ink-3)" }}>
          <p style={{ marginBottom: 12 }}>
            <strong>Sources.</strong>
          </p>
          <ul style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
            {data.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.label}
                </a>{" "}
                · retrieved {s.retrieved}.
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default async function CityHubPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { state, slug } = await params;
  const data = await loadCityHub(state, slug);
  const stateUrl = `${SITE_URL}/state/${state}`;
  const pageUrl = `${stateUrl}/city/${slug}`;
  const description = cityDescription(data);
  const placeName = `${data.place.name}, ${data.place.state_label}`;
  const countyName = data.place.county_name;
  const countySlug = countyName ? countySlugFromName(countyName) : null;
  const countyLabel = countyName ? countyLabelFromName(countyName) : null;
  const countyUrl = countySlug ? `${stateUrl}/county/${countySlug}` : null;
  const breadcrumbItems: Array<{ "@type": "ListItem"; position: number; name: string; item: string }> = [
    { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: data.place.state_label, item: stateUrl },
  ];
  if (countyLabel && countyUrl) {
    breadcrumbItems.push({ "@type": "ListItem", position: breadcrumbItems.length + 1, name: countyLabel, item: countyUrl });
  }
  breadcrumbItems.push({ "@type": "ListItem", position: breadcrumbItems.length + 1, name: data.place.name, item: pageUrl });
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Place",
        name: placeName,
        url: pageUrl,
        description,
        address: {
          "@type": "PostalAddress",
          addressLocality: data.place.name,
          addressRegion: state.toUpperCase(),
          addressCountry: "US",
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbItems,
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/`,
        name: "Pollution Analyst",
        url: `${SITE_URL}/`,
        logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.png` },
        description:
          "Pollution trend intelligence built from federal public data. Methodology-first. Updated on each source's native cadence.",
      },
      {
        "@type": "Article",
        headline: `${placeName} Pollution`,
        description,
        image: `${SITE_URL}/icon.png`,
        mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
        publisher: {
          "@type": "Organization",
          name: "Pollution Analyst",
          url: SITE_URL,
        },
      },
    ],
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader active="city" />
      <main>
        <Crumbs
          items={[
            { label: data.place.state_label, href: `/state/${state}` },
            ...(countyLabel && countyUrl
              ? [{ label: countyLabel, href: `/state/${state}/county/${countySlug}` }]
              : []),
            { label: data.place.name },
          ]}
        />
        <CityHero data={data} />
        <JumpStrip
          items={[
            { id: "signals", label: "Signals", show: (data.flags?.length ?? 0) > 0 },
            { id: "pathways", label: "Pathways", show: data.pathways.length > 0 },
            { id: "facilities", label: "Facilities", show: data.facilities.length > 0 },
            { id: "water", label: "Water", show: data.water.utilities_count > 0 },
            { id: "superfund", label: "Superfund", show: (data.superfund?.length ?? 0) > 0 },
            { id: "equity", label: "Equity" },
            { id: "health", label: "Health", show: (data.health_indicators?.length ?? 0) > 0 },
            { id: "related", label: "Compare", show: (data.related_places?.length ?? 0) > 0 },
            { id: "sources", label: "Sources" },
          ]}
        />
        <NotableSignals flags={data.flags ?? []} id="signals" />
        <PathwaysSection pathways={data.pathways} cityName={data.place.name} />
        <FacilitiesSection data={data} />
        <WaterSection data={data} />
        <SuperfundSection
          sites={data.superfund ?? []}
          geographyLabel={data.place.name}
          showHostCity={false}
          id="superfund"
        />
        <EquitySection data={data} />
        <HealthIndicators
          indicators={data.health_indicators ?? []}
          scopeLabel="City"
          stateLabel={data.place.state_label}
        />
        <RelatedPlaces
          places={data.related_places ?? []}
          scopeLabel="City"
          stateLabel={data.place.state_label}
        />
        <SourcesFooter data={data} />
      </main>
      <SiteFooter briefingLabel={data.briefing_label} />
    </>
  );
}
