import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

import { NotableSignals } from "@/components/site/AnomalyCard";
import { ChemicalCell } from "@/components/site/ChemicalCell";
import { Crumbs } from "@/components/site/Crumbs";
import { EquityStub } from "@/components/site/EquityStub";
import { Ic } from "@/components/site/icons";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import {
  listSuperfundSlugs,
  loadSuperfund,
} from "@/lib/data";
import { isEquityStub } from "@/lib/prose";
import { pageMeta, SITE_URL } from "@/lib/seo";
import type { SuperfundPayload } from "@/lib/types";

function superfundDescription(data: SuperfundPayload): string {
  const s = data.site;
  const where = [s.city, s.county, s.state_label].filter(Boolean).join(", ");
  return `${s.name} (${s.npl_status}) in ${where}. ${data.totals.contaminants_count} contaminants of concern reported to EPA's Superfund Enterprise Management System.`;
}

export const dynamicParams = false;

type RouteParams = { state: string; slug: string };

export async function generateStaticParams(): Promise<RouteParams[]> {
  return listSuperfundSlugs();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { state, slug } = await params;
  const data = await loadSuperfund(state, slug);
  const s = data.site;
  return pageMeta({
    title: `${s.name} — Superfund Site | Pollution Analyst`,
    description: superfundDescription(data),
    path: `/state/${state}/superfund/${slug}`,
  });
}

function statusEyebrow(s: SuperfundPayload["site"]): string {
  if (s.is_active_npl) return "NPL Final";
  if (s.is_deleted) return "NPL Deleted";
  if (s.npl_status === "Proposed for NPL") return "NPL Proposed";
  return s.npl_status;
}

function statusSentence(s: SuperfundPayload["site"]): string {
  if (s.is_active_npl) {
    return "This site is currently on the EPA Superfund National Priorities List and remains under federal cleanup oversight.";
  }
  if (s.is_deleted) {
    return "This site has been deleted from the EPA Superfund National Priorities List — EPA's classification means construction-complete cleanup objectives were achieved, though monitoring may continue.";
  }
  if (s.npl_status === "Proposed for NPL") {
    return "This site has been proposed for inclusion on the EPA Superfund National Priorities List but has not yet been finalized.";
  }
  return `Status per EPA's SEMS database: ${s.npl_status}.`;
}

function SuperfundHero({ data }: { data: SuperfundPayload }) {
  const s = data.site;
  const t = data.totals;
  const locationParts = [s.address, s.city, s.state_label].filter(Boolean);
  const locationLine = locationParts.join(", ");
  return (
    <section className="home-hero">
      <div className="wrap">
        <div>
          <div className="eyebrow" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span>Superfund / NPL site · {data.briefing_label}</span>
            <span aria-hidden="true">·</span>
            <span style={{ color: s.is_active_npl ? "var(--red)" : s.is_deleted ? "var(--green)" : "var(--amber)" }}>
              {statusEyebrow(s)}
            </span>
            {s.is_federal_facility ? (
              <>
                <span aria-hidden="true">·</span>
                <span>FEDERAL FACILITY</span>
              </>
            ) : null}
          </div>
          <h1>{s.name}</h1>
          <p className="lead lede" style={{ maxWidth: "70ch" }}>
            {statusSentence(s)}
            {t.primary_contaminant ? (
              <>
                {" "}Most-cited contaminant of concern: <strong>{t.primary_contaminant}</strong>.
              </>
            ) : null}
          </p>
          {locationLine ? (
            <p className="muted" style={{ marginTop: 8 }}>
              {locationLine}
              {s.zip ? <> · ZIP {s.zip}</> : null}
              {" "}· EPA ID {s.epa_id}
            </p>
          ) : null}
          <div className="actions">
            {s.county_slug && s.county ? (
              <Link href={`/state/${s.state}/county/${s.county_slug}`} className="btn btn-primary">
                See {s.county} <Ic.arrow s={14} />
              </Link>
            ) : null}
            <Link href="/methodology" className="btn btn-ghost">
              How we read Superfund data
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr minmax(260px, 360px)", gap: 32, alignItems: "start" }}>
          <div>
            <div className="meta-mono" style={{ color: "var(--fg-3)", fontSize: 11, marginBottom: 6 }}>
              CLEANUP TIMELINE
            </div>
            <p className="muted" style={{ fontSize: 13.5, maxWidth: "60ch" }}>
              Listing-date and cleanup-phase enrichment from EPA's per-site SEMS profile is queued for a follow-up
              ingest pass. Until then, this section will populate from EPA's published timeline data.
            </p>
          </div>
          <aside style={{ borderLeft: "1px solid var(--rule)", paddingLeft: 24 }}>
            <div className="kicker" style={{ marginBottom: 10 }}>SEMS site detail</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>STATUS</span>
                <span style={{ textAlign: "right", fontSize: 11.5 }}>{s.npl_status}</span>
              </li>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>FEDERAL FACILITY</span>
                <span>{s.is_federal_facility ? "Yes" : "No"}</span>
              </li>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>CONTAMINANTS</span>
                <span>{t.contaminants_count}</span>
              </li>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: "1px solid var(--rule)", paddingTop: 8, marginTop: 4 }}>
                <span>EPA ID</span>
                <span style={{ fontSize: 11.5 }}>{s.epa_id}</span>
              </li>
            </ul>
          </aside>
        </div>
      </div>
    </section>
  );
}

const MEDIA_COLOR: Record<string, string> = {
  Groundwater: "#22D3EE",
  "Surface Water": "#60A5FA",
  Soil: "#E6B450",
  Sediment: "#A78BFA",
  "Solid Waste": "#FF6B6B",
  Air: "#34D399",
};

const CONT_TH_BASE: CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  borderBottom: "1px solid var(--rule)",
  fontSize: 11.5,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--fg-3)",
  fontWeight: "normal",
};

const CONT_TD_BASE: CSSProperties = {
  padding: "10px 14px",
  verticalAlign: "baseline",
};

function ContaminantsSection({ data }: { data: SuperfundPayload }) {
  const conts = data.contaminants;
  if (!conts.length) {
    return (
      <section className="section">
        <div className="wrap">
          <div style={{ marginBottom: 16 }}>
            <div className="eyebrow">Contaminants of concern</div>
            <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
              No Contaminants Of Concern In EPA's Published Record
            </h2>
          </div>
          <p className="lead" style={{ maxWidth: "62ch" }}>
            EPA's SEMS database does not list contaminant-level findings for this site yet. This is common
            for sites still in early assessment or proposed status, and for some deleted sites where the
            published record was finalized before EPA's contaminant-tracking schema was added.
          </p>
        </div>
      </section>
    );
  }
  // Cap the displayed list to the most-cited rows so the page doesn't fan out
  // to 300+ rows on bigger sites; full set is preserved in the JSON.
  const VISIBLE = 30;
  const visible = conts.slice(0, VISIBLE);
  const hidden = conts.length - visible.length;
  return (
    <section className="section">
      <div className="wrap">
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow">Contaminants of concern · per EPA SEMS</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            What's In This Site
          </h2>
          <p className="lead" style={{ maxWidth: "62ch", marginTop: 14 }}>
            Each row pairs a contaminant with the medium it was found in (the exposure pathway). Hover any
            named contaminant for an agency-cited health-risk summary. Cited count = number of SEMS
            decision records (RODs and related) that name the pair.
          </p>
        </div>
        <table
          className="cont-table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
            border: "1px solid var(--rule)",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <thead>
            <tr style={{ background: "var(--graphite-2)" }}>
              <th scope="col" style={CONT_TH_BASE}>Contaminant</th>
              <th scope="col" style={{ ...CONT_TH_BASE, width: 160 }}>Pathway</th>
              <th scope="col" style={{ ...CONT_TH_BASE, width: 80, textAlign: "right" }}>Cited</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c, i) => {
              const color = MEDIA_COLOR[c.media] ?? "var(--fg-3)";
              return (
                <tr
                  key={`${c.name}-${c.media}-${i}`}
                  style={{ borderTop: i === 0 ? "0" : "1px solid var(--rule-soft)" }}
                >
                  <td style={CONT_TD_BASE}><ChemicalCell name={c.name} /></td>
                  <td style={{ ...CONT_TD_BASE, color, fontSize: 13 }}>{c.media || "—"}</td>
                  <td style={{ ...CONT_TD_BASE, textAlign: "right", color: "var(--fg-3)", fontSize: 13 }}>
                    {c.citation_count}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {hidden > 0 ? (
          <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
            Showing the top {visible.length} pairs by SEMS citation count. {hidden} additional (contaminant, pathway)
            pairs are recorded for this site.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function WaterLinkageSection({ data }: { data: SuperfundPayload }) {
  const wl = data.water_linkage;
  if (!wl) return null;
  const utils = wl.utilities;
  const radius = wl.radius_miles;
  return (
    <section className="section section-tint">
      <div className="wrap">
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">Drinking-water linkage · SDWIS</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            {utils.length === 0
              ? `No Groundwater PWSes Serving Communities Within ${radius} Miles`
              : `Groundwater Systems Serving Communities Within ${radius} Miles`}
          </h2>
          <p className="lead" style={{ maxWidth: "62ch", marginTop: 14 }}>
            {utils.length === 0 ? (
              <>
                No SDWIS public water systems drawing groundwater (or mixed sources) serve a community whose
                centroid sits within {radius} miles of this site. Empty results are not a guarantee of
                non-impact — distance is computed to served-place centroids, and SDWIS does not expose
                individual wellhead locations.
              </>
            ) : (
              <>
                The {utils.length} system{utils.length === 1 ? "" : "s"} below draw on groundwater (or mixed sources)
                and serve communities whose centroid sits within {radius} miles of this site. Distance is to the
                served-city centroid — SDWIS does not expose individual wellhead locations, so this is a
                proximity screen, not a wellhead-impact assessment.
              </>
            )}
          </p>
        </div>
        {utils.length > 0 ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Water system</th>
                <th>Serves</th>
                <th className="right">Distance</th>
                <th className="right">Population served</th>
                <th>Source</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {utils.map((u) => (
                <tr key={u.pwsid}>
                  <td className="name">
                    <Link href={`/state/${u.state}/water/${u.slug}`}>{u.name}</Link>
                  </td>
                  <td>{u.place_name}</td>
                  <td className="right num-mono">{u.distance_miles.toFixed(1)} mi</td>
                  <td className="right num-mono">{u.population_served.toLocaleString()}</td>
                  <td>
                    <span className="meta-mono" style={{ fontSize: 11.5 }}>
                      {u.primary_source.toUpperCase().replace("_", " ")}
                    </span>
                  </td>
                  <td>
                    {u.unresolved ? (
                      <span className="chip low">UNRESOLVED</span>
                    ) : u.health_based_5yr > 0 ? (
                      <span className="chip med">{u.health_based_5yr} HEALTH-BASED · 5YR</span>
                    ) : (
                      <span className="muted">In compliance</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <p className="muted" style={{ fontSize: 12.5, marginTop: 14, maxWidth: "62ch" }}>
          Methodology: served-city centroid (TIGER 2020) is used as the PWS coordinate.
          Source-water classification from SDWIS <code>primary_source_code</code>; only groundwater
          and mixed-source systems are queried. Click any system above for its full SDWIS profile.
        </p>
      </div>
    </section>
  );
}

function EquitySection({ data }: { data: SuperfundPayload }) {
  const e = data.equity;
  if (isEquityStub(e)) {
    return (
      <EquityStub
        geographyLabel={e.geography_label}
        population={e.population}
        scopeLabel="Around this site"
      />
    );
  }
  return (
    <section className="section section-tint" id="equity">
      <div className="wrap">
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">Equity context · ACS 2018-2022 block-group demographics</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            Who Lives Near This Site
          </h2>
          <p className="lead" style={{ maxWidth: "62ch", marginTop: 14 }}>
            {e.geography_label}: a population of <strong>{e.population.toLocaleString()}</strong>.{" "}
            <Link href="/methodology#equity">Why we surface this →</Link>
          </p>
        </div>
        <div className="cities-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", marginBottom: 32 }}>
          {[
            { label: "Low-income", value: e.pct_low_income },
            { label: "People of color", value: e.pct_people_of_color },
            { label: "Under age 5", value: e.pct_under_5 },
            { label: "Over age 64", value: e.pct_over_64 },
          ].map((row) => (
            <div key={row.label} className="city-tile live" style={{ cursor: "default" }}>
              <div className="tile-meta"><span>POPULATION SHARE</span></div>
              <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--fg)" }}>
                {row.value == null ? "—" : `${row.value.toFixed(1)}%`}
              </div>
              <p className="desc" style={{ margin: 0 }}>{row.label}</p>
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 14, maxWidth: "62ch" }}>
          Source: {e.source}. NPL site proximity contributes to the national EJ pattern; indicator-level
          percentile and disparity scores are surfaced on the
          {" "}{data.site.county_slug && data.site.county ? (
            <Link href={`/state/${data.site.state}/county/${data.site.county_slug}#equity`}>
              county page
            </Link>
          ) : (
            "containing-county page"
          )}{" "}and the state page.
        </p>
      </div>
    </section>
  );
}

function SourceFooter({ data }: { data: SuperfundPayload }) {
  return (
    <section className="section" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 24, fontSize: 13, color: "var(--ink-3)" }}>
          <p>
            <strong>Source.</strong>{" "}
            <a href={data.source.url} target="_blank" rel="noreferrer">{data.source.label}</a>{" "}
            · retrieved {data.source.retrieved}. SEMS is a federal public-domain dataset under 17 USC §105.
          </p>
          <p style={{ marginTop: 8 }}>
            <strong>What this is not.</strong> We report EPA's published Superfund record — site listing, status,
            and contaminants of concern as named in EPA's decision documents. We do not perform site visits,
            independent air or water sampling, or current-state health-risk assessment. NPL listing reflects EPA's
            Hazard Ranking Score at a point in time; it does not by itself describe present-day exposure.
          </p>
        </div>
      </div>
    </section>
  );
}

export default async function SuperfundPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { state, slug } = await params;
  const data = await loadSuperfund(state, slug);
  const s = data.site;
  const stateUrl = `${SITE_URL}/state/${state}`;
  const pageUrl = `${stateUrl}/superfund/${slug}`;
  const description = superfundDescription(data);
  const publishedAt = data._published_at ?? data.source.retrieved;
  const breadcrumbItems: Array<{ "@type": "ListItem"; position: number; name: string; item: string }> = [
    { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: s.state_label, item: stateUrl },
  ];
  if (s.county && s.county_slug) {
    breadcrumbItems.push({ "@type": "ListItem", position: breadcrumbItems.length + 1, name: s.county, item: `${stateUrl}/county/${s.county_slug}` });
  }
  if (s.city && s.city_slug) {
    breadcrumbItems.push({ "@type": "ListItem", position: breadcrumbItems.length + 1, name: s.city, item: `${stateUrl}/city/${s.city_slug}` });
  }
  breadcrumbItems.push({ "@type": "ListItem", position: breadcrumbItems.length + 1, name: s.name, item: pageUrl });
  const postalAddress: Record<string, string> = {
    "@type": "PostalAddress",
    addressRegion: state.toUpperCase(),
    addressCountry: "US",
  };
  if (s.address) postalAddress.streetAddress = s.address;
  if (s.city) postalAddress.addressLocality = s.city;
  if (s.zip) postalAddress.postalCode = s.zip;
  const place: Record<string, unknown> = {
    "@type": "Place",
    "@id": pageUrl,
    name: s.name,
    description,
    url: pageUrl,
    address: postalAddress,
    identifier: {
      "@type": "PropertyValue",
      propertyID: "EPA ID",
      value: s.epa_id,
    },
  };
  if (s.lat != null && s.lng != null) {
    place.geo = {
      "@type": "GeoCoordinates",
      latitude: s.lat,
      longitude: s.lng,
    };
  }
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: breadcrumbItems },
      {
        "@type": "Article",
        mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
        headline: `${s.name} — Superfund Site | Pollution Analyst`,
        description,
        image: {
          "@type": "ImageObject",
          url: `${SITE_URL}/icon.png`,
          width: 512,
          height: 512,
        },
        datePublished: publishedAt,
        dateModified: publishedAt,
        publisher: {
          "@type": "Organization",
          "@id": `${SITE_URL}/#organization`,
          name: "Pollution Analyst",
          url: SITE_URL,
          logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.png` },
        },
      },
      place,
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
        <Crumbs
          items={[
            { label: s.state_label, href: `/state/${s.state}` },
            ...(s.county
              ? [{
                  label: s.county,
                  ...(s.county_slug ? { href: `/state/${s.state}/county/${s.county_slug}` } : {}),
                }]
              : []),
            ...(s.city
              ? [{
                  label: s.city,
                  ...(s.city_slug ? { href: `/state/${s.state}/city/${s.city_slug}` } : {}),
                }]
              : []),
            { label: s.name },
          ]}
        />
        <SuperfundHero data={data} />
        <NotableSignals
          flags={data.flags ?? []}
          emptyLabel="No notable signals at this Superfund site for the current ingest. Cleanup-phase and SEMS-action flags are deferred to a follow-up engineering pass."
        />
        <ContaminantsSection data={data} />
        <WaterLinkageSection data={data} />
        <EquitySection data={data} />
        <SourceFooter data={data} />
      </main>
      <SiteFooter briefingLabel={data.briefing_label} />
    </>
  );
}
