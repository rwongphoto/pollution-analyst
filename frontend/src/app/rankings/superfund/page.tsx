import type { Metadata } from "next";
import Link from "next/link";

import { ChemicalCell } from "@/components/site/ChemicalCell";
import { Crumbs } from "@/components/site/Crumbs";
import { InfoTip } from "@/components/site/InfoTip";
import { JumpStrip, type JumpItem } from "@/components/site/JumpStrip";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { loadRankings, loadStateNplCounts } from "@/lib/data";
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
  title: "Superfund Site Rankings: Most Contaminated & Impacted Sites | Pollution Analyst",
  description:
    "Data-driven rankings of the most contaminated Superfund / NPL sites by distinct contaminants reported and nearby groundwater utilities — plus how many Superfund sites are in the US and which states have the most.",
  path: "/rankings/superfund",
});

export default async function RankingsSuperfundPage() {
  const [data, stateCounts] = await Promise.all([loadRankings(), loadStateNplCounts()]);
  const tables = data.superfund.tables;

  const totalSites = data.counts.superfund;
  const stateCount = data.states_covered.length;
  const topStates = stateCounts.slice(0, 10);
  const maxNpl = topStates[0]?.npl ?? 0;
  const leadState = stateCounts[0];

  // Build the FAQ once so the visible accordion and the FAQPage JSON-LD render
  // from identical strings — the rich-result markup can never drift from copy.
  const faq: { q: string; a: string }[] = [
    {
      q: "How many Superfund sites are there in the U.S.?",
      a: `Pollution Analyst tracks ${totalSites.toLocaleString()} National Priorities List (NPL) sites across ${stateCount} states, drawn from EPA's SEMS database. The count combines NPL Final sites under active cleanup oversight and NPL Deleted sites where EPA has certified cleanup complete, and it fluctuates as sites are added or deleted. See our Superfund guide for the full program history and statistics.`,
    },
    {
      q: "Which U.S. states have the most Superfund sites?",
      a:
        topStates.length > 1
          ? `By our data, ${topStates
              .slice(0, 5)
              .map((s) => `${s.name} (${s.npl})`)
              .join(", ")} carry the most NPL sites — reflecting their industrial histories and population densities. The full state-by-state distribution is in the "Superfund sites by state" section above.`
          : `State-by-state NPL counts are listed in the regional distribution section above.`,
    },
    {
      q: "What are the largest or worst Superfund sites in the USA?",
      a: `"Largest" and "worst" can mean different things — physical acreage, volume of waste, cost of cleanup, or breadth of contamination. EPA's SEMS database does not publish a single severity score or a pounds-of-waste figure per site, so we rank by two data-driven signals instead: distinct contaminants reported (chemical complexity) and nearby groundwater utilities (downstream drinking-water risk). The sites at the top of these tables — heavily federal facilities such as Cold War military and Department of Energy nuclear sites — are among the most complex in the country.`,
    },
    {
      q: "What does 'distinct contaminants reported' mean for a Superfund site?",
      a: `It quantifies chemical complexity, not mass. The figure counts the distinct contaminants of concern cited in EPA's decision documents for a site across all media — groundwater, soil, sediment, and surface water. A higher number indicates a wider array of different pollutants and a more multifaceted cleanup challenge; it does not mean more tons of waste are present.`,
    },
    {
      q: "How does Superfund site proximity affect nearby groundwater?",
      a: `The "nearby groundwater utilities" metric counts SDWIS-registered public water systems drawing from groundwater within roughly five miles of a site. It flags a potential exposure pathway that warrants investigation — if contamination migrates to an aquifer a utility draws from, drinking water can be affected. Proximity alone reflects geographic plausibility, not confirmed contamination.`,
    },
  ];

  const pageUrl = `${SITE_URL}/rankings/superfund`;
  const jsonLd = buildRankingsJsonLd({
    pageUrl,
    pageTitle: "Superfund Site Rankings: Most Contaminated & Impacted Sites",
    pageDescription:
      "Federal Superfund / NPL sites with the broadest contamination footprint, ranked by distinct contaminants reported and by nearby groundwater utilities.",
    surfaceLabel: "Superfund Rankings",
    tables,
    rowUrl: (r) => `${SITE_URL}/state/${r.state}/superfund/${r.slug}`,
  });
  // Append a FAQPage node to the rankings @graph so the on-page FAQ is eligible
  // for FAQ rich results.
  jsonLd["@graph"].push({
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  } as never);

  const jumpItems: JumpItem[] = [
    ...buildRankingJumpItems(tables),
    { id: "metrics", label: "Ranking metrics" },
    { id: "by-state", label: "Sites by state", show: topStates.length > 1 },
    { id: "faq", label: "FAQ" },
  ];

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
              Top Superfund Site Rankings: Most Contaminated &amp; Highest Risk
            </h1>
            <p className="lede" style={{ maxWidth: "62ch" }}>
              EPA&apos;s Superfund program tracks the country&apos;s most
              hazardous contaminated sites — current and former industrial,
              military, and waste-disposal properties on the National
              Priorities List. Unlike TRI, SEMS doesn&apos;t publish a pounds
              figure for each site, so we rank the biggest and worst Superfund
              sites by two data-driven signals instead: contamination breadth
              (distinct contaminants reported) and downstream risk (groundwater
              utilities within roughly five miles), rather than by acreage or
              cleanup cost. Every site on these tables is by definition
              contaminated; ranking the &ldquo;least polluted&rdquo; isn&apos;t
              a meaningful question. For the full program — what a Superfund
              site is, how cleanup works, and the law behind it — see our{" "}
              <Link href="/superfund-sites-cleanup-guide">
                guide to understanding the Superfund program
              </Link>
              .{" "}
              {stateCount === 1 ? (
                <>
                  Only <strong>{data.states_covered[0].toUpperCase()}</strong> is
                  ingested today; the ranking expands as additional states land.
                </>
              ) : (
                <>
                  Spans <strong>{stateCount}</strong> ingested states
                  ({totalSites.toLocaleString()} NPL sites total).
                </>
              )}
            </p>

            {/* Prominent "how many" answer — directly targets the
                "how many superfund sites are there in the us" query cluster. */}
            <div className="rk-keystat">
              <div className="rk-keystat-num">{totalSites.toLocaleString()}</div>
              <div className="rk-keystat-body">
                <strong>Superfund (NPL) sites tracked in the U.S.</strong>
                <span>
                  Across {stateCount} states, drawn from EPA&apos;s SEMS database.
                  {leadState ? (
                    <>
                      {" "}
                      <Link href={`/state/${leadState.slug}`}>{leadState.name}</Link>{" "}
                      leads with {leadState.npl}.
                    </>
                  ) : null}{" "}
                  <Link href="/superfund-sites-cleanup-guide">
                    Historical context &amp; full statistics →
                  </Link>
                </span>
              </div>
            </div>
          </div>
        </section>

        <JumpStrip items={jumpItems} />

        {tables.map((t, i) => (
          <SuperfundRankingSection key={t.lane} table={t} tint={i % 2 === 1} />
        ))}

        {/* ── Understanding the ranking metrics ─────────────────── */}
        <section className="section section-tint" id="metrics">
          <div className="wrap">
            <h2 className="h-display" style={{ fontSize: "clamp(24px,2.6vw,34px)", margin: "0 0 16px" }}>
              Understanding Superfund Site Contamination Metrics
            </h2>
            <div className="rk-prose">
              <p>
                <strong>Distinct contaminants reported.</strong> This is a count of
                chemical complexity, not mass. A high count means EPA&apos;s decision
                documents name a wide array of different pollutants across multiple
                media — groundwater, soil, sediment, and surface water — signalling a
                multifaceted cleanup challenge. It does not mean more tons of waste are
                present. For why breadth is a useful rankable signal and how it differs
                from other criteria, see{" "}
                <Link href="/superfund-sites-cleanup-guide#contaminants">
                  types of contamination found at Superfund sites
                </Link>
                .
              </p>
              <p>
                <strong>Nearby groundwater utilities (PWSes within ~5 mi).</strong>{" "}
                This counts SDWIS-registered public water systems that draw from
                groundwater within roughly five miles of a site — a measure of
                potential drinking-water exposure. It reflects geographic plausibility,
                not confirmed contamination: SDWIS does not expose individual wellhead
                locations, and proximity alone cannot establish that contamination has
                reached a utility&apos;s intake.
              </p>
              <p>
                <strong>Why these metrics.</strong> SEMS publishes neither a single
                severity score nor a pounds-of-waste figure per site, so the
                conventional &ldquo;largest&rdquo; or &ldquo;worst&rdquo; framings —
                acreage, waste volume, cleanup cost — aren&apos;t uniformly available
                across all sites. Contamination breadth and groundwater proximity are
                both consistently recorded in the federal data, which lets us rank every
                NPL site on the same basis and surface the signals that most inform EPA
                priorities and community risk. See the{" "}
                <Link href="/methodology">methodology</Link> for the full sourcing and
                caveats.
              </p>
            </div>
          </div>
        </section>

        {/* ── Regional distribution / sites by state ────────────── */}
        {topStates.length > 1 ? (
          <section className="section" id="by-state">
            <div className="wrap">
              <h2 className="h-display" style={{ fontSize: "clamp(24px,2.6vw,34px)", margin: "0 0 8px" }}>
                Superfund Sites by State: Which States Have the Most?
              </h2>
              <p className="muted" style={{ fontSize: 14, margin: "0 0 20px", maxWidth: "62ch" }}>
                NPL site counts per state across the {totalSites.toLocaleString()} sites
                tracked. {leadState ? `${leadState.name} carries the most (${leadState.npl}); ` : ""}
                states with deep industrial and military legacies cluster at the top.
                Below are the ten states with the most Superfund sites.
              </p>
              <ol className="rk-bars">
                {topStates.map((s, i) => (
                  <li key={s.slug}>
                    <span className="rk-bar-rank">{i + 1}</span>
                    <Link className="rk-bar-name" href={`/state/${s.slug}`}>
                      {s.name}
                    </Link>
                    <span className="rk-bar-track" aria-hidden="true">
                      <span
                        className="rk-bar-fill"
                        style={{ width: `${maxNpl ? (s.npl / maxNpl) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="rk-bar-val num-mono">{s.npl}</span>
                  </li>
                ))}
              </ol>
              <p className="muted" style={{ margin: "16px 0 0", fontSize: 13 }}>
                Browse all NPL sites in any state from its{" "}
                <Link href="/states">state pollution page</Link>. Source: EPA SEMS via
                Pollution Analyst pipeline.
              </p>
            </div>
          </section>
        ) : null}

        {/* ── FAQ ───────────────────────────────────────────────── */}
        <section className="section section-tint" id="faq">
          <div className="wrap">
            <h2 className="h-display" style={{ fontSize: "clamp(24px,2.6vw,34px)", margin: "0 0 16px" }}>
              Frequently Asked Questions About Superfund Site Rankings
            </h2>
            <div className="rk-faq">
              {faq.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <div className="answer">
                    {f.q === "How many Superfund sites are there in the U.S.?" ? (
                      <>
                        Pollution Analyst tracks {totalSites.toLocaleString()} National
                        Priorities List (NPL) sites across {stateCount} states, drawn from
                        EPA&apos;s SEMS database. The count combines NPL Final sites under
                        active cleanup oversight and NPL Deleted sites where EPA has
                        certified cleanup complete, and it fluctuates as sites are added or
                        deleted. See our{" "}
                        <Link href="/superfund-sites-cleanup-guide">Superfund guide</Link>{" "}
                        for the full program history and statistics.
                      </>
                    ) : (
                      f.a
                    )}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
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
          <h2 className="h-display" style={{ fontSize: "clamp(24px,2.6vw,34px)", margin: "0" }}>
            Top {table.rows.length} Most Contaminated Superfund Sites — {displayLabel}{" "}
            <span className="muted">({table.units})</span>
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
