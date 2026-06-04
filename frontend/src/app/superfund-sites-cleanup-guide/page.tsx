import type { Metadata } from "next";
import Link from "next/link";

import { ChemicalCell } from "@/components/site/ChemicalCell";
import { Crumbs } from "@/components/site/Crumbs";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { loadRankings } from "@/lib/data";
import { pageMeta, SITE_URL } from "@/lib/seo";

const PATH = "/superfund-sites-cleanup-guide";

export const metadata: Metadata = pageMeta({
  title: "Superfund Sites and Cleanup: A Comprehensive Guide | Pollution Analyst",
  description:
    "A comprehensive guide to EPA Superfund sites — what they are, how the cleanup process works, key legislation, current statistics, and environmental-justice context for the NPL sites tracked across the US.",
  path: PATH,
});

// Visible FAQ accordion and the FAQPage JSON-LD are generated from one source
// so the rich-result markup can never drift from the on-page copy.
const FAQ: { q: string; a: string }[] = [
  {
    q: "What is a Superfund site?",
    a: "A Superfund site is a contaminated location in the United States that EPA has identified as posing a significant risk to human health or the environment. Sites that score 28.5 or higher on EPA's Hazard Ranking Score are proposed for — and, after public comment, listed on — the National Priorities List, making them eligible for federally directed cleanup under the Comprehensive Environmental Response, Compensation, and Liability Act (CERCLA). NPL sites span former industrial plants, military installations, mines, landfills, and other contaminated properties.",
  },
  {
    q: "How many Superfund sites are there in the United States?",
    a: "Pollution Analyst's current database tracks 1,814 NPL sites across all 50 states, drawn from EPA's SEMS database as of the May 2026 pipeline run. The total includes NPL Final sites under ongoing cleanup oversight and NPL Deleted sites where EPA has certified cleanup completion. Separate from the NPL, EPA also tracks thousands of less-hazardous sites under other cleanup programs; the 1,814 figure reflects only the most hazardous National Priorities List sites.",
  },
  {
    q: "What is CERCLA and how does it relate to Superfund?",
    a: "CERCLA — the Comprehensive Environmental Response, Compensation, and Liability Act — is the 1980 federal law that created the Superfund program. It gave EPA authority to investigate, rank, and clean up contaminated sites, and established that current and former owners, operators, and waste generators at a site can be held strictly, jointly, and severally liable for cleanup costs. CERCLA also created the Superfund trust fund (initially capitalized by taxes on petroleum and chemical industries) to finance cleanups when responsible parties cannot pay. The Inflation Reduction Act of 2022 reinstated the excise tax that funds the trust.",
  },
  {
    q: "Which states have the most Superfund sites?",
    a: "Nationally, New Jersey, California, Pennsylvania, and New York consistently carry the highest counts of NPL sites, reflecting their industrial histories and population densities. Federal-facility-heavy states — including Colorado, South Carolina, and Washington — also appear prominently when military and DOE installations are counted. State-level totals are browsable on each state's pollution page on this site.",
  },
  {
    q: "How long does Superfund cleanup take?",
    a: "Cleanup timelines vary enormously. Simple sites with a single contamination source and well-defined plume can reach construction completion in a few years. Large, complex sites — particularly federal facilities with radioactive or multi-media contamination across hundreds of acres — often require decades of active remediation followed by decades more of monitored natural attenuation and institutional controls. The median time from NPL listing to construction completion for completed sites has historically been roughly 10–15 years, but the most complex federal sites have been on the NPL for 40+ years.",
  },
  {
    q: "What is the difference between an NPL Final site and an NPL Deleted site?",
    a: "An NPL Final site has been formally listed on the National Priorities List and is under active EPA Superfund oversight — either in one of the cleanup phases (RI/FS, RD/RA, construction completion) or in long-term post-construction monitoring. An NPL Deleted site has had its cleanup objectives certified as complete by EPA and the relevant state; EPA has determined no further Superfund response is needed. Deletion is based on the intended land use — a site cleaned for industrial use may still have residual contamination levels that preclude residential use.",
  },
  {
    q: "Does living near a Superfund site mean I'm being exposed to contamination?",
    a: "Proximity to an NPL site does not by itself establish that nearby residents are exposed to site contaminants. Exposure depends on the contamination media (soil, groundwater, air, sediment), migration pathways, site controls (engineered caps, groundwater pump-and-treat systems, institutional controls restricting land use), and the hydrogeology of the area. Some sites have been cleaned to a level where actual exposure is negligible; others still present active risk. EPA's five-year review process is specifically designed to verify ongoing protectiveness. For site-specific exposure questions, the EPA SEMS record and the relevant Record of Decision are the authoritative source.",
  },
  {
    q: "How does Superfund site proximity affect nearby public water systems?",
    a: "The primary pathway of concern is groundwater: if contamination migrates from a site to an aquifer used by a public water system, drinking-water supplies can be affected. The risk varies by site geology, depth to the water table, and the distance and hydraulic gradient between the site and the well intake. Our site pages list all SDWIS-registered public water systems drawing from groundwater within approximately 5 miles of each NPL site. Listing reflects geographic proximity, not confirmed contamination — SDWIS does not expose individual wellhead locations, and proximity data alone cannot establish an exposure pathway.",
  },
];

export default async function SuperfundGuidePage() {
  const data = await loadRankings();
  const pageUrl = `${SITE_URL}${PATH}`;

  // Data-driven facts so the headline stats and table never drift from the
  // live rankings publish. The "contaminants" lane is the broadest-footprint
  // ranking; row 0 is the single most-contaminated site nationally.
  const contaminants = data.superfund.tables.find((t) => t.lane === "contaminants");
  const topRows = (contaminants?.rows ?? []).slice(0, 10);
  const top = topRows[0];
  const totalSites = data.counts.superfund;
  const stateCount = data.states_covered.length;
  const fedInTop10 = topRows.filter((r) => r.is_federal_facility).length;
  const retrieved = (data._published_at ?? "").slice(0, 10);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#org`,
        name: "Pollution Analyst",
        url: `${SITE_URL}/`,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          {
            "@type": "ListItem",
            position: 2,
            name: "Superfund Sites and Cleanup",
            item: pageUrl,
          },
        ],
      },
      {
        "@type": "Article",
        headline: "Superfund Sites and Cleanup: A Comprehensive Guide",
        description:
          "What Superfund sites are, how the EPA cleanup process works from discovery to deletion, key legislation, current statistics, and environmental-justice context.",
        url: pageUrl,
        author: { "@id": `${SITE_URL}/#org` },
        publisher: { "@id": `${SITE_URL}/#org` },
        inLanguage: "en-US",
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader active="superfund-guide" />
      <main>
        <Crumbs items={[{ label: "Superfund Sites and Cleanup" }]} />
        <div className="guide-page">
          <div className="wrap-narrow">
            {/* ── Header ─────────────────────────────────────────── */}
            <header className="guide-header">
              <div className="eyebrow">
                Comprehensive Guide · EPA Superfund SEMS · TRI {data.reporting_year} publish
              </div>
              <h1>Superfund Sites and Cleanup: A Comprehensive Guide</h1>
              <p className="lede">
                EPA&apos;s Superfund program — formally the National Priorities List
                under CERCLA — identifies the country&apos;s most severely
                contaminated sites and funds their remediation. This page explains
                what a Superfund site is, how the cleanup process works from
                discovery to deletion, who pays, and what the data says about the{" "}
                {totalSites.toLocaleString()} NPL sites currently tracked.
              </p>

              <div className="stat-strip">
                <div className="stat-cell">
                  <div className="label">NPL sites tracked</div>
                  <div className="value">{totalSites.toLocaleString()}</div>
                  <div className="sub">Across {stateCount} states</div>
                </div>
                <div className="stat-cell">
                  <div className="label">Max contaminants · single site</div>
                  <div className="value">{top ? top.value_label : "—"}</div>
                  <div className="sub">{top ? `${top.name}, ${top.state.toUpperCase()}` : ""}</div>
                </div>
                <div className="stat-cell">
                  <div className="label">Federal facilities</div>
                  <div className="value">~30%</div>
                  <div className="sub">Military &amp; DOE sites</div>
                </div>
                <div className="stat-cell">
                  <div className="label">Data source</div>
                  <div className="value">SEMS</div>
                  <div className="sub">EPA{retrieved ? `, retrieved ${retrieved}` : ""}</div>
                </div>
              </div>
            </header>

            {/* ── Jump nav ───────────────────────────────────────── */}
            <nav className="guide-jump" aria-label="Page sections">
              <span className="jump-label">Jump to</span>
              <a href="#what-is">What Is a Superfund Site</a>
              <a href="#history">History</a>
              <a href="#process">Cleanup Process</a>
              <a href="#contaminants">Contaminants</a>
              <a href="#statistics">Statistics</a>
              <a href="#ej">Equity Context</a>
              <a href="#find">Find Sites</a>
              <a href="#faq">FAQ</a>
            </nav>

            {/* ── 1. What is a Superfund site ─────────────────────── */}
            <section className="guide-section" id="what-is">
              <div className="section-head">
                <div className="kicker">Definition &amp; Purpose</div>
                <h2>What Are Superfund Sites?</h2>
              </div>
              <p>
                A <strong>Superfund site</strong> is a contaminated property that the
                EPA has determined poses a significant risk to human health or the
                environment due to hazardous substances — waste, chemical releases, or
                radioactive material left by former or current industrial, military, or
                commercial operations. Sites above a threshold hazard score are placed on
                the <strong>National Priorities List (NPL)</strong>, making them eligible
                for federally directed cleanup under CERCLA.
              </p>
              <p>
                The term &ldquo;Superfund&rdquo; refers to the trust fund Congress
                created to finance cleanups — initially capitalized through taxes on the
                petroleum and chemical industries, later dependent on general
                appropriations. The name stuck even after the dedicated tax expired.
              </p>
              <p>
                NPL sites are not a uniform category. They include former industrial
                plants, federal military bases, mining operations, municipal landfills,
                and smelter sites. What they share is a Hazard Ranking Score (HRS) above
                28.5, calculated by EPA using a standardized methodology that weighs
                contamination pathways — groundwater, surface water, soil, and air —
                against the population and sensitive environments exposed.
              </p>

              <div className="callout">
                <strong>NPL Final vs. NPL Deleted.</strong> A site on the &ldquo;NPL
                Final&rdquo; list is under active federal cleanup oversight. An &ldquo;NPL
                Deleted&rdquo; site has had its cleanup objectives certified by EPA as
                complete — contamination has been addressed to levels that allow the
                intended land use. Deletion is not the same as a clean bill of health for
                all possible uses.
              </div>

              <div className="two-col">
                <div className="two-col-cell">
                  <h3>Common Superfund Site Types</h3>
                  <ul>
                    <li>Former industrial plants &amp; chemical manufacturers</li>
                    <li>Military installations (DoD) &amp; weapons ranges</li>
                    <li>Department of Energy (DOE) nuclear facilities</li>
                    <li>Mining and smelting operations</li>
                    <li>Municipal and private landfills</li>
                    <li>Wood-treatment &amp; metal-plating facilities</li>
                    <li>Dry-cleaning solvent plumes in groundwater</li>
                  </ul>
                </div>
                <div className="two-col-cell">
                  <h3>Pathways EPA Evaluates</h3>
                  <ul>
                    <li>Groundwater migration to drinking-water wells</li>
                    <li>Surface water &amp; sediment exposure</li>
                    <li>Soil direct-contact (residential, commercial)</li>
                    <li>Air pathway from vapor intrusion</li>
                    <li>Ecological receptor exposure</li>
                    <li>Proximity to sensitive populations</li>
                    <li>Nearby public water system intake</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* ── 2. History ─────────────────────────────────────── */}
            <section className="guide-section" id="history">
              <div className="section-head">
                <div className="kicker">Legislative Background</div>
                <h2>A Brief History of the Superfund Program</h2>
              </div>
              <p>
                The program traces directly to one watershed moment: the Love Canal
                disaster in Niagara Falls, New York, where residents of a residential
                neighborhood built over a former chemical dump reported unusually high
                rates of illness and birth defects in the late 1970s. Federal
                investigation confirmed that Hooker Chemical had buried over 21,000 tons
                of toxic waste beneath the site decades earlier. The contamination, long
                sealed, had migrated into basements, schoolyards, and bodies.
              </p>
              <p>
                Congress responded in December 1980 with the{" "}
                <strong>
                  Comprehensive Environmental Response, Compensation, and Liability Act
                  (CERCLA)
                </strong>
                , signed by President Carter. CERCLA did three things simultaneously: it
                created a trust fund to pay for cleanups when responsible parties
                couldn&apos;t be identified or compelled; it gave EPA broad authority to
                investigate, rank, and remediate sites; and it established{" "}
                <strong>strict, joint, and several liability</strong> — meaning any party
                that contributed waste to a site could be held responsible for the full
                cost of cleanup.
              </p>
              <p>
                The 1986 Superfund Amendments and Reauthorization Act (SARA) strengthened
                cleanup standards, introduced community right-to-know provisions, and
                added the Emergency Planning and Community Right-to-Know Act (EPCRA) — the
                legal basis for the TRI reporting that this site also covers. Subsequent
                amendments broadened protections for innocent landowners and sharpened
                cleanup criteria.
              </p>
              <div className="callout amber">
                <strong>The dedicated tax lapsed in 1995.</strong> CERCLA originally
                funded the Superfund trust through excise taxes on petroleum and chemical
                feedstocks. Congress allowed those taxes to expire in 1995; the fund ran
                near-empty for years, slowing cleanups. The Inflation Reduction Act of
                2022 reinstated the Superfund excise tax, providing a more stable funding
                stream for ongoing remediation.
              </div>
            </section>

            {/* ── 3. Cleanup process ─────────────────────────────── */}
            <section className="guide-section" id="process">
              <div className="section-head">
                <div className="kicker">From Discovery to Deletion</div>
                <h2>The Superfund Cleanup Process</h2>
              </div>
              <p>
                EPA&apos;s remediation framework is defined in the National Contingency
                Plan (NCP). A site moves through a structured sequence; each gate requires
                a formal EPA finding or document. The process is long — median time from
                NPL listing to construction completion has historically exceeded a decade
                for complex sites — but each phase serves a defined evidentiary purpose.
              </p>

              <ol className="steps">
                {[
                  [
                    "Site Discovery & Preliminary Assessment (PA)",
                    "EPA or a state agency receives a complaint, referral, or discovers the site during routine environmental review. A desk-based Preliminary Assessment reviews available records (former uses, permits, spill history) to determine whether a full inspection is warranted.",
                  ],
                  [
                    "Site Inspection (SI)",
                    "Field investigators collect air, soil, and water samples at and around the site. The goal is to characterize what is present, in which media, at what concentrations — enough to calculate a Hazard Ranking Score.",
                  ],
                  [
                    "Hazard Ranking Score & NPL Proposal",
                    "EPA applies the HRS model, integrating contamination severity, migration potential, and population exposure. Sites scoring ≥ 28.5 are proposed for the NPL; a public comment period follows. Federal facility sites (military, DOE) can be listed through a separate interagency agreement process.",
                  ],
                  [
                    "Remedial Investigation / Feasibility Study (RI/FS)",
                    "The most resource-intensive phase. A Remedial Investigation defines the full nature and extent of contamination — what chemicals, in what concentrations, in which media, across the entire affected area. The Feasibility Study then evaluates alternative cleanup approaches against EPA's nine criteria, including long-term effectiveness, implementability, and cost.",
                  ],
                  [
                    "Record of Decision (ROD)",
                    "EPA issues a Record of Decision that formally selects the cleanup remedy — excavation, in-situ treatment, containment, groundwater pump-and-treat, monitored natural attenuation, or combinations. The ROD is a public document; all EPA-approved RODs are indexed in the SEMS database, which underpins the contaminant data on this site.",
                  ],
                  [
                    "Remedial Design & Remedial Action (RD/RA)",
                    "Engineers develop detailed design documents (Remedial Design); contractors then execute the physical cleanup (Remedial Action). This phase can span years for large, complex sites with multiple operable units — distinct zones or contamination problems addressed sequentially.",
                  ],
                  [
                    "Construction Completion",
                    "EPA certifies that all physical construction activities defined in the ROD are complete. This milestone does not mean the site is clean — post-construction monitoring often continues for decades, especially for groundwater plumes with long restoration timelines.",
                  ],
                  [
                    "Post-Construction & Five-Year Reviews",
                    "EPA conducts five-year reviews for every site where hazardous substances remain above unrestricted-use levels. These reviews assess whether the remedy remains protective of human health and the environment — a critical oversight mechanism for sites with ongoing institutional controls or engineered covers.",
                  ],
                  [
                    "NPL Deletion",
                    "A site is deleted from the NPL when EPA and the state determine that all cleanup objectives have been met and no further action is needed. Partial deletion applies to portions of large multi-operable-unit sites. Deleted sites remain indexed in SEMS; their cleanup history is permanent public record.",
                  ],
                ].map(([h, body], i) => (
                  <li className="step" key={i}>
                    <span className="step-num">{i + 1}</span>
                    <div className="step-content">
                      <h3>{h}</h3>
                      <p>{body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="callout signal">
                <strong>Who pays?</strong> CERCLA&apos;s liability scheme targets{" "}
                <em>potentially responsible parties</em> (PRPs) — current and former
                owners or operators, generators of waste sent to the site, and
                transporters. EPA can compel PRPs to conduct or fund cleanup directly, or
                it can use Superfund appropriations and seek cost recovery later. When no
                viable PRP exists, federal funds cover the work.
              </div>
            </section>

            {/* ── 4. Contaminants ────────────────────────────────── */}
            <section className="guide-section" id="contaminants">
              <div className="section-head">
                <div className="kicker">Chemical Complexity</div>
                <h2>Types of Contamination Found at Superfund Sites</h2>
              </div>
              <p>
                EPA&apos;s SEMS database records contaminants of concern at each NPL site
                — the chemicals named in formal decision documents (Records of Decision
                and related). A single site may list dozens to hundreds of distinct
                chemicals across multiple media.
                {top ? (
                  <>
                    {" "}
                    The most contaminated site in our database, the {top.name} in{" "}
                    {top.state_label}, carries {top.value_label} distinct contaminants.
                  </>
                ) : null}
              </p>
              <p>
                Contamination type varies systematically by site origin. Industrial and
                chemical manufacturing sites dominate for volatile organic compounds and
                heavy metals. Former military installations disproportionately appear in
                the PFAS and solvent categories. Department of Energy sites carry
                radioactive contamination — cesium, uranium, technetium — that is
                essentially absent from civilian industrial sites.
              </p>

              <div className="two-col">
                <div className="two-col-cell">
                  <h3>Most Frequently Cited — Soil</h3>
                  <ul>
                    <li>Arsenic</li>
                    <li>Lead and lead compounds</li>
                    <li>Benzo[a]pyrene and PAHs</li>
                    <li>PCBs (Aroclors)</li>
                    <li>Mercury</li>
                    <li>Cadmium</li>
                    <li>Trichloroethene (TCE)</li>
                  </ul>
                </div>
                <div className="two-col-cell">
                  <h3>Most Frequently Cited — Groundwater</h3>
                  <ul>
                    <li>Trichloroethene (TCE)</li>
                    <li>Tetrachloroethene (PCE)</li>
                    <li>Benzene</li>
                    <li>Carbon tetrachloride</li>
                    <li>Vinyl chloride</li>
                    <li>Chloroform</li>
                    <li>Arsenic</li>
                  </ul>
                </div>
              </div>

              <p style={{ marginTop: 20 }}>
                Contaminants across the NPL span several health-endpoint categories.
                Classifications below follow EPA and ATSDR designations:
              </p>

              <div className="chip-row">
                <span className="chip low">Carcinogen · Benzene</span>
                <span className="chip low">Carcinogen · Benzo[a]pyrene</span>
                <span className="chip low">Carcinogen · Arsenic</span>
                <span className="chip low">Carcinogen · TCE</span>
                <span className="chip mid">PBT · Lead</span>
                <span className="chip mid">PBT · Mercury</span>
                <span className="chip mid">PBT · PCBs (Aroclors)</span>
                <span className="chip mid">PBT · Cadmium</span>
                <span className="chip high">Radionuclide · Cesium-137</span>
                <span className="chip high">Radionuclide · Uranium</span>
                <span className="chip high">Radionuclide · Technetium-99</span>
                <span className="chip ink">Solvent · PCE</span>
                <span className="chip ink">Solvent · Chloroform</span>
                <span className="chip ink">Heavy metal · Manganese</span>
                <span className="chip ink">Heavy metal · Chromium</span>
              </div>

              <p className="source-line">
                PBT = Persistent, Bioaccumulative, and Toxic. Classifications per EPA TRI
                and ATSDR priority substance lists. Carcinogen designations per IARC Group
                1 or EPA carcinogen weight-of-evidence Category A/B1.
              </p>

              <div className="callout">
                <strong>Contamination breadth is not mass.</strong> SEMS records which
                contaminants appear in decision documents — not how many pounds are
                present. A site with 300 distinct contaminants and a site with 3 are both
                on the NPL because both cleared the HRS threshold. Breadth signals
                chemical complexity; it does not rank absolute hazard. See the{" "}
                <Link href="/rankings/superfund">national rankings page</Link> for how we
                use distinct contaminant count as a rankable signal and why.
              </div>
            </section>

            {/* ── 5. Statistics ──────────────────────────────────── */}
            <section className="guide-section" id="statistics">
              <div className="section-head">
                <div className="kicker">
                  Current Data · {totalSites.toLocaleString()} NPL Sites
                </div>
                <h2>How Many Superfund Sites Are There in the US?</h2>
              </div>
              <p>
                Pollution Analyst&apos;s current database spans{" "}
                <strong>{totalSites.toLocaleString()} NPL sites</strong> across all{" "}
                {stateCount}{" "}
                ingested states, drawn from EPA&apos;s Superfund Enterprise Management
                System (SEMS){retrieved ? ` as of the ${retrieved} pipeline run` : ""}.
                This total combines NPL Final sites (under active or completed cleanup
                oversight) and a smaller number of NPL Deleted sites where EPA has
                certified cleanup completion.
              </p>
              <p>
                The top {topRows.length} most contaminated sites by distinct contaminants
                reported are led by federal facilities — particularly Department of Energy
                nuclear production sites and Cold War-era military installations, which
                carry both chemical and radioactive contamination across enormous
                acreages.
              </p>

              <table
                className="data-table"
                aria-label={`Top ${topRows.length} most contaminated Superfund sites by distinct contaminants reported`}
              >
                <thead>
                  <tr>
                    <th className="rank">#</th>
                    <th>Site</th>
                    <th>State</th>
                    <th>Primary contaminant</th>
                    <th className="num">Contaminants</th>
                  </tr>
                </thead>
                <tbody>
                  {topRows.map((r) => (
                    <tr key={`${r.state}/${r.slug}`}>
                      <td className="rank">{r.rank}</td>
                      <td>
                        <Link
                          className="site-name"
                          href={`/state/${r.state}/superfund/${r.slug}`}
                        >
                          {r.name}
                        </Link>
                        {r.is_federal_facility ? (
                          <span className="badge badge-fed">Federal</span>
                        ) : null}
                      </td>
                      <td>{r.state.toUpperCase()}</td>
                      <td>
                        {r.primary_contaminant ? (
                          <ChemicalCell name={r.primary_contaminant} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="num">{r.value_label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="source-line">
                Source: EPA SEMS via Pollution Analyst pipeline{retrieved ? `, ${retrieved}` : ""}.
                Contaminant count = distinct (contaminant, medium) pairs cited in EPA
                decision records.{" "}
                <Link href="/rankings/superfund">Full top-20 ranking →</Link>
              </p>

              <div className="callout green">
                <strong>Federal facilities are overrepresented at the top.</strong>{" "}
                {fedInTop10} of the top {topRows.length} most-contaminated sites by
                distinct contaminants are federal facilities — military installations and
                DOE nuclear sites. This reflects their scale (often thousands of acres) and
                the chemical and radiological complexity of Cold War-era industrial and
                weapons production.
              </div>
            </section>

            {/* ── 6. Equity ──────────────────────────────────────── */}
            <section className="guide-section" id="ej">
              <div className="section-head">
                <div className="kicker">Environmental Justice</div>
                <h2>Impact on Communities and the Environment</h2>
              </div>
              <p>
                Superfund sites are not randomly distributed across communities. Decades
                of environmental justice research — and EPA&apos;s own EJScreen data
                before the tool was retired in 2025 — document a consistent pattern: NPL
                sites are disproportionately located near communities that are
                lower-income, have higher shares of people of color, and face cumulative
                environmental burdens from other sources.
              </p>
              <p>
                This site surfaces the equity context on every NPL site page: population
                demographics within a 1-mile buffer, national EJ percentile ranks per
                indicator, and EPA&apos;s EJ disparity scores. A score above 150 is widely
                considered notable; above 200 is severe.
              </p>

              <p>
                <strong>
                  Example:{" "}
                  <Link href="/state/ca/superfund/hunters-point-naval-shipyard">
                    Hunters Point Naval Shipyard
                  </Link>
                  , San Francisco
                </strong>
              </p>

              <div className="ej-grid">
                <div className="ej-cell">
                  <div className="ej-label">Population within 1 mile</div>
                  <div className="ej-value">5,967</div>
                  <div className="ej-desc">4 Census block groups</div>
                </div>
                <div className="ej-cell">
                  <div className="ej-label">People of color share</div>
                  <div className="ej-value">93.7%</div>
                  <div className="ej-desc">Population-weighted</div>
                </div>
                <div className="ej-cell">
                  <div className="ej-label">Low-income share</div>
                  <div className="ej-value">41.8%</div>
                  <div className="ej-desc">ACS 2018–2022</div>
                </div>
                <div className="ej-cell">
                  <div className="ej-label">Contaminants logged</div>
                  <div className="ej-value">223</div>
                  <div className="ej-desc">Rank #13 nationally</div>
                </div>
              </div>

              <p style={{ marginTop: 20 }}>
                The Hunters Point pattern is not unusual for Superfund sites in urban
                industrial areas. The equity overlay on every site page is drawn from
                Census ACS 2018–2022 block-group demographics and the EPA-maintained EJ
                disparity data published via the USEPA-clone/ejamdata repository.
              </p>

              <div className="callout">
                <strong>Proximity is not confirmed exposure.</strong> Living near an NPL
                site does not guarantee that residents are exposed to site contaminants —
                it depends on contamination media, migration pathways, and site controls.
                We surface proximity and demographics because they describe who bears the
                potential burden; causal attribution requires site-specific exposure data
                that exceeds what SEMS publishes. See the{" "}
                <Link href="/methodology">methodology</Link> for how the equity overlay is
                computed.
              </div>
            </section>

            {/* ── 7. Find sites ──────────────────────────────────── */}
            <section className="guide-section" id="find">
              <div className="section-head">
                <div className="kicker">Navigation</div>
                <h2>Finding Superfund Sites Near You</h2>
              </div>
              <p>
                Pollution Analyst publishes a page for every NPL site in the database,
                organized by state and county. Each site page shows contaminant records
                from EPA SEMS, nearby groundwater public water systems, and the equity
                context for surrounding block groups.
              </p>
              <p>
                <strong>By national ranking</strong> — the{" "}
                <Link href="/rankings/superfund">Superfund rankings page</Link> lists the
                top 20 most contaminated sites nationally and the top 10 sites with the
                most nearby groundwater utilities. This is the fastest way to identify the
                highest-complexity sites across the country.
              </p>
              <p>
                <strong>By state</strong> — each state page includes a table of all NPL
                sites in the state with status, primary contaminant, and federal facility
                flag. Navigate to any state via the States menu or the homepage.
              </p>
              <p>
                <strong>By city or county</strong> — county and city pages include a
                Superfund section listing every NPL site within the jurisdiction, with
                direct links to site profiles.
              </p>

              <div className="related-grid">
                <div className="related-cell">
                  <div className="rel-label">Rankings</div>
                  <Link href="/rankings/superfund">Most Contaminated Superfund Sites</Link>
                  <div className="rel-desc">
                    Top 20 by contaminants · Top 10 by groundwater proximity
                  </div>
                </div>
                <div className="related-cell">
                  <div className="rel-label">Example site profile</div>
                  <Link href="/state/ca/superfund/hunters-point-naval-shipyard">
                    Hunters Point Naval Shipyard
                  </Link>
                  <div className="rel-desc">
                    San Francisco · 223 contaminants · Federal facility
                  </div>
                </div>
                <div className="related-cell">
                  <div className="rel-label">State overview</div>
                  <Link href="/state/ut">Utah Pollution</Link>
                  <div className="rel-desc">24 NPL sites · 191 TRI facilities</div>
                </div>
                <div className="related-cell">
                  <div className="rel-label">Methodology</div>
                  <Link href="/methodology">How We Read Superfund Data</Link>
                  <div className="rel-desc">
                    SEMS sourcing, caveats, and equity overlay rules
                  </div>
                </div>
              </div>
            </section>

            {/* ── 8. FAQ ─────────────────────────────────────────── */}
            <section className="guide-section" id="faq">
              <div className="section-head">
                <div className="kicker">Common Questions</div>
                <h2>Frequently Asked Questions</h2>
              </div>
              <div className="faq-list">
                {FAQ.map((f) => (
                  <details key={f.q}>
                    <summary>{f.q}</summary>
                    <div className="answer">{f.a}</div>
                  </details>
                ))}
              </div>
            </section>

            {/* ── Footer disclaimer ──────────────────────────────── */}
            <footer className="guide-footer">
              <p>
                <strong>Sources.</strong> EPA Superfund Enterprise Management System
                (SEMS){retrieved ? ` · retrieved ${retrieved}` : ""}. Census ACS
                2018–2022 (5-year) demographics. USEPA-clone/ejamdata EJ disparity mirror.
                SEMS is a federal public-domain dataset under 17 USC §105.
              </p>
              <p style={{ marginTop: 10 }}>
                <strong>What this is not.</strong> This page summarizes the EPA Superfund
                program using federal public-domain data. It does not constitute
                site-specific health risk assessment, legal advice, or a current-condition
                report for any individual site. NPL listing reflects EPA&apos;s Hazard
                Ranking Score at a point in time; it does not describe present-day exposure
                at any site. For site-specific cleanup status, consult the{" "}
                <a
                  href="https://www.epa.gov/superfund/search-superfund-sites-where-you-live"
                  target="_blank"
                  rel="noreferrer"
                >
                  EPA Superfund site search
                </a>
                .
              </p>
              <p style={{ marginTop: 10 }}>
                <Link href="/methodology">Methodology</Link> ·{" "}
                <Link href="/rankings/superfund">Superfund Rankings</Link>
              </p>
            </footer>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
