import type { Metadata } from "next";
import Link from "next/link";

import { Crumbs } from "@/components/site/Crumbs";
import { EquityStub } from "@/components/site/EquityStub";
import { HeroChart } from "@/components/site/HeroChart";
import { Ic } from "@/components/site/icons";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Sparkline } from "@/components/site/Sparkline";
import { listStateSlugs, loadState } from "@/lib/data";
import {
  disparityLanguage,
  isEquityStub,
  longArcLanguage,
  magnitudeLanguage,
  pctSigned,
  poundsFormat,
} from "@/lib/prose";
import { pageMeta } from "@/lib/seo";
import type { PollutantSummary, StatePagePayload } from "@/lib/types";

export const dynamicParams = false;

type RouteParams = { state: string };

export async function generateStaticParams(): Promise<RouteParams[]> {
  return listStateSlugs();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { state } = await params;
  const data = await loadState(state);
  return pageMeta({
    title: `${data.state.name} Pollution Trends | Pollution Analyst.ai`,
    description: `${data.state.name} pollution data: ${data.totals.facilities_tracked.toLocaleString()} TRI facilities, ${data.totals.utilities_tracked.toLocaleString()} water utilities, ${data.totals.counties_with_data} counties tracked. Equity context from EJScreen.`,
    path: `/state/${state}`,
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

function StateHero({ data }: { data: StatePagePayload }) {
  const s = data.state;
  const t = data.totals;
  const yoyLanguage = magnitudeLanguage(t.yoy_pct_change);
  const longArc = longArcLanguage(
    t.long_arc_pct_change,
    "Toxic releases",
    t.long_arc_baseline_year,
  );
  const lead = data.pathways[0];
  return (
    <section className="home-hero">
      <div className="wrap">
        <div>
          <div className="eyebrow">State · {data.briefing_label}</div>
          <h1>{s.name}</h1>
          <p className="lead lede" style={{ maxWidth: "70ch" }}>
            <strong>{t.facilities_tracked.toLocaleString()}</strong> TRI facilities and{" "}
            <strong>{t.utilities_tracked.toLocaleString()}</strong> public water systems across{" "}
            <strong>{t.counties_with_data}</strong> counties.
            {" "}Statewide TRI releases {yoyLanguage} year over year ({pctSigned(t.yoy_pct_change)}). {longArc}
          </p>
          <p className="muted" style={{ marginTop: 8 }}>
            FIPS {s.fips} · population {s.population.toLocaleString()} · {s.counties_total} counties total
          </p>
          <div className="actions">
            <a href="#counties" className="btn btn-primary">
              Top counties <Ic.arrow s={14} />
            </a>
            <a href="#facilities" className="btn btn-ghost">
              Top facilities
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
          <div className="eyebrow">Statewide pollutant pathways</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            What this state releases, and how it&apos;s moved
          </h2>
        </div>
        <div className="cities-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {pathways.map((p) => {
            const color = PATHWAY_COLOR[p.pathway];
            const valueLabel = p.units === "lb"
              ? poundsFormat(p.current)
              : `${(p.current / 1_000_000).toFixed(0)}M ${p.units}`;
            return (
              <div key={p.pathway} className="city-tile live" style={{ cursor: "default" }}>
                <div className="tile-meta">
                  <span style={{ color }}>{p.pathway.toUpperCase().replace("_", " ")}</span>
                  <span>SINCE {p.baseline_year}</span>
                </div>
                <h3>{p.label}</h3>
                <p className="meta-mono" style={{ margin: "4px 0 12px", fontSize: 12 }}>
                  {valueLabel} · {pctSigned(p.yoy_pct_change)} YoY · {pctSigned(p.long_arc_pct_change)} since {p.baseline_year}
                </p>
                <div style={{ height: 36, marginBottom: 12 }}>
                  <Sparkline values={p.history.map((h) => h.value)} width={260} height={36} color={color} strokeWidth={1.7} />
                </div>
                <p className="desc" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                  {longArcLanguage(p.long_arc_pct_change, p.label, p.baseline_year)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CountiesSection({ data }: { data: StatePagePayload }) {
  return (
    <section className="section section-tint" id="counties">
      <div className="wrap">
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow">Top counties · TRI {data.reporting_year}</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            Where releases concentrate in {data.state.name}
          </h2>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>County</th>
              <th className="right">Population</th>
              <th className="right">Facilities</th>
              <th className="right">Total releases</th>
              <th className="right">YoY</th>
              <th>Top chemical</th>
            </tr>
          </thead>
          <tbody>
            {data.top_counties.map((c) => (
              <tr key={c.slug}>
                <td className="name">
                  <Link href={`/state/${c.state}/county/${c.slug}`}>{c.name}</Link>
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>FIPS {c.fips}</span>
                </td>
                <td className="right num-mono">
                  {c.population > 0 ? c.population.toLocaleString() : "—"}
                </td>
                <td className="right num-mono">{c.facilities_count.toLocaleString()}</td>
                <td className="right num-mono">{poundsFormat(c.total_releases_pounds)}</td>
                <td
                  className={`right num-mono ${
                    (c.yoy_pct_change ?? 0) <= -5 ? "delta-up" : (c.yoy_pct_change ?? 0) >= 5 ? "delta-down" : "delta-flat"
                  }`}
                >
                  {pctSigned(c.yoy_pct_change)}
                </td>
                <td>{c.top_chemical}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FacilitiesSection({ data }: { data: StatePagePayload }) {
  return (
    <section className="section" id="facilities">
      <div className="wrap">
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow">Top facilities · TRI {data.reporting_year}</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            The largest individual emitters in {data.state.name}
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
            {data.top_facilities.map((f) => (
              <tr key={f.slug}>
                <td className="name">
                  <Link href={`/state/${f.state}/facility/${f.slug}`}>{f.name}</Link>
                  {f.parent_company ? <span className="muted" style={{ display: "block", fontSize: 12 }}>{f.parent_company}</span> : null}
                </td>
                <td>{f.city}</td>
                <td>{f.top_chemical}</td>
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

function UtilitiesSection({ data }: { data: StatePagePayload }) {
  if (data.top_utilities.length === 0) return null;
  return (
    <section className="section section-tint">
      <div className="wrap">
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow">Largest water utilities</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            Top public water systems by population served
          </h2>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Utility</th>
              <th>PWSID</th>
              <th className="right">Population served</th>
              <th className="right">Health-based · 5yr</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.top_utilities.map((u) => (
              <tr key={u.slug}>
                <td className="name">
                  <Link href={`/state/${u.state}/city/${u.slug}`}>{u.name}</Link>
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

function EquitySection({ data }: { data: StatePagePayload }) {
  const e = data.equity;
  if (isEquityStub(e)) {
    return (
      <EquityStub
        geographyLabel={e.geography_label}
        population={e.population}
        scopeLabel="Statewide"
      />
    );
  }
  const topDisp = (e.disparity_scores ?? [])[0];
  return (
    <section className="section" id="equity">
      <div className="wrap">
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">Equity context · ACS 2018-2022 · USEPA-clone EJ disparity</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            Statewide population characteristics
          </h2>
          <p className="lead" style={{ maxWidth: "62ch", marginTop: 14 }}>
            {e.geography_label}: <strong>{e.population.toLocaleString()}</strong> residents.
            {topDisp ? <> Statewide disparity score for {topDisp.label.toLowerCase()} sits {disparityLanguage(topDisp.score)} ({topDisp.score.toFixed(0)}).</> : null}{" "}
            <Link href="/methodology#equity">Why we surface this →</Link>
          </p>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10, maxWidth: "62ch" }}>
            State-level percentiles are aggregated from block-group EJScreen data. The EJ pattern within the state will be sharper at the county level — drill down for the meaningful spatial detail.
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

        {(e.disparity_scores?.length ?? 0) > 0 && (
          <table className="tbl">
            <caption style={{ captionSide: "top", textAlign: "left", padding: "0 0 12px", fontSize: 13, color: "var(--ink-3)" }}>
              EJ disparity scores · population-weighted, all state block groups (100 = national reference; higher = greater disparate burden)
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
          Source: {e.source}. EJ disparity scores via the USEPA-clone GitHub mirror after EPA deprecated the public EJScreen tool in 2025; demographics from Census ACS.
        </p>
      </div>
    </section>
  );
}

function CountyDirectory({ data }: { data: StatePagePayload }) {
  // Alphabetical link directory of every county we publish a page for —
  // primarily for search-engine discovery. The rankings table at the top
  // only shows the top 10; without this section the long-tail counties
  // have no crawlable internal link from the state page. Mirrors the
  // crime-site NeighborhoodDirectory pattern on /city/[slug].
  const dir = data.counties_directory ?? [];
  if (dir.length === 0) return null;
  return (
    <section className="section" id="all-counties" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="wrap">
        <div className="eyebrow">Browse</div>
        <h2 className="h-display" style={{ fontSize: "clamp(22px,2.4vw,28px)", margin: "8px 0 6px" }}>
          All {dir.length} {data.state.name} counties with TRI data
        </h2>
        <p className="muted" style={{ fontSize: 14, marginBottom: 24, maxWidth: "60ch" }}>
          Pollution trends and {data.briefing_label} pages for every tracked county. Alphabetical.
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
                href={`/state/${data.state.slug}/county/${c.slug}`}
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

function SourcesFooter({ data }: { data: StatePagePayload }) {
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
        </div>
      </div>
    </section>
  );
}

export default async function StatePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { state } = await params;
  const data = await loadState(state);
  return (
    <>
      <SiteHeader active="state" />
      <main>
        <Crumbs items={[{ label: data.state.name }]} />
        <StateHero data={data} />
        <PathwaysSection pathways={data.pathways} />
        <CountiesSection data={data} />
        <FacilitiesSection data={data} />
        <UtilitiesSection data={data} />
        <EquitySection data={data} />
        <CountyDirectory data={data} />
        <SourcesFooter data={data} />
      </main>
      <SiteFooter briefingLabel={data.briefing_label} />
    </>
  );
}
