import type { Metadata } from "next";
import Link from "next/link";

import { Crumbs } from "@/components/site/Crumbs";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { loadRankings } from "@/lib/data";
import { pageMeta } from "@/lib/seo";
import type { RankingTable } from "@/lib/types";

export const metadata: Metadata = pageMeta({
  title: "Most polluted cities — national rankings | Pollution Analyst",
  description:
    "Top 10 most and least polluted cities nationally, ranked across PM2.5, lifetime cancer risk (AirToxScreen), and TRI air releases.",
  path: "/rankings/cities",
});

export default async function RankingsCitiesPage() {
  const data = await loadRankings();
  const tables = data.cities.tables;
  const anyCountyDerived = tables.some((t) => t.county_derived);

  return (
    <>
      <SiteHeader active="rankings-cities" />
      <main>
        <Crumbs items={[{ label: "Rankings" }, { label: "Cities" }]} />

        <section className="section">
          <div className="wrap">
            <div className="eyebrow">National rankings · {data.reporting_year}</div>
            <h1 className="h-display" style={{ fontSize: "clamp(32px,4vw,52px)", margin: "8px 0 16px" }}>
              Most &amp; least polluted cities
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
  return (
    <section className={`section ${isMost ? "" : "section-tint"}`}>
      <div className="wrap">
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">
            {isMost ? "Top 10 most" : "Top 10 least"} polluted cities
          </div>
          <h2 className="h-display" style={{ fontSize: "clamp(24px,2.6vw,34px)", margin: "8px 0 0" }}>
            {table.label} <span className="muted">({table.units})</span>
          </h2>
          {table.county_derived ? (
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              County-grain measurement · cities shown are the largest in each county.
            </p>
          ) : null}
        </div>
        <table className="tbl">
          <caption className="sr-only">
            Cities ranked by {table.label.toLowerCase()} ({table.units}),{" "}
            {isMost ? "highest first" : "lowest first"}.
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ width: 60 }}>#</th>
              <th scope="col">City</th>
              <th scope="col">County</th>
              <th scope="col">State</th>
              <th scope="col" className="right">Population</th>
              <th scope="col" className="right">{table.label}</th>
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
