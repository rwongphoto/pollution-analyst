import type { Metadata } from "next";
import Link from "next/link";

import { Crumbs } from "@/components/site/Crumbs";
import { InfoTip } from "@/components/site/InfoTip";
import { JumpStrip } from "@/components/site/JumpStrip";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { loadRankings } from "@/lib/data";
import { buildRankingJumpItems } from "@/lib/rankingJump";
import { LANE_METHODOLOGY, LANE_OVERRIDES } from "@/lib/rankingLanes";
import { pageMeta } from "@/lib/seo";
import type { RankingTable } from "@/lib/types";

// Editorial caption per lane — facility tables are "most" only, so a single
// key per lane is enough.
const FACILITY_TABLE_CAPTIONS: Record<string, string> = {
  tri_total:
    "The 20 facilities reporting the largest total TRI footprint — air, water, and land disposal combined.",
  tri_air:
    "Facilities reporting the largest air releases — fugitive leaks plus smokestack emissions.",
  tri_water:
    "Facilities reporting the largest surface-water discharges to rivers, lakes, and other receiving streams.",
  tri_land:
    "Facilities reporting the largest land releases — on-site landfills, surface impoundments, and off-site disposal.",
};

export const metadata: Metadata = pageMeta({
  title: "Most Polluting Facilities — National Rankings | Pollution Analyst",
  description:
    "Most polluting industrial facilities nationally — ranked by total TRI releases and broken down by air, water, and land.",
  path: "/rankings/facilities",
});

export default async function RankingsFacilitiesPage() {
  const data = await loadRankings();
  const tables = data.facilities.tables;

  return (
    <>
      <SiteHeader active="rankings-facilities" />
      <main>
        <Crumbs items={[{ label: "Rankings" }, { label: "Facilities" }]} />

        <section className="section">
          <div className="wrap">
            <div className="eyebrow">National rankings · {data.reporting_year}</div>
            <h1 className="h-display" style={{ fontSize: "clamp(32px,4vw,52px)", margin: "8px 0 16px" }}>
              Most Polluting Facilities
            </h1>
            <p className="lede" style={{ maxWidth: "62ch" }}>
              Industrial facilities reporting the largest chemical releases
              under the EPA Toxics Release Inventory. The headline table sums
              air, water, and land together; the three tables below split that
              sum apart so you can see who tops each medium individually. Every
              facility on this list is by definition an emitter; ranking the
              &ldquo;least polluting&rdquo; facility isn&apos;t a meaningful
              question.{" "}
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

        <JumpStrip items={buildRankingJumpItems(tables)} />

        {tables.map((t, i) => (
          <FacilityRankingSection key={t.lane} table={t} tint={i % 2 === 1} />
        ))}
      </main>
      <SiteFooter />
    </>
  );
}

function FacilityRankingSection({ table, tint }: { table: RankingTable; tint: boolean }) {
  const override = LANE_OVERRIDES[table.lane];
  const displayLabel = override?.label ?? table.label;
  const tooltip = override?.tooltip;
  const methodologyHref = LANE_METHODOLOGY[table.lane] ?? "/methodology";
  return (
    <section className={`section ${tint ? "section-tint" : ""}`} id={`${table.lane}-${table.direction}`}>
      <div className="wrap">
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">Top {table.rows.length} most polluting facilities</div>
          <h2 className="h-display" style={{ fontSize: "clamp(24px,2.6vw,34px)", margin: "8px 0 0" }}>
            {displayLabel}
            {tooltip ? (
              <InfoTip heading={tooltip.heading} body={tooltip.body} ariaLabel={`About ${displayLabel}`} />
            ) : null}
          </h2>
          {FACILITY_TABLE_CAPTIONS[table.lane] ? (
            <p className="muted" style={{ fontSize: 14, marginTop: 10, maxWidth: "62ch" }}>
              {FACILITY_TABLE_CAPTIONS[table.lane]}
            </p>
          ) : null}
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
            <Link href={methodologyHref}>Methodology &rarr;</Link>
          </p>
        </div>
        <table className="tbl">
          <caption className="sr-only">
            Industrial facilities ranked by {displayLabel.toLowerCase()} (pounds), highest first.
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ width: 60 }}>#</th>
              <th scope="col">Facility</th>
              <th scope="col">City</th>
              <th scope="col">County</th>
              <th scope="col">State</th>
              <th scope="col">Top chemical</th>
              <th scope="col" className="right">Releases</th>
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
