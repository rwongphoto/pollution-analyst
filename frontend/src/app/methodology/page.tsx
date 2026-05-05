import type { Metadata } from "next";
import Link from "next/link";

import { Crumbs } from "@/components/site/Crumbs";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { pageMeta, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Pollution Trend Methodology | Pollution Analyst.ai",
  description:
    "How we measure pollution trends across federal data sources — TRI, SDWIS, EJScreen — plus our pollutant taxonomy, equity-overlay stance, and per-source caveats.",
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
        name: "Pollution Analyst.ai",
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
        headline: "Pollution Trend Methodology",
        description:
          "Methodology, source-by-source caveats, equity-overlay stance, and pollutant taxonomy used by Pollution Analyst.ai.",
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
            <h1>Pollution Trend Methodology</h1>
            <p className="lede">
              Pollution Analyst.ai is built around three commitments:{" "}
              <strong>plain English</strong> for readers,{" "}
              <strong>federal-only data</strong> with explicit attribution, and{" "}
              <strong>equity context paired with releases</strong> rather than hidden.
              The platform-wide rules are first; per-source caveats follow at the bottom.
            </p>

            <p className="meta-mono" style={{ color: "var(--fg-4)", marginTop: 18 }}>
              JUMP TO ·{" "}
              <a href="#taxonomy">Taxonomy</a> ·{" "}
              <a href="#equity">Equity overlay</a> ·{" "}
              <a href="#exclusions">Exclusions</a> ·{" "}
              <a href="#sources">Sources</a> ·{" "}
              <a href="#tri">TRI</a> ·{" "}
              <a href="#sdwis">SDWIS</a> ·{" "}
              <a href="#ejscreen">EJScreen</a> ·{" "}
              <a href="#rights">Data rights</a>
            </p>

            <section id="taxonomy">
              <h2>Pollutant taxonomy</h2>
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

            <section id="equity">
              <h2>Equity overlay (the deliberate inversion from our crime site)</h2>
              <p>
                Our companion site, <a href="https://www.publicanalyst.ai" target="_blank" rel="noreferrer">Public Analyst.ai</a>, refuses to overlay race or income with neighborhood crime. The reasoning there is specific to crime: it&apos;s reported by police, subject to enforcement-pattern bias, and the juxtaposition reads correlation as causation regardless of authorial intent.
              </p>
              <p>
                For pollution, the opposite is the legitimate, well-documented framing.
                <strong> Environmental justice analysis explicitly correlates pollution exposure with race and income.</strong> EPA itself publishes EJScreen for this purpose. Refusing the overlay would <em>undermine</em> the value of the site.
              </p>
              <p>
                The mechanism differs in two important ways:
              </p>
              <ul>
                <li>
                  <strong>Pollution is measured at the receptor or the source.</strong> A TRI release is reported by the facility under federal mandate; an EJScreen index pairs that release with the demographics of the surrounding block groups. Neither measurement is filtered through enforcement priorities.
                </li>
                <li>
                  <strong>Concentration is the object of inquiry.</strong> The question on a pollution page is whether a population bears disproportionate exposure — that&apos;s an empirical question with an empirical answer, computed at federally defined geographies.
                </li>
              </ul>
              <p>
                EJScreen indexes are percentile ranks (0–100) that pair an environmental indicator (PM2.5 concentration, air-toxics cancer risk, etc.) with a demographic indicator (low income, people of color) at the block-group level. EPA flags 80th-percentile-and-above as warranting closer examination; we mirror that threshold in our prose framing.
              </p>
              <p>
                We surface EJScreen indexes verbatim rather than recompute our own, so the source of every percentile is auditable against EPA&apos;s published reference data.
              </p>
            </section>

            <section id="exclusions">
              <h2>What we deliberately exclude</h2>
              <ul>
                <li>
                  <strong>Real-time alerting and AQI dashboards.</strong> AirNow already does that well. We are an analytics-and-narrative layer, not a hazard-of-the-hour service.
                </li>
                <li>
                  <strong>Health diagnoses or medical advice.</strong> We reference exposure thresholds (NAAQS, MCLs, EJScreen percentiles); we do not interpret them for individual readers.
                </li>
                <li>
                  <strong>Per-individual exposure modeling.</strong> Our unit of analysis is aggregate (facility, utility, county). EJScreen and NATA are census-tract or block-group rollups; we do not model personal exposure.
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
              <h2>Sources we currently use</h2>
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
                  <strong>Pounds, not concentrations.</strong> TRI tells you how much was released — not where it ended up or what people inhaled. We pair TRI with EJScreen for population-exposure context.
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
              <h2>EJScreen · environmental-justice screening tool</h2>
              <p>
                <strong>Owner.</strong> EPA Office of Environmental Justice & External Civil Rights.
              </p>
              <p>
                <strong>What it is.</strong> Pre-joined environmental and demographic indicators at the block-group level (~245,000 block groups). Each EJ index pairs an environmental burden with a demographic indicator and reports a national and state percentile rank.
              </p>
              <p>
                <strong>Cadence.</strong> Annual update, generally summer. Indicators update on their underlying source cadence (ACS 5-year, NATA modeling cycle, AQS rollups, etc.).
              </p>
              <p>
                <strong>Caveats we surface.</strong>
              </p>
              <ul>
                <li>
                  <strong>Block-group rollup.</strong> EJScreen is not a personal exposure model. It rolls modeled exposure up to block groups and pairs that with ACS demographics. Inside a block group there is variation we do not capture.
                </li>
                <li>
                  <strong>Percentile, not absolute level.</strong> A 95th-percentile EJ index says &ldquo;in the highest 5% nationally,&rdquo; not &ldquo;X concentration above standard.&rdquo; The percentile is a comparative ranking. We always include the underlying indicator label.
                </li>
                <li>
                  <strong>Demographic indicators are paired, not stacked.</strong> EJScreen pairs each pollution indicator with each demographic indicator separately; it doesn&apos;t produce a single composite &ldquo;EJ score.&rdquo; We follow that convention on every page.
                </li>
              </ul>
              <p>
                <strong>Reference.</strong>{" "}
                <a href="https://www.epa.gov/ejscreen" target="_blank" rel="noreferrer">EPA EJScreen</a>.
              </p>
            </section>

            <section id="rights" style={{ borderTop: "1px solid var(--rule)", paddingTop: 36, marginTop: 36 }}>
              <h2>Data rights and attribution</h2>
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
