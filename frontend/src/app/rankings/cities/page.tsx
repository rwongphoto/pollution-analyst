import type { Metadata } from "next";
import Link from "next/link";

import { Crumbs } from "@/components/site/Crumbs";
import { InfoTip } from "@/components/site/InfoTip";
import { JumpStrip } from "@/components/site/JumpStrip";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { loadRankings } from "@/lib/data";
import { buildRankingJumpItems } from "@/lib/rankingJump";
import { buildRankingsJsonLd } from "@/lib/rankingJsonLd";
import { LANE_METHODOLOGY, LANE_OVERRIDES } from "@/lib/rankingLanes";
import { pageMeta, SITE_URL } from "@/lib/seo";
import type { RankingTable } from "@/lib/types";

// Editorial caption per (lane, direction). PM2.5 / cancer risk are
// county-grain measurements — the caption flags that explicitly so the
// reader doesn't assume per-place monitor coverage.
const CITY_TABLE_CAPTIONS: Record<string, string> = {
  "pm25_annual:most":
    "Cities with the highest annual PM2.5 concentrations — measured at the containing county's AQS monitors.",
  "pm25_annual:least":
    "Cities with the lowest annual PM2.5 concentrations — measured at the containing county's AQS monitors.",
  "cancer_risk:most":
    "Cities with the highest AirToxScreen-modeled lifetime cancer risk — using the containing county's value.",
  "cancer_risk:least":
    "Cities with the lowest AirToxScreen-modeled lifetime cancer risk — using the containing county's value.",
  "tri_air:most":
    "Cities whose industrial facilities reported the largest air releases under TRI.",
  "tri_air:least":
    "Cities with the smallest reported TRI air releases among those with reporting facilities.",
};

export const metadata: Metadata = pageMeta({
  title: "Most Polluted Cities — National Rankings | Pollution Analyst",
  description:
    "Top 10 most and least polluted cities nationally, ranked across PM2.5, lifetime cancer risk (AirToxScreen), and TRI air releases.",
  path: "/rankings/cities",
});

export default async function RankingsCitiesPage() {
  const data = await loadRankings();
  const tables = data.cities.tables;
  const anyCountyDerived = tables.some((t) => t.county_derived);

  const pageUrl = `${SITE_URL}/rankings/cities`;
  const crumbs = [{ label: "Rankings" }, { label: "Cities" }];
  const jsonLd = buildRankingsJsonLd({
    pageUrl,
    pageTitle: "Most & Least Polluted Cities — National Rankings",
    pageDescription:
      "Top 10 most and least polluted cities nationally, ranked across PM2.5, lifetime cancer risk (AirToxScreen), and TRI air releases.",
    surfaceLabel: "Cities Rankings",
    crumbs,
    tables,
    rowUrl: (r) => `${SITE_URL}/state/${r.state}/city/${r.slug}`,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader active="rankings-cities" />
      <main>
        <Crumbs items={crumbs} />

        <section className="section">
          <div className="wrap">
            <div className="eyebrow">National rankings · {data.reporting_year}</div>
            <h1 className="h-display" style={{ fontSize: "clamp(32px,4vw,52px)", margin: "8px 0 16px" }}>
              Most &amp; Least Polluted Cities
            </h1>
            <p className="lede" style={{ maxWidth: "62ch" }}>
              City-level rankings across the federal pollution corpus. TRI air
              ranks each city by the chemical releases reported inside its place
              polygon. PM2.5 and lifetime cancer risk are county-grain measurements
              — for those tables, each county is represented by its largest city
              so the ranking doesn&apos;t fill with sibling cities tied at the same
              value.{" "}
              {data.states_covered.length === 1 ? (
                <>
                  Only <strong>{data.states_covered[0].toUpperCase()}</strong> is
                  ingested today; rankings expand to the rest of the country as
                  additional states land.
                </>
              ) : (
                <>
                  Spans <strong>{data.states_covered.length}</strong> ingested states
                  ({data.counts.cities} cities total).
                </>
              )}
            </p>
            {anyCountyDerived ? (
              <p className="muted" style={{ fontSize: 13, marginTop: 12, maxWidth: "62ch" }}>
                Tables marked <em>county-grain measurement</em> use the value for
                the city&apos;s containing county — federal PM2.5 monitors and
                AirToxScreen surfaces are reported at the county level, not the
                place polygon.
              </p>
            ) : null}
          </div>
        </section>

        <JumpStrip items={buildRankingJumpItems(tables)} />

        {tables.map((t) => (
          <RankingTableSection key={`${t.lane}-${t.direction}`} table={t} />
        ))}
      </main>
      <SiteFooter />
    </>
  );
}

function RankingTableSection({ table }: { table: RankingTable }) {
  const isMost = table.direction === "most";
  const override = LANE_OVERRIDES[table.lane];
  const displayLabel = override?.label ?? table.label;
  const tooltip = override?.tooltip;
  const methodologyHref = LANE_METHODOLOGY[table.lane] ?? "/methodology";
  return (
    <section className={`section ${isMost ? "" : "section-tint"}`} id={`${table.lane}-${table.direction}`}>
      <div className="wrap">
        <div style={{ marginBottom: 24 }}>
          <h2 className="h-display" style={{ fontSize: "clamp(24px,2.6vw,34px)", margin: "0" }}>
            Top 10 {isMost ? "Most" : "Least"} Polluted Cities — {displayLabel}{" "}
            <span className="muted">({table.units})</span>
            {tooltip ? (
              <InfoTip heading={tooltip.heading} body={tooltip.body} ariaLabel={`About ${displayLabel}`} />
            ) : null}
          </h2>
          {(() => {
            const caption = CITY_TABLE_CAPTIONS[`${table.lane}:${table.direction}`];
            return caption ? (
              <p className="muted" style={{ fontSize: 14, marginTop: 10, maxWidth: "62ch" }}>
                {caption}
              </p>
            ) : null;
          })()}
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
            <Link href={methodologyHref}>Methodology &rarr;</Link>
          </p>
          {table.county_derived ? (
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              County-grain measurement · cities shown are the largest in each county.
            </p>
          ) : null}
          {table.positive_only && !isMost ? (
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              Among cities with reported activity · cities with zero {displayLabel.toLowerCase()} are excluded so the ranking isn&apos;t filled with places that simply host no facilities.
            </p>
          ) : null}
        </div>
        <table className="tbl">
          <caption className="sr-only">
            Cities ranked by {displayLabel.toLowerCase()} ({table.units}),{" "}
            {isMost ? "highest first" : "lowest first"}.
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ width: 60 }}>#</th>
              <th scope="col">City</th>
              <th scope="col">County</th>
              <th scope="col">State</th>
              <th scope="col" className="right">Population</th>
              <th scope="col" className="right">{displayLabel}</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={`${r.state}/${r.slug}`}>
                <td className="num-mono">{r.rank}</td>
                <td className="name">
                  <Link href={`/state/${r.state}/city/${r.slug}`}>{r.name}</Link>
                </td>
                <td>{r.county_name ?? "—"}</td>
                <td>{r.state_label}</td>
                <td className="right num-mono">
                  {r.population && r.population > 0 ? r.population.toLocaleString() : "—"}
                </td>
                <td className="right num-mono">{r.value_label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
