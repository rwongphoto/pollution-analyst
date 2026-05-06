import type { Metadata } from "next";
import Link from "next/link";

import { Crumbs } from "@/components/site/Crumbs";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { pageMeta, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Pollution Analysis Methodology | Pollution Analyst",
  description:
    "How we measure pollution trends across federal data sources — TRI, SDWIS, the USEPA-clone EJ disparity mirror — plus our pollutant taxonomy, equity-overlay stance, and per-source caveats.",
  path: "/methodology",
});

export default function MethodologyPage() {
  const pageUrl = `${SITE_URL}/methodology`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#org`,
        name: "Pollution Analyst",
        url: `${SITE_URL}/`,
        description:
          "Pollution trend intelligence built from federal public data.",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Methodology", item: pageUrl },
        ],
      },
      {
        "@type": "Article",
        headline: "Pollution Analysis Methodology",
        description:
          "Methodology, source-by-source caveats, equity-overlay stance, and pollutant taxonomy used by Pollution Analyst.",
        url: pageUrl,
        author: { "@id": `${SITE_URL}/#org` },
        publisher: { "@id": `${SITE_URL}/#org` },
        inLanguage: "en-US",
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader active="method" />
      <main>
        <Crumbs items={[{ label: "Methodology" }]} />
        <div className="method-page">
          <div className="wrap">
            <h1>Pollution Analysis Methodology</h1>
            <p className="lede">
              Pollution Analyst is built around three commitments:{" "}
              <strong>plain English</strong> for readers,{" "}
              <strong>federal-only data</strong> with explicit attribution, and{" "}
              <strong>equity context paired with releases</strong> rather than hidden.
              The platform-wide rules are first; per-source caveats follow at the bottom.
            </p>

            <p className="meta-mono" style={{ color: "var(--fg-4)", marginTop: 18 }}>
              JUMP TO ·{" "}
              <a href="#taxonomy">Taxonomy</a> ·{" "}
              <a href="#anomaly-engine">Anomaly Engine</a> ·{" "}
              <a href="#equity">Equity Overlay</a> ·{" "}
              <a href="#exclusions">Exclusions</a> ·{" "}
              <a href="#sources">Sources</a> ·{" "}
              <a href="#tri">TRI</a> ·{" "}
              <a href="#sdwis">SDWIS</a> ·{" "}
              <a href="#ejscreen">EJScreen</a> ·{" "}
              <a href="#rights">Data Rights</a>
            </p>

            <section id="taxonomy">
              <h2>Pollutant Taxonomy</h2>
              <p>
                Every page on this site uses the same top-level categorization, chosen so
                cross-source comparisons remain coherent. New sources extend the taxonomy
                rather than reshape it.
              </p>
              <ul>
                <li><strong>Criteria air pollutants (NAAQS).</strong> PM2.5, PM10, ozone, NO₂, SO₂, CO, lead. The six pollutants that the Clean Air Act sets ambient standards for.</li>
                <li><strong>Hazardous air pollutants (HAPs).</strong> ~187 chemicals listed under Clean Air Act §112. Rolled up by health endpoint (carcinogen, neurotoxin, respiratory irritant) on facility pages.</li>
                <li><strong>Greenhouse gases.</strong> CO₂, methane, N₂O, HFCs. Reported under the GHGRP for large emitters.</li>
                <li><strong>Drinking-water contaminants.</strong> Lead, nitrates, arsenic, disinfection byproducts, microbial. Reported via SDWIS as MCL or treatment-technique violations per public water system.</li>
                <li><strong>Toxic releases (TRI).</strong> ~800 chemicals reported by industrial facilities under EPCRA §313. Rolled up by chemical group (carcinogens, persistent bioaccumulative toxins, dioxins).</li>
              </ul>
            </section>

            <section id="anomaly-engine">
              <h2>Anomaly Engine</h2>
              <p>
                Pollution data has different shapes from crime data. Crime is point-incident, monthly, with weak seasonality; pollution is annual (TRI, GHGRP), event-driven (SDWIS), or sparse-monitor (AQS, when it lands). The flag taxonomy reflects that. Four flag types ship today; two more (smoke days, NAAQS exceedance days) defer until air-monitor ingest is in.
              </p>
              <p>
                A flag is <strong>editorial attention, not a regulatory finding</strong>. Where EPA has issued an enforcement action — SDWIS Tier 1 violations, ECHO actions — we link to the federal record so readers can verify the actual compliance posture rather than infer it from our card.
              </p>
              <h3 style={{ marginTop: 24 }}>Long-Arc Shift</h3>
              <p>
                Triggers when a geography&apos;s most-recent-year value differs from a baseline year (≥10 years prior) by ≥50%. Absolute floors keep the percent change meaningful: ≥50,000 lb baseline for TRI pathways, ≥100,000 mtCO₂e for GHG. Surfaced on facility, county, and state pages. Severity: <em>improvement</em> for declines, <em>regression</em> for rises.
              </p>
              <h3 style={{ marginTop: 24 }}>Release Shift</h3>
              <p>
                Year-over-year facility × chemical TRI shift. Three combined floors against tiny-base noise: ≥50% change AND ≥10,000 lb absolute delta AND ≥1,000 lb prior-year baseline. Surfaced on facility pages only — YoY at county/state aggregation is too noisy to be editorial. Severity: <em>surge</em> or <em>drop</em>.
              </p>
              <h3 style={{ marginTop: 24 }}>Violation Event</h3>
              <p>
                SDWIS health-based or unresolved violation. Event-driven, not statistical — the violation itself is the signal. Surfaced on water-utility pages with a link to the EPA SDWIS record. Severity ordering: <em>unresolved</em> &gt; <em>health-based within 1 year</em> &gt; <em>health-based within 5 years</em>. Monitoring failures and returned-to-compliance violations don&apos;t flag.
              </p>
              <h3 style={{ marginTop: 24 }}>GHG Step</h3>
              <p>
                County-level GHGRP year-over-year shift, ≥30% with both years ≥10,000 mtCO₂e. Typically reflects industrial commissioning, decommissioning, or fuel switching. Facility-level deferred until a TRI↔GHGRP facility-ID join is built. Severity: <em>surge</em> or <em>drop</em>.
              </p>
              <h3 style={{ marginTop: 24 }}>Calibration Commitment</h3>
              <p>
                Average flag count is targeted at: ≤3 per facility, ≤5 per county, ≤8 per state. Water utilities are uncapped — violation events are events, not anomalies. The first emission cycle intentionally runs lax thresholds; the engine logs per-geography counts so over-cap entities can drive a threshold tune before re-publishing.
              </p>
              <h3 style={{ marginTop: 24 }}>Deferred</h3>
              <p>
                <strong>Smoke days</strong> and <strong>NAAQS exceedance days</strong> require AQS air-monitor ingest, which is not yet in the pipeline. <strong>Sustained shift / streak break</strong> require a monthly cadence; TRI is annual. <strong>Cross-pathway flags</strong> (e.g., a high-TRI facility near a public water system with violations) wait until the individual lanes are calibrated. None of these are technical blockers — all are scope choices for v1.
              </p>
            </section>

            <section id="equity">
              <h2>Equity Overlay (The Deliberate Inversion From Our Crime Site)</h2>
              <p>
                Our companion site, <a href="https://www.publicanalyst.ai" target="_blank" rel="noreferrer">Public Analyst.ai</a>, refuses to overlay race or income with neighborhood crime. The reasoning there is specific to crime: it&apos;s reported by police, subject to enforcement-pattern bias, and the juxtaposition reads correlation as causation regardless of authorial intent.
              </p>
              <p>
                For pollution, the opposite is the legitimate, well-documented framing.
                <strong> Environmental justice analysis explicitly correlates pollution exposure with race and income.</strong> EPA published EJScreen for exactly this purpose for over a decade. Refusing the overlay would <em>undermine</em> the value of the site.
              </p>
              <p>
                The mechanism differs in two important ways:
              </p>
              <ul>
                <li>
                  <strong>Pollution is measured at the receptor or the source.</strong> A TRI release is reported by the facility under federal mandate; an EJ index pairs that release with the demographics of the surrounding block groups. Neither measurement is filtered through enforcement priorities.
                </li>
                <li>
                  <strong>Concentration is the object of inquiry.</strong> The question on a pollution page is whether a population bears disproportionate exposure — that&apos;s an empirical question with an empirical answer, computed at federally defined geographies.
                </li>
              </ul>
              <h3 style={{ marginTop: 24 }}>Three Layers, Demographics-Leading</h3>
              <p>
                EPA retired the public-facing EJScreen tool in 2025. We&apos;re now a primary-source compositor for the equity overlay rather than a re-presenter of an EPA-blessed index. Every facility, county, city, and state page renders the overlay in three layers, in order of prominence:
              </p>
              <ol>
                <li>
                  <strong>Demographic context (lead).</strong> Census ACS 2018&ndash;2022 (5-year): population total + share low-income / people of color / under age 5 / over age 64. Always rendered. This is the &ldquo;who lives here&rdquo; surface — the most legible to readers and the most defensible methodologically.
                </li>
                <li>
                  <strong>National percentiles, per environmental indicator.</strong> Each indicator (PM2.5, ozone, NO₂, diesel particulate, RSEI toxic releases, lead-paint risk, NPL/RMP/TSDF/NPDES proximity) ranked against the national distribution of all US block groups, population-weighted. Rendered as &ldquo;in the highest 10% nationally&rdquo; — the framing EPA&apos;s original EJScreen used. Computed in-pipeline against the raw indicator block-group table from <code>USEPA-clone/EJAM-open/data/blockgroupstats.rda</code>; the same upstream EPA team maintains both this and the disparity-score file.
                </li>
                <li>
                  <strong>EJ disparity scores (statistical detail).</strong> EPA&apos;s newer disparity-score metric, sourced from the <code>USEPA-clone/ejamdata</code> GitHub mirror that the open-source EJAM package consumes. Population-weighted to state, county, and city. Centered on <strong>100 = the population-weighted reference burden</strong>; higher = greater disparate exposure. ~150 is widely considered notable; 200+ is severe. Surfaced as a table at the bottom of the equity section so readers who want the formal stat can read it directly.
                </li>
              </ol>
              <h3 style={{ marginTop: 24 }}>Why Both Percentile And Disparity</h3>
              <p>
                Percentile and disparity score answer different questions. <strong>Percentile</strong> says &ldquo;how does this place rank against the country?&rdquo; — directly legible, easy to cite. <strong>Disparity score</strong> says &ldquo;does the population at this place bear more burden than a population-weighted reference?&rdquo; — a stronger statement about distributive equity, harder to compress into one phrase. Surfacing both lets the reader hold them up against each other.
              </p>
              <h3 style={{ marginTop: 24 }}>Geography Preference (Per-Page)</h3>
              <p>
                Each page picks the tightest geography that has data available, in this preference order: Census Place (city) → containing County → State. Facility pages currently use the containing-county overlay as a proxy; a 3-mile-buffer aggregation is a future iteration.
              </p>
              <p>
                The methodology page tracks every substitution explicitly. The pipeline reads <a href="https://github.com/USEPA-clone/ejamdata" target="_blank" rel="noreferrer"><code>USEPA-clone/ejamdata</code></a> directly, so any reader can audit the raw block-group inputs against our computed rollups.
              </p>
            </section>

            <section id="exclusions">
              <h2>What We Deliberately Exclude</h2>
              <ul>
                <li>
                  <strong>Real-time alerting and AQI dashboards.</strong> AirNow already does that well. We are an analytics-and-narrative layer, not a hazard-of-the-hour service.
                </li>
                <li>
                  <strong>Health diagnoses or medical advice.</strong> We reference exposure thresholds (NAAQS, MCLs, EJ disparity scores); we do not interpret them for individual readers.
                </li>
                <li>
                  <strong>Per-individual exposure modeling.</strong> Our unit of analysis is aggregate (facility, utility, county, place). The block-group EJ data and NATA are tract / block-group rollups; we do not model personal exposure.
                </li>
                <li>
                  <strong>Speculative attribution to specific facilities</strong> beyond what TRI / ECHO publishes directly. We do not assert that a given facility caused a given health outcome; that exceeds what the data can support.
                </li>
                <li>
                  <strong>Real-estate value framing.</strong> Pollution data is not a property-listing feature. The framing risks turning environmental harm into a market signal.
                </li>
                <li>
                  <strong>Commercial / non-federal sensors.</strong> PurpleAir and similar community sources are out of scope. The federal corpus is sufficient and licensing-clean.
                </li>
              </ul>
            </section>

            <section id="sources">
              <h2>Sources We Currently Use</h2>
              <p>
                Every dataset on this site is a federal public-domain work (17 USC §105). We attribute the originating agency on every page; we do not relabel federal observations as proprietary.
              </p>
            </section>

            <section id="tri" style={{ borderTop: "1px solid var(--rule)", paddingTop: 36, marginTop: 36 }}>
              <h2>TRI · Toxics Release Inventory</h2>
              <p>
                <strong>Owner.</strong> EPA, under EPCRA §313 and PPA §6607.
              </p>
              <p>
                <strong>What it is.</strong> Self-reported annual releases of ~800 listed chemicals by industrial facilities meeting NAICS-code and employee thresholds. Reported quantities are estimates (mass balance, emission factors, monitoring data) rather than continuous measurements.
              </p>
              <p>
                <strong>Cadence.</strong> Annual. Reporting year T is published in the second half of year T+1; preliminary data lands earlier. We mark the reporting year on every facility and county page.
              </p>
              <p>
                <strong>Caveats we surface.</strong>
              </p>
              <ul>
                <li>
                  <strong>Self-reported.</strong> A facility&apos;s TRI total is only as good as its Form R submission. EPA does QC checks but the underlying record is the facility&apos;s. Anomalous year-over-year shifts often reflect reporting-method changes, not actual emission shifts.
                </li>
                <li>
                  <strong>Threshold-coverage gaps.</strong> Below-threshold facilities don&apos;t report. A county with a TRI total of zero may still have meaningful smaller emitters.
                </li>
                <li>
                  <strong>Pounds, not concentrations.</strong> TRI tells you how much was released — not where it ended up or what people inhaled. We pair TRI with the EJ disparity overlay for population-exposure context.
                </li>
                <li>
                  <strong>Long-arc improvements are real.</strong> Multi-decade declines on the order of −30% to −60% reflect both Clean Air Act controls and the progressive electrification of heavy industry. We report the long arc explicitly because the year-over-year noise can hide it.
                </li>
              </ul>
              <p>
                <strong>Reference.</strong>{" "}
                <a href="https://www.epa.gov/toxics-release-inventory-tri-program" target="_blank" rel="noreferrer">EPA TRI Program</a>.
              </p>
            </section>

            <section id="sdwis" style={{ borderTop: "1px solid var(--rule)", paddingTop: 36, marginTop: 36 }}>
              <h2>SDWIS · Safe Drinking Water Information System</h2>
              <p>
                <strong>Owner.</strong> EPA + state primacy agencies, under the Safe Drinking Water Act.
              </p>
              <p>
                <strong>What it is.</strong> Compliance status for ~150,000 public water systems. Records each violation against an MCL (maximum contaminant level), treatment-technique requirement, or monitoring rule, with year, contaminant, and resolution status.
              </p>
              <p>
                <strong>Cadence.</strong> Quarterly federal aggregation; states report as violations occur and resolve.
              </p>
              <p>
                <strong>Caveats we surface.</strong>
              </p>
              <ul>
                <li>
                  <strong>Health-based vs monitoring violations.</strong> A health-based violation means an MCL or TT was exceeded — actionable signal. A monitoring violation means the utility didn&apos;t collect or report a sample on time — concerning for transparency, but not a measured exceedance. We label these distinctly on every utility page.
                </li>
                <li>
                  <strong>Active is not the same as crisis.</strong> Many utilities with health-based violations are mid-remediation under EPA-approved plans. We link to the EPA SDWIS record so readers can verify return-to-compliance status before forming a conclusion.
                </li>
                <li>
                  <strong>State reporting variance.</strong> States vary in how aggressively they record monitoring violations. Cross-state comparisons of monitoring-violation counts are noisier than health-based counts.
                </li>
                <li>
                  <strong>SDWIS is not the tap.</strong> SDWIS records utility-level compliance against federal standards. It does not measure what comes out of any individual tap, which depends on premise plumbing and corrosion conditions.
                </li>
              </ul>
              <p>
                <strong>Reference.</strong>{" "}
                <a href="https://www.epa.gov/ground-water-and-drinking-water/safe-drinking-water-information-system-sdwis-federal-reporting" target="_blank" rel="noreferrer">EPA SDWIS</a>.
              </p>
            </section>

            <section id="ejscreen" style={{ borderTop: "1px solid var(--rule)", paddingTop: 36, marginTop: 36 }}>
              <h2>EJScreen · Environmental-Justice Screening (Post-2025 Substitution)</h2>
              <p>
                <strong>Owner of original EJScreen.</strong> EPA Office of Environmental Justice & External Civil Rights.
              </p>
              <p>
                <strong>Status.</strong> EPA retired the public-facing EJScreen tool and its prebuilt CSV exports in 2025. The underlying block-group tables are still maintained by the same EPA team that built EJAM (the open-source successor), published via the <a href="https://github.com/USEPA-clone/ejamdata" target="_blank" rel="noreferrer"><code>USEPA-clone/ejamdata</code></a> GitHub repo. We pull <code>data/bgej.arrow</code> directly and aggregate to state, county, and place by population-weighted mean.
              </p>
              <p>
                <strong>What we currently render.</strong> Two-layer environmental burden, per indicator (PM2.5, ozone, NO₂, diesel particulate, RSEI toxic releases, lead-paint risk, NPL/RMP/TSDF/NPDES proximity, USTs, drinking-water non-compliance):
              </p>
              <ul>
                <li>
                  <strong>National percentile</strong> — population-weighted mean of the indicator for the geography, ranked against the national CDF of all US block-group means. Computed in-pipeline from the raw indicator table at <code>USEPA-clone/EJAM-open/data/blockgroupstats.rda</code>. Mirrors the framing EPA&apos;s original EJScreen tool used.
                </li>
                <li>
                  <strong>EJ disparity score</strong> — EPA&apos;s newer metric centered on 100 = population-weighted reference burden; higher = greater disparate exposure. Sourced from <code>bgej.arrow</code> in the same upstream repo.
                </li>
              </ul>
              <p>
                <strong>Cadence.</strong> Underlying indicators update on their source cadence (ACS 5-year, NATA modeling cycle, AQS rollups). The <code>USEPA-clone/ejamdata</code> Arrow file is refreshed when EPA pushes a new compilation; we re-pull on demand.
              </p>
              <p>
                <strong>Caveats we surface.</strong>
              </p>
              <ul>
                <li>
                  <strong>Block-group rollup.</strong> Not a personal exposure model. The underlying data rolls modeled exposure to block groups and pairs that with ACS demographics. Inside a block group there is variation we do not capture.
                </li>
                <li>
                  <strong>Disparity score, not absolute level.</strong> A score of 150 says &ldquo;the population here bears notably more burden than the population-weighted reference,&rdquo; not &ldquo;X concentration above standard.&rdquo; We always show the underlying indicator label and the &ldquo;reference burden&rdquo; framing on every page.
                </li>
                <li>
                  <strong>Substitution is explicit.</strong> Every page that uses the overlay credits &ldquo;Census ACS 2018-2022 + USEPA-clone EJ disparity mirror&rdquo; in the source line, with a link back to the upstream Arrow file. Readers can verify our rollups against the raw block-group inputs without going through the pipeline.
                </li>
                <li>
                  <strong>No source laundering.</strong> We do not relabel disparity scores as &ldquo;our index.&rdquo; The metric is EPA&apos;s; the population weighting and place/county/state aggregation are ours, and the pipeline code is open.
                </li>
              </ul>
              <p>
                <strong>Reference.</strong>{" "}
                <a href="https://github.com/USEPA-clone/ejamdata" target="_blank" rel="noreferrer">USEPA-clone/ejamdata</a> (current source of truth) ·{" "}
                <a href="https://www.epa.gov/ejscreen" target="_blank" rel="noreferrer">EPA EJScreen historical landing page</a> (deprecated 2025).
              </p>
            </section>

            <section id="health" style={{ borderTop: "1px solid var(--rule)", paddingTop: 36, marginTop: 36 }}>
              <h2>Co-Located Health Indicators · CDC PLACES</h2>
              <p>
                <strong>What this section is.</strong> County and city pages render five chronic-disease prevalence estimates from CDC&apos;s Population Level Analysis and Community Estimates (PLACES) program — adult asthma, COPD, coronary heart disease, diabetes, and frequent mental distress. These sit immediately after the equity overlay so that pollution, demographics, and health-outcome context can be read together.
              </p>
              <p>
                <strong>Why it&apos;s here.</strong> The pollution-vs-health correlation is the question readers actually arrive with. Surfacing co-located prevalence at the same geography as the pollution data makes the structural pattern visible without forcing readers to cross-reference three different government tools. The pattern is striking: Kern County&apos;s COPD prevalence is 38% above the California mean; Palo Alto&apos;s is 42% below. That gradient mirrors the pollution gradient closely.
              </p>
              <p>
                <strong>What the data is — and isn&apos;t.</strong>
              </p>
              <ul>
                <li>
                  <strong>Modeled, not measured.</strong> CDC PLACES uses a multi-level small-area regression on BRFSS (Behavioral Risk Factor Surveillance System) responses to produce a synthetic prevalence estimate per county and per Census place. It is <em>not</em> a count of diagnosed cases at the geography. Confidence intervals widen with smaller populations, and rural geographies with thin BRFSS samples should be read with more care.
                </li>
                <li>
                  <strong>Crude vs age-adjusted.</strong> The headline tile value is <strong>crude prevalence</strong> — the actual local rate as published. Both the &ldquo;vs state mean&rdquo; and &ldquo;vs US mean&rdquo; comparators use <strong>age-adjusted prevalence</strong> on both sides so geographies with different age structures stay apples-to-apples. PLACES publishes both; we render both, in different roles.
                </li>
                <li>
                  <strong>State and national comparators.</strong> Each tile carries two pills — vs state mean and vs US mean. State answers &ldquo;how does this place stack up against the rest of its state?&rdquo;; US answers &ldquo;is this place&apos;s health profile typical of America, or an outlier in either direction?&rdquo;. Both means are population-weighted across counties (PLACES has no published national or state aggregate row) — same methodology, different denominator. California averages slightly healthier than the US on most measures, so a tile that looks &ldquo;flat vs CA&rdquo; can still be &ldquo;below the US mean&rdquo;, and we render both so readers can see that.
                </li>
                <li>
                  <strong>Ecological correlation, not causation.</strong> A higher pollution reading and a higher disease prevalence in the same county do not establish that the pollution caused the disease. Causal attribution requires individual-level data, exposure histories, and confounder controls that an area-level dataset cannot provide. We say this out loud on every section header so the framing carries through to anyone who lands directly on a county page.
                </li>
                <li>
                  <strong>Vintage.</strong> The 2025 PLACES release is built on BRFSS 2022 and 2023 — different measures use different years depending on questionnaire rotation. Each tile labels its underlying data year. Re-pulled on each pipeline cycle.
                </li>
              </ul>
              <p>
                <strong>Why these five measures.</strong> They map most directly to the air-pollution surfaces already on the page: asthma and COPD are the canonical PM2.5 / ozone-adjacent respiratory outcomes; CHD is the canonical air-pollution cardiovascular outcome; diabetes co-varies with the same socioeconomic structure that predicts pollution exposure; frequent mental distress captures the broader psychosocial cost of living next to industrial sites. The full PLACES catalog has 40 measures — we deliberately picked the smallest editorially defensible set rather than a wall of tiles.
              </p>
              <p>
                <strong>What we do NOT render.</strong>
              </p>
              <ul>
                <li>
                  <strong>State-level health tiles.</strong> Aggregated to a whole state, chronic-disease prevalence is too smoothed out to be editorially interesting — every state lands within a narrow band of the national mean. State-level PLACES values appear only as the comparator on county and city tiles.
                </li>
                <li>
                  <strong>Tract-level rollups onto county or city pages.</strong> PLACES does publish at tract level, but rolling those tract values up to a coarser geography forces a population-weighting decision that PLACES already made at the coarser-geography level — re-doing it would just introduce noise. We use PLACES-published county and place data directly.
                </li>
                <li>
                  <strong>Mortality at city level.</strong> CDC WONDER&apos;s actual cancer / cardiovascular mortality is published at <em>county only</em>. A city-page tile would have to fall back to the containing county, which would surprise readers comparing two cities in the same county. Mortality is on the roadmap as a county-only addition; we do not force-fit it onto city pages.
                </li>
                <li>
                  <strong>Causal lag analyses.</strong> &ldquo;PM2.5 in 2010 predicts cancer in 2025&rdquo; is the most-clicked-on chart on environmental-health sites and the most likely to be misread as causal. We do not render lag charts on per-place pages. If we ever do, it will be on a separate &ldquo;correlations&rdquo; surface with the methodology disclaimer at the top, not nested inside a county page.
                </li>
              </ul>
              <p>
                <strong>Reference.</strong>{" "}
                <a href="https://www.cdc.gov/places/" target="_blank" rel="noreferrer">CDC PLACES program landing</a> ·{" "}
                <a href="https://data.cdc.gov/500-Cities-Places/PLACES-Local-Data-for-Better-Health-County-Data-20/swc5-untb" target="_blank" rel="noreferrer">County dataset on chronicdata.cdc.gov</a> ·{" "}
                <a href="https://data.cdc.gov/500-Cities-Places/PLACES-Local-Data-for-Better-Health-Place-Data-202/eav7-hnsx" target="_blank" rel="noreferrer">Place dataset</a> ·{" "}
                <a href="https://www.cdc.gov/brfss/" target="_blank" rel="noreferrer">BRFSS source survey</a>.
              </p>
            </section>

            <section id="rights" style={{ borderTop: "1px solid var(--rule)", paddingTop: 36, marginTop: 36 }}>
              <h2>Data Rights And Attribution</h2>
              <p>
                Every dataset on this site is a federal public-domain work under 17 USC §105. There is no licensing fee, royalty, or commercial-use restriction on the underlying observations. The operational rules are about API civility and attribution norms, not licensing.
              </p>
              <ul>
                <li>We attribute every source on the methodology page and in per-page footers, with the originating agency named and a link to the canonical EPA dataset.</li>
                <li>We do not paywall federal data behind a login or subscription.</li>
                <li>We do not relabel federal observations as proprietary. What we add is normalization, anomaly detection, narrative, and presentation.</li>
                <li>We use bulk downloads where available rather than scraping APIs, to minimize impact on EPA infrastructure.</li>
              </ul>
            </section>

            <p style={{ marginTop: 36 }}>
              <Link href="/" className="btn btn-ghost">← Back to home</Link>
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
