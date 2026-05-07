import type { Metadata } from "next";
import Link from "next/link";

import { ChemicalCell } from "@/components/site/ChemicalCell";
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

// Editorial caption per lane — superfund tables are "most" only.
const SUPERFUND_TABLE_CAPTIONS: Record<string, string> = {
  contaminants:
    "NPL sites with the most distinct contaminants of concern logged in EPA's SEMS database — chemical complexity rather than mass.",
  water_linkage:
    "NPL sites with the most groundwater-drawing public water systems within roughly five miles — geographic proximity, not confirmed contamination.",
};

export const metadata: Metadata = pageMeta({
  title: "Most Contaminated Superfund Sites — National Rankings | Pollution Analyst",
  description:
    "Federal Superfund / NPL sites with the broadest contamination footprint, ranked by distinct contaminants reported and by nearby groundwater utilities.",
  path: "/rankings/superfund",
});

export default async function RankingsSuperfundPage() {
  const data = await loadRankings();
  const tables = data.superfund.tables;

  const pageUrl = `${SITE_URL}/rankings/superfund`;
  const jsonLd = buildRankingsJsonLd({
    pageUrl,
    pageTitle: "Most Contaminated Superfund Sites — National Rankings",
    pageDescription:
      "Federal Superfund / NPL sites with the broadest contamination footprint, ranked by distinct contaminants reported and by nearby groundwater utilities.",
    surfaceLabel: "Superfund Rankings",
    tables,
    rowUrl: (r) => `${SITE_URL}/state/${r.state}/superfund/${r.slug}`,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader active="rankings-superfund" />
      <main>
        <Crumbs items={[{ label: "Rankings" }, { label: "Superfund" }]} />

        <section className="section">
          <div className="wrap">
            <div className="eyebrow">National rankings · {data.reporting_year}</div>
            <h1 className="h-display" style={{ fontSize: "clamp(32px,4vw,52px)", margin: "8px 0 16px" }}>
              Most Contaminated Superfund Sites
            </h1>
            <p className="lede" style={{ maxWidth: "62ch" }}>
              EPA&apos;s Superfund program tracks the country&apos;s most
              hazardous contaminated sites — current and former industrial,
              military, and waste-disposal properties on the National
              Priorities List. Unlike TRI, SEMS doesn&apos;t publish a pounds
              figure for each site; the rankable signal is contamination
              breadth (distinct contaminants reported) and downstream risk
              (groundwater utilities within roughly five miles). Every site
              on these tables is by definition contaminated; ranking the
              &ldquo;least polluted&rdquo; isn&apos;t a meaningful question.{" "}
              {data.states_covered.length === 1 ? (
                <>
                  Only <strong>{data.states_covered[0].toUpperCase()}</strong> is
                  ingested today; the ranking expands as additional states land.
                </>
              ) : (
                <>
                  Spans <strong>{data.states_covered.length}</strong> ingested states
                  ({data.counts.superfund.toLocaleString()} NPL sites total).
                </>
              )}
            </p>
          </div>
        </section>

        <JumpStrip items={buildRankingJumpItems(tables)} />

        {tables.map((t, i) => (
          <SuperfundRankingSection key={t.lane} table={t} tint={i % 2 === 1} />
        ))}
      </main>
      <SiteFooter />
    </>
  );
}

function SuperfundRankingSection({ table, tint }: { table: RankingTable; tint: boolean }) {
  const override = LANE_OVERRIDES[table.lane];
  const displayLabel = override?.label ?? table.label;
  const tooltip = override?.tooltip;
  const methodologyHref = LANE_METHODOLOGY[table.lane] ?? "/methodology";
  const isWaterLane = table.lane === "water_linkage";
  return (
    <section className={`section ${tint ? "section-tint" : ""}`} id={`${table.lane}-${table.direction}`}>
      <div className="wrap">
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">Top {table.rows.length} NPL sites</div>
          <h2 className="h-display" style={{ fontSize: "clamp(24px,2.6vw,34px)", margin: "8px 0 0" }}>
            {displayLabel} <span className="muted">({table.units})</span>
            {tooltip ? (
              <InfoTip heading={tooltip.heading} body={tooltip.body} ariaLabel={`About ${displayLabel}`} />
            ) : null}
          </h2>
          {SUPERFUND_TABLE_CAPTIONS[table.lane] ? (
            <p className="muted" style={{ fontSize: 14, marginTop: 10, maxWidth: "62ch" }}>
              {SUPERFUND_TABLE_CAPTIONS[table.lane]}
            </p>
          ) : null}
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
            <Link href={methodologyHref}>Methodology &rarr;</Link>
          </p>
        </div>
        <table className="tbl">
          <caption className="sr-only">
            Superfund / NPL sites ranked by {displayLabel.toLowerCase()} ({table.units}), highest first.
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ width: 60 }}>#</th>
              <th scope="col">Site</th>
              <th scope="col">City</th>
              <th scope="col">County</th>
              <th scope="col">State</th>
              {isWaterLane ? (
                <>
                  <th scope="col" className="right">People served</th>
                  <th scope="col" className="right">{displayLabel}</th>
                </>
              ) : (
                <>
                  <th scope="col">Primary contaminant</th>
                  <th scope="col" className="right">{displayLabel}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={`${r.state}/${r.slug}`}>
                <td className="num-mono">{r.rank}</td>
                <td className="name">
                  <Link href={`/state/${r.state}/superfund/${r.slug}`}>{r.name}</Link>
                  {r.is_federal_facility ? (
                    <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                      · federal facility
                    </span>
                  ) : null}
                </td>
                <td>
                  {r.city ? (
                    r.city_slug ? (
                      <Link href={`/state/${r.state}/city/${r.city_slug}`}>{r.city}</Link>
                    ) : (
                      r.city
                    )
                  ) : (
                    "—"
                  )}
                </td>
                <td>{r.county ?? "—"}</td>
                <td>{r.state_label}</td>
                {isWaterLane ? (
                  <>
                    <td className="right num-mono">
                      {r.population_served && r.population_served > 0
                        ? r.population_served.toLocaleString()
                        : "—"}
                    </td>
                    <td className="right num-mono">{r.value_label}</td>
                  </>
                ) : (
                  <>
                    <td>
                      {r.primary_contaminant ? (
                        <ChemicalCell name={r.primary_contaminant} />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="right num-mono">{r.value_label}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
