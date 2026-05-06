import type { Metadata } from "next";
import Link from "next/link";

import { Crumbs } from "@/components/site/Crumbs";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { loadRankings } from "@/lib/data";
import { pageMeta } from "@/lib/seo";
import type { RankingTable } from "@/lib/types";

export const metadata: Metadata = pageMeta({
  title: "Most polluting facilities — national rankings | Pollution Analyst",
  description:
    "Top 20 most polluting industrial facilities nationally, ranked by total TRI releases (air + water + land).",
  path: "/rankings/facilities",
});

export default async function RankingsFacilitiesPage() {
  const data = await loadRankings();
  const table = data.facilities.tables[0];

  return (
    <>
      <SiteHeader active="rankings-facilities" />
      <main>
        <Crumbs items={[{ label: "Rankings" }, { label: "Facilities" }]} />

        <section className="section">
          <div className="wrap">
            <div className="eyebrow">National rankings · {data.reporting_year}</div>
            <h1 className="h-display" style={{ fontSize: "clamp(32px,4vw,52px)", margin: "8px 0 16px" }}>
              Most polluting facilities
            </h1>
            <p className="lede" style={{ maxWidth: "62ch" }}>
              The 20 industrial facilities reporting the largest total chemical
              releases — air, water, and land combined — under the EPA Toxics
              Release Inventory. Every facility on this list is by definition
              an emitter; ranking the &ldquo;least polluting&rdquo; facility
              isn&apos;t a meaningful question.{" "}
              {data.states_covered.length === 1 ? (
                <>
                  Only <strong>{data.states_covered[0].toUpperCase()}</strong> is
                  ingested today; the ranking expands to the rest of the country
                  as additional states land.
                </>
              ) : (
                <>
                  Spans <strong>{data.states_covered.length}</strong> ingested states
                  ({data.counts.facilities.toLocaleString()} facilities total).
                </>
              )}
            </p>
          </div>
        </section>

        {table ? <FacilityRankingSection table={table} /> : null}
      </main>
      <SiteFooter />
    </>
  );
}

function FacilityRankingSection({ table }: { table: RankingTable }) {
  return (
    <section className="section">
      <div className="wrap">
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">Top 20 most polluting facilities</div>
          <h2 className="h-display" style={{ fontSize: "clamp(24px,2.6vw,34px)", margin: "8px 0 0" }}>
            {table.label}
          </h2>
        </div>
        <table className="tbl">
          <caption className="sr-only">
            Industrial facilities ranked by total TRI releases (pounds), highest first.
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ width: 60 }}>#</th>
              <th scope="col">Facility</th>
              <th scope="col">City</th>
              <th scope="col">County</th>
              <th scope="col">State</th>
              <th scope="col">Top chemical</th>
              <th scope="col" className="right">Total releases</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={`${r.state}/${r.slug}`}>
                <td className="num-mono">{r.rank}</td>
                <td className="name">
                  <Link href={`/state/${r.state}/facility/${r.slug}`}>{r.name}</Link>
                </td>
                <td>{r.city ?? "—"}</td>
                <td>{r.county ?? "—"}</td>
                <td>{r.state_label}</td>
                <td>{r.top_chemical ?? "—"}</td>
                <td className="right num-mono">{r.value_label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
