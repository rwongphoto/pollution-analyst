import type { Metadata } from "next";
import Link from "next/link";

import { Crumbs } from "@/components/site/Crumbs";
import { InfoTip } from "@/components/site/InfoTip";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { loadRankings } from "@/lib/data";
import { LANE_METHODOLOGY, LANE_OVERRIDES } from "@/lib/rankingLanes";
import { pageMeta } from "@/lib/seo";
import type { RankingTable } from "@/lib/types";

export const metadata: Metadata = pageMeta({
  title: "Most polluted counties — national rankings | Pollution Analyst",
  description:
    "Top 10 most and least polluted counties nationally, ranked across PM2.5, lifetime cancer risk (AirToxScreen), TRI air releases, and GHG emissions.",
  path: "/rankings/counties",
});

export default async function RankingsCountiesPage() {
  const data = await loadRankings();
  const tables = data.counties.tables;

  return (
    <>
      <SiteHeader active="rankings-counties" />
      <main>
        <Crumbs items={[{ label: "Rankings" }, { label: "Counties" }]} />

        <section className="section">
          <div className="wrap">
            <div className="eyebrow">National rankings · {data.reporting_year}</div>
            <h1 className="h-display" style={{ fontSize: "clamp(32px,4vw,52px)", margin: "8px 0 16px" }}>
              Most &amp; Least Polluted Counties
            </h1>
            <p className="lede" style={{ maxWidth: "62ch" }}>
              One ranking per pollution indicator. Each table reads the same federal
              corpus the rest of this site is built on — TRI for chemical releases,
              EPA AQS for PM2.5, AirToxScreen for hazardous-air cancer risk, and
              GHGRP for greenhouse gases.{" "}
              {data.states_covered.length === 1 ? (
                <>
                  Only <strong>{data.states_covered[0].toUpperCase()}</strong> is
                  ingested today; rankings expand to the rest of the country as
                  additional states land.
                </>
              ) : (
                <>
                  Spans <strong>{data.states_covered.length}</strong> ingested states
                  ({data.counts.counties} counties total).
                </>
              )}
            </p>
          </div>
        </section>

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
    <section className={`section ${isMost ? "" : "section-tint"}`}>
      <div className="wrap">
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">
            {isMost ? "Top 10 most" : "Top 10 least"} polluted counties
          </div>
          <h2 className="h-display" style={{ fontSize: "clamp(24px,2.6vw,34px)", margin: "8px 0 0" }}>
            {displayLabel} <span className="muted">({table.units})</span>
            {tooltip ? (
              <InfoTip heading={tooltip.heading} body={tooltip.body} ariaLabel={`About ${displayLabel}`} />
            ) : null}
          </h2>
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
            <Link href={methodologyHref}>Methodology &rarr;</Link>
          </p>
          {table.positive_only && !isMost ? (
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              Among counties with reported activity · counties with zero {displayLabel.toLowerCase()} are excluded so the ranking isn&apos;t filled with places that simply host no facilities.
            </p>
          ) : null}
        </div>
        <table className="tbl">
          <caption className="sr-only">
            Counties ranked by {displayLabel.toLowerCase()} ({table.units}),{" "}
            {isMost ? "highest first" : "lowest first"}.
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ width: 60 }}>#</th>
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
                  <Link href={`/state/${r.state}/county/${r.slug}`}>{r.name}</Link>
                </td>
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
