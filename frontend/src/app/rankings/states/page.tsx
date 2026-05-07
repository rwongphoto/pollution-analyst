import type { Metadata } from "next";
import Link from "next/link";

import { Crumbs } from "@/components/site/Crumbs";
import { InfoTip } from "@/components/site/InfoTip";
import { JumpStrip } from "@/components/site/JumpStrip";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { loadRankings } from "@/lib/data";
import {
  LANE_JUMP_LABEL,
  LANE_METHODOLOGY,
  LANE_OVERRIDES,
} from "@/lib/rankingLanes";
import { buildRankingJumpItems } from "@/lib/rankingJump";
import { buildRankingsJsonLd } from "@/lib/rankingJsonLd";
import { pageMeta, SITE_URL } from "@/lib/seo";
import type { RankingTable } from "@/lib/types";

// Editorial caption shown above each table — one short sentence per lane,
// keyed by (lane, direction). The InfoTip already explains the metric in
// detail; the caption frames what *this* ranking shows so most/least tables
// read distinctly without forcing the user to mouse over the heading.
const STATE_TABLE_CAPTIONS: Record<string, string> = {
  "tri_total:most":
    "States with the largest aggregate TRI footprint — air, water, and land combined. Larger industrial economies surface here.",
  "tri_total:least":
    "States with the smallest aggregate TRI footprint among those with reporting facilities.",
  "tri_air:most":
    "States releasing the most toxic chemicals to the air — fugitive leaks plus smokestack emissions.",
  "tri_air:least":
    "States releasing the least to the air among those with reporting TRI facilities.",
  "tri_water:most":
    "States discharging the most toxic chemicals to surface waters — rivers, lakes, and other receiving streams.",
  "tri_water:least":
    "States with the lowest reported surface-water discharges among those with TRI activity.",
  "tri_land:most":
    "States releasing the most to land — on-site landfills, surface impoundments, and off-site disposal.",
  "tri_land:least":
    "States with the lowest reported land releases among those with TRI activity.",
  "pm25_annual:most":
    "States with the highest annual PM2.5 concentrations averaged across EPA AQS monitor readings.",
  "pm25_annual:least":
    "States with the lowest annual PM2.5 concentrations averaged across EPA AQS monitor readings.",
  "cancer_risk:most":
    "States with the highest AirToxScreen-modeled lifetime cancer risk from local air toxics.",
  "cancer_risk:least":
    "States with the lowest AirToxScreen-modeled lifetime cancer risk from local air toxics.",
  "ghg:most":
    "States with the largest reported GHG footprint under EPA's Greenhouse Gas Reporting Program.",
  "ghg:least":
    "States with the smallest reported GHG footprint among those with GHGRP-reporting emitters.",
};

export const metadata: Metadata = pageMeta({
  title: "Most Polluted States — National Rankings | Pollution Analyst",
  description:
    "Top 10 most and least polluted states nationally, ranked across total TRI releases, PM2.5, lifetime cancer risk (AirToxScreen), and GHG emissions.",
  path: "/rankings/states",
});

export default async function RankingsStatesPage() {
  const data = await loadRankings();
  const tables = data.states.tables;

  const pageUrl = `${SITE_URL}/rankings/states`;
  const jsonLd = buildRankingsJsonLd({
    pageUrl,
    pageTitle: "Most & Least Polluted States — National Rankings",
    pageDescription:
      "Top 10 most and least polluted states nationally, ranked across total TRI releases, PM2.5, lifetime cancer risk (AirToxScreen), and GHG emissions.",
    surfaceLabel: "States Rankings",
    tables,
    rowUrl: (r) => `${SITE_URL}/state/${r.slug}`,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader active="rankings-states" />
      <main>
        <Crumbs items={[{ label: "Rankings" }, { label: "States" }]} />

        <section className="section">
          <div className="wrap">
            <div className="eyebrow">National rankings · {data.reporting_year}</div>
            <h1 className="h-display" style={{ fontSize: "clamp(32px,4vw,52px)", margin: "8px 0 16px" }}>
              Most &amp; Least Polluted States
            </h1>
            <p className="lede" style={{ maxWidth: "62ch" }}>
              State-level rollups of the same federal corpus the rest of this
              site is built on — TRI for chemical releases, EPA AQS for PM2.5,
              AirToxScreen for hazardous-air cancer risk, and GHGRP for
              greenhouse gases. Pounds- and tons-based tables sum every
              reporting facility in each state, so larger industrial economies
              naturally surface at the top; concentration and risk indicators
              (PM2.5, cancer risk) are population-weighted county means.{" "}
              <strong>{data.counts.states}</strong> ingested states ranked
              today; the table fills in as additional states land.
            </p>
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
          <div className="eyebrow">
            {isMost ? "Top 10 most" : "Top 10 least"} polluted states
          </div>
          <h2 className="h-display" style={{ fontSize: "clamp(24px,2.6vw,34px)", margin: "8px 0 0" }}>
            {displayLabel} <span className="muted">({table.units})</span>
            {tooltip ? (
              <InfoTip heading={tooltip.heading} body={tooltip.body} ariaLabel={`About ${displayLabel}`} />
            ) : null}
          </h2>
          {(() => {
            const caption = STATE_TABLE_CAPTIONS[`${table.lane}:${table.direction}`];
            return caption ? (
              <p className="muted" style={{ fontSize: 14, marginTop: 10, maxWidth: "62ch" }}>
                {caption}
              </p>
            ) : null;
          })()}
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
            <Link href={methodologyHref}>Methodology &rarr;</Link>
          </p>
          {table.positive_only && !isMost ? (
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              Among states with reported activity · states with zero {displayLabel.toLowerCase()} are excluded.
            </p>
          ) : null}
        </div>
        <table className="tbl">
          <caption className="sr-only">
            States ranked by {displayLabel.toLowerCase()} ({table.units}),{" "}
            {isMost ? "highest first" : "lowest first"}.
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ width: 60 }}>#</th>
              <th scope="col">State</th>
              <th scope="col" className="right">Population</th>
              <th scope="col" className="right">TRI facilities</th>
              <th scope="col" className="right">{displayLabel}</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.slug}>
                <td className="num-mono">{r.rank}</td>
                <td className="name">
                  <Link href={`/state/${r.slug}`}>{r.name}</Link>
                </td>
                <td className="right num-mono">
                  {r.population && r.population > 0 ? r.population.toLocaleString() : "—"}
                </td>
                <td className="right num-mono">
                  {r.facilities_count !== undefined && r.facilities_count > 0
                    ? r.facilities_count.toLocaleString()
                    : "—"}
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
