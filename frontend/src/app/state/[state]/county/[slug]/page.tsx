import type { Metadata } from "next";
import Link from "next/link";

import { NotableSignals } from "@/components/site/AnomalyCard";
import { ChemicalCell } from "@/components/site/ChemicalCell";
import { CountyMap } from "@/components/site/CountyMap";
import { Crumbs } from "@/components/site/Crumbs";
import { EquityStub } from "@/components/site/EquityStub";
import { HealthIndicators } from "@/components/site/HealthIndicators";
import { HeroChart } from "@/components/site/HeroChart";
import { Ic } from "@/components/site/icons";
import { RelatedPlaces } from "@/components/site/RelatedPlaces";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Sparkline } from "@/components/site/Sparkline";
import {
  listCountySlugs,
  loadCounty,
} from "@/lib/data";
import {
  disparityLanguage,
  equityIndexLanguage,
  isEquityStub,
  longArcLanguage,
  magnitudeLanguage,
  pctSigned,
  poundsFormat,
} from "@/lib/prose";
import { pageMeta } from "@/lib/seo";
import type { CountyPagePayload, PollutantSummary } from "@/lib/types";

export const dynamicParams = false;

type RouteParams = { state: string; slug: string };

export async function generateStaticParams(): Promise<RouteParams[]> {
  return listCountySlugs();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { state, slug } = await params;
  const data = await loadCounty(state, slug);
  return pageMeta({
    title: `${data.county.name}, ${data.county.state_label} Pollution Trends | Pollution Analyst`,
    description: `${data.county.name} pollution data: TRI facility releases, hazardous air pollutants, GHG emissions, and equity context. ${data.facilities.length} top facilities tracked.`,
    path: `/state/${state}/county/${slug}`,
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

function CountyHero({ data }: { data: CountyPagePayload }) {
  const c = data.county;
  const lead = data.pathways[0];
  const yoyLanguage = lead?.yoy_pct_change != null ? magnitudeLanguage(lead.yoy_pct_change) : "held roughly steady";
  return (
    <section className="home-hero">
      <div className="wrap">
        <div>
          <div className="eyebrow">County · {data.briefing_label}</div>
          <h1>{c.name}, {c.state_label} Pollution</h1>
          <p className="lead lede" style={{ maxWidth: "70ch" }}>
            {data.facilities.length === 0 ? (
              "No active TRI facilities reported in the most recent year."
            ) : (
              <>
                <strong>{data.facilities.length}</strong> top TRI facilities tracked here. {lead ? <>{lead.label} {yoyLanguage} year over year ({pctSigned(lead.yoy_pct_change)}).</> : null}
              </>
            )}
            {lead ? <> {longArcLanguage(lead.long_arc_pct_change, lead.label, lead.baseline_year)}</> : null}
          </p>
          <p className="muted" style={{ marginTop: 8 }}>
            FIPS {c.fips} · population {c.population.toLocaleString()}
          </p>
          <div className="actions">
            <a href="#facilities" className="btn btn-primary">
              See top facilities <Ic.arrow s={14} />
            </a>
            <a href="#equity" className="btn btn-ghost">
              Equity context
            </a>
          </div>
        </div>

        {lead && lead.history.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div className="meta-mono" style={{ color: "var(--fg-3)", fontSize: 11, marginBottom: 6 }}>
              {lead.label.toUpperCase()} · {lead.history[0]?.year}–{lead.history[lead.history.length - 1]?.year}
            </div>
            <HeroChart
              history={lead.history.map((h) => ({ year: h.year, value: h.value }))}
              units={lead.units}
              color={PATHWAY_COLOR[lead.pathway]}
              height={170}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function PathwaysSection({ pathways }: { pathways: PollutantSummary[] }) {
  return (
    <section className="section">
      <div className="wrap">
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow">Pollutant pathways</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            What&apos;s being released here, and how it&apos;s moved
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
            return (
              <div key={`${p.pathway}-${p.label}`} className="city-tile live" style={{ cursor: "default" }}>
                <div className="tile-meta">
                  <span style={{ color }}>{p.pathway.toUpperCase().replace("_", " ")}</span>
                  <span>{hasTrend ? `SINCE ${p.baseline_year}` : `${p.baseline_year} VINTAGE`}</span>
                </div>
                <h3>{p.label}</h3>
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

function FacilitiesSection({ data }: { data: CountyPagePayload }) {
  return (
    <section className="section section-tint" id="facilities">
      <div className="wrap">
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow">Top facilities · {data.reporting_year}</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            Where the releases are concentrated
          </h2>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Facility</th>
              <th>City</th>
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
                  {f.parent_company ? <span className="muted" style={{ display: "block", fontSize: 12 }}>{f.parent_company}</span> : null}
                </td>
                <td>{f.city}</td>
                <td><ChemicalCell name={f.top_chemical} /></td>
                <td className="right num-mono">{poundsFormat(f.total_pounds_recent)}</td>
                <td
                  className={`right num-mono ${
                    (f.yoy_pct_change ?? 0) <= -5 ? "delta-up" : (f.yoy_pct_change ?? 0) >= 5 ? "delta-down" : "delta-flat"
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

function UtilitiesSection({ data }: { data: CountyPagePayload }) {
  if (data.utilities.length === 0) return null;
  return (
    <section className="section">
      <div className="wrap">
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow">Drinking-water systems</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            Public water utilities serving this county
          </h2>
        </div>
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
            {data.utilities.map((u) => (
              <tr key={u.slug}>
                <td className="name">
                  <Link href={`/state/${u.state}/water/${u.slug}`}>{u.name}</Link>
                </td>
                <td className="num-mono">{u.pwsid}</td>
                <td className="right num-mono">{u.population_served.toLocaleString()}</td>
                <td
                  className={`right num-mono ${
                    u.health_based_violations_5yr === 0 ? "delta-up" : u.health_based_violations_5yr >= 3 ? "delta-down" : "delta-flat"
                  }`}
                >
                  {u.health_based_violations_5yr}
                </td>
                <td>
                  {u.unresolved ? (
                    <span className="chip low">UNRESOLVED</span>
                  ) : (
                    <span className="muted">In compliance</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EquitySection({ data }: { data: CountyPagePayload }) {
  const e = data.equity;
  if (isEquityStub(e)) {
    return (
      <EquityStub
        geographyLabel={e.geography_label}
        population={e.population}
        scopeLabel="County"
      />
    );
  }
  const topDisp = (e.disparity_scores ?? [])[0];
  return (
    <section className="section section-tint" id="equity">
      <div className="wrap">
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">Equity context · ACS 2018-2022 · USEPA-clone EJ disparity</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            Who lives in this county
          </h2>
          <p className="lead" style={{ maxWidth: "62ch", marginTop: 14 }}>
            {e.geography_label}: <strong>{e.population.toLocaleString()}</strong> residents.
            {topDisp ? <> County disparity score for {topDisp.label.toLowerCase()} sits {disparityLanguage(topDisp.score)} ({topDisp.score.toFixed(0)}).</> : null}{" "}
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
              <h3 style={{ fontSize: 28 }}>{row.value == null ? "—" : `${row.value.toFixed(1)}%`}</h3>
              <p className="desc">{row.label}</p>
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
                return (
                  <li key={row.label} style={{ display: "grid", gridTemplateColumns: "1fr 60px 220px", gap: 12, alignItems: "center" }}>
                    <span style={{ fontSize: 14, color: "var(--fg-2)" }}>{row.label}</span>
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
              EJ disparity scores · population-weighted across county block groups (100 = national reference; higher = greater disparate burden)
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

function CityDirectory({ data }: { data: CountyPagePayload }) {
  // Alphabetical link directory of every city in this county that has its
  // own published page. Long-tail cities don't otherwise appear in the
  // facilities table; without this section search engines have no
  // crawlable internal link to them. Mirrors the state page's
  // CountyDirectory pattern.
  const dir = data.cities_directory ?? [];
  if (dir.length === 0) return null;
  return (
    <section className="section" id="all-cities" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="wrap">
        <div className="eyebrow">Browse</div>
        <h2 className="h-display" style={{ fontSize: "clamp(22px,2.4vw,28px)", margin: "8px 0 6px" }}>
          All {dir.length} {data.county.name} cities with TRI data
        </h2>
        <p className="muted" style={{ fontSize: 14, marginBottom: 24, maxWidth: "60ch" }}>
          Pollution trends and {data.briefing_label} pages for every tracked city in this county. Alphabetical.
        </p>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "6px 18px",
          }}
        >
          {dir.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/state/${data.county.state}/city/${c.slug}`}
                style={{
                  fontSize: 14,
                  color: "var(--fg-2)",
                  display: "block",
                  padding: "4px 0",
                  borderBottom: "1px solid transparent",
                }}
              >
                {c.name} pollution
                <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>· {c.facilities_count} {c.facilities_count === 1 ? "facility" : "facilities"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SourcesFooter({ data }: { data: CountyPagePayload }) {
  return (
    <section className="section" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 24, fontSize: 13, color: "var(--ink-3)" }}>
          <p style={{ marginBottom: 12 }}><strong>Sources.</strong></p>
          <ul style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
            {data.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a> · retrieved {s.retrieved}.
              </li>
            ))}
          </ul>
          <p style={{ marginTop: 12 }}>
            All sources are federal public-domain datasets under 17 USC §105. We aggregate but do not relabel; the underlying observations remain attributable to EPA.
          </p>
        </div>
      </div>
    </section>
  );
}

export default async function CountyPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { state, slug } = await params;
  const data = await loadCounty(state, slug);
  return (
    <>
      <SiteHeader active="county" />
      <main>
        <Crumbs
          items={[
            { label: data.county.state_label, href: `/state/${state}` },
            { label: data.county.name },
          ]}
        />
        <CountyHero data={data} />
        <NotableSignals flags={data.flags ?? []} />
        <section className="section">
          <div className="wrap">
            <div style={{ marginBottom: 24 }}>
              <div className="eyebrow">Top facilities mapped</div>
              <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
                Where releases land in {data.county.name}
              </h2>
              <p className="muted" style={{ fontSize: 14, marginTop: 10, maxWidth: "62ch" }}>
                Each red dot is one of the top TRI facilities. Size reflects {data.reporting_year} total
                releases. County boundary outlined in blue.
              </p>
            </div>
            <CountyMap
              countyFips={data.county.fips}
              countyName={data.county.name}
              facilities={data.facilities}
            />
          </div>
        </section>
        <PathwaysSection pathways={data.pathways} />
        <FacilitiesSection data={data} />
        <UtilitiesSection data={data} />
        <EquitySection data={data} />
        <HealthIndicators
          indicators={data.health_indicators ?? []}
          scopeLabel="County"
          stateLabel={data.county.state_label}
        />
        <CityDirectory data={data} />
        <RelatedPlaces
          places={data.related_places ?? []}
          scopeLabel="County"
          stateLabel={data.county.state_label}
        />
        <SourcesFooter data={data} />
      </main>
      <SiteFooter briefingLabel={data.briefing_label} />
    </>
  );
}
