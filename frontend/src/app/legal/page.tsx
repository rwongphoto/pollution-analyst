import type { Metadata } from "next";
import Link from "next/link";

import { Crumbs } from "@/components/site/Crumbs";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { pageMeta, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Terms & Privacy — Pollution Analyst",
  description:
    "Terms of use and privacy policy for Pollution Analyst — an educational research project that interprets federal EPA pollution data. Accuracy not guaranteed; not for safety, legal, real-estate, insurance, or medical decisions.",
  path: "/legal",
});

export default function LegalPage() {
  const pageUrl = `${SITE_URL}/legal`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Terms & Privacy", item: pageUrl },
        ],
      },
      {
        "@type": "WebPage",
        name: "Terms & Privacy — Pollution Analyst",
        url: pageUrl,
        description:
          "Terms of use and privacy policy for Pollution Analyst, including federal-data accuracy disclaimers and anomaly-detection methodology notes.",
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
      <SiteHeader />
      <main>
        <Crumbs items={[{ label: "Terms & Privacy" }]} />
        <div className="method-page">
          <div className="wrap">
            <h1>Terms &amp; Privacy</h1>
            <p className="lede">
              Pollution Analyst is an <strong>educational and academic
              exercise</strong> — an independent, non-commercial research
              project that aggregates federal public-domain pollution data
              and translates it into plain English. Use of the site implies
              acceptance of the terms below. Last updated 2026-05-06.
            </p>

            <section>
              <h2>Purpose: educational and academic use</h2>
              <p>
                This site exists as a learning project and a public
                demonstration of techniques for interpreting federal
                environmental open-data feeds. It is not a commercial
                product, not a journalistic outlet of record, and not
                affiliated with the U.S. Environmental Protection Agency,
                any state environmental agency, any university, or any news
                organization. The code, methodology, and outputs are
                intended for study, discussion, and civic curiosity — not as
                an authoritative source.
              </p>
            </section>

            <section>
              <h2>No guarantee of accuracy</h2>
              <p>
                Pollution Analyst aggregates federal pollution data from
                EPA programs (TRI, GHGRP, SDWIS, EJScreen, AirToxScreen)
                and CDC PLACES, then normalizes those releases across
                differing schemas, reporting cadences, and historical
                vintages. Despite best efforts to map and reconcile these
                sources faithfully — documented on the{" "}
                <Link href="/methodology">methodology page</Link> — we make
                no warranty, express or implied, about the accuracy,
                completeness, timeliness, or fitness for any particular
                purpose of any number, chart, signal, anomaly, or piece of
                prose published on this site.
              </p>
              <p>
                Source datasets contain known issues: Toxics Release
                Inventory and Greenhouse Gas Reporting Program quantities
                are self-reported by facility operators and revised in
                later vintages; Safe Drinking Water Information System
                violation backlogs vary by state primacy agency;
                AirToxScreen ambient concentrations are modeled estimates,
                not measurements; EJScreen demographic indicators are
                Census ACS estimates with their own margins of error.
                Year-over-year changes can reflect reporting changes rather
                than real-world changes. Our normalization layer can
                introduce additional error. The site is provided
                &quot;as is&quot; and &quot;as available,&quot; without
                warranty of any kind.
              </p>
            </section>

            <section>
              <h2>Data sources</h2>
              <p>
                Pollutant, facility, and water-system data is pulled from
                EPA programs published as bulk CSV, Envirofacts API, or
                bulk geospatial download — including the Toxics Release
                Inventory (TRI), the Greenhouse Gas Reporting Program
                (GHGRP), the Safe Drinking Water Information System
                (SDWIS), EJScreen, AirToxScreen, the Air Quality System
                (AQS), and Superfund. Health-outcome layers come from
                CDC PLACES (built on BRFSS). Population and demographic
                figures come from the U.S. Census Bureau ACS 5-year
                estimates. Geographic boundaries follow Census TIGER/Line.
              </p>
              <p>
                All federal datasets used here are public-domain works of
                the U.S. government under 17 USC §105. Pollution Analyst is
                not affiliated with, endorsed by, or operated on behalf of
                EPA, CDC, the Census Bureau, or any other federal or state
                agency.
              </p>
            </section>

            <section>
              <h2>Anomalies and statistical signals</h2>
              <p>
                Spikes, drops, sustained shifts, streak breaks, and
                rare-event flags on this site are computed from rolling
                baselines using the rules described on the{" "}
                <Link href="/methodology#anomaly-engine">methodology
                page</Link>. They are statistical descriptions of patterns
                in past reported data, not causal claims and not
                predictions. A flagged anomaly may reflect a real release,
                a reporting change, a methodology revision in the source
                dataset, or noise in a small denominator.
              </p>
              <p>
                Equity overlays use EJScreen demographic and environmental
                indicators alongside emissions data. The overlay describes
                co-location of pollution and demographic features; it is
                not a causal attribution and does not replace formal
                environmental-justice analysis.
              </p>
            </section>

            <section>
              <h2>Not for safety, legal, medical, or commercial decisions</h2>
              <p>
                Nothing on Pollution Analyst constitutes legal, medical,
                financial, real-estate, insurance, employment, or
                public-health advice. The site is an educational and
                academic exercise intended for learning, research, and
                civic curiosity. Do not use it as the sole basis for:
              </p>
              <ul>
                <li>real-estate purchase, rental, or valuation decisions;</li>
                <li>insurance underwriting, pricing, or claims;</li>
                <li>medical diagnosis, treatment, or exposure assessment;</li>
                <li>regulatory enforcement, litigation, or permitting decisions;</li>
                <li>facility siting, operational, or compliance decisions;</li>
                <li>any decision affecting personal safety or legal status.</li>
              </ul>
              <p>
                Reported releases, modeled concentrations, and violation
                counts describe what was reported to or modeled by federal
                programs — not the actual exposure, dose, or health risk
                experienced by any individual or community. Risk depends on
                pathway, duration, demographics, and many factors not
                captured in these datasets.
              </p>
            </section>

            <section>
              <h2>Limitation of liability</h2>
              <p>
                To the maximum extent permitted by law, Pollution Analyst
                and its operators shall not be liable for any direct,
                indirect, incidental, consequential, special, or
                exemplary damages arising from use of, or inability to
                use, this site or its data — including but not limited
                to errors, omissions, inaccuracies, downtime, or
                decisions made in reliance on the content.
              </p>
            </section>

            <section>
              <h2>Privacy</h2>
              <p>
                Pollution Analyst does not require accounts and does not
                collect personally identifiable information from
                visitors. The underlying federal datasets describe
                facilities, water systems, Census tracts, counties, and
                states — not individuals. Facility operators named on the
                site are legal entities reporting under federal disclosure
                programs; that information is public by statute.
              </p>
              <p>
                The site uses standard web-hosting infrastructure
                (Vercel) which collects aggregated, non-identifying
                request metadata such as IP address, user-agent, and
                referrer for the purpose of operating and securing the
                service. We do not sell, share, or use this metadata for
                advertising or profiling.
              </p>
            </section>

            <section>
              <h2>Intellectual property</h2>
              <p>
                Original prose, charts, signal definitions, taxonomy, and
                page layouts on Pollution Analyst are © {new Date().getFullYear()}
                {" "}Pollution Analyst. Underlying federal data is in the
                public domain under 17 USC §105 and remains attributable
                to its publishing agency. You are welcome to cite, quote,
                and link to the site with attribution; please do not
                scrape, mirror, or republish full pages without
                permission.
              </p>
            </section>

            <section>
              <h2>Changes to these terms</h2>
              <p>
                These terms may be updated as the site evolves. Material
                changes will be reflected in the &quot;Last updated&quot;
                date at the top of this page. Continued use of the site
                after changes constitutes acceptance of the revised
                terms.
              </p>
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
