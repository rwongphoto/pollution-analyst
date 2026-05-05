import type { Metadata } from "next";
import Link from "next/link";

import { NotableSignals } from "@/components/site/AnomalyCard";
import { Crumbs } from "@/components/site/Crumbs";
import { EquityStub } from "@/components/site/EquityStub";
import { HeroChart } from "@/components/site/HeroChart";
import { Ic } from "@/components/site/icons";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import {
  listWaterSlugs,
  loadWaterUtility,
} from "@/lib/data";
import {
  disparityLanguage,
  isEquityStub,
  severityClass,
  severityLabel,
} from "@/lib/prose";
import { pageMeta } from "@/lib/seo";
import type { WaterUtilityPayload } from "@/lib/types";

export const dynamicParams = false;

type RouteParams = { state: string; slug: string };

export async function generateStaticParams(): Promise<RouteParams[]> {
  return listWaterSlugs();
}

// Derive the city display name from the utility payload. Prefers the
// SDWIS city_name field (carried as cities_served[0]); falls back to
// title-casing the URL slug. Strips redundant "City Of" prefixes that
// some SDWIS records bake into the city_name itself.
function cityDisplayName(u: WaterUtilityPayload["utility"], slug: string): string {
  const stripPrefix = (s: string) => {
    for (const p of ["City Of ", "Town Of ", "Village Of "]) {
      if (s.startsWith(p)) return s.slice(p.length);
    }
    return s;
  };
  const fromSdwis = u.cities_served?.[0]?.trim();
  if (fromSdwis) return stripPrefix(fromSdwis);
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { state, slug } = await params;
  const data = await loadWaterUtility(state, slug);
  const city = cityDisplayName(data.utility, slug);
  return pageMeta({
    title: `${data.utility.name} Water Quality | Pollution Analyst.ai`,
    description: `${data.utility.name} (PWSID ${data.utility.pwsid}) — drinking water serving ${city}, ${data.utility.state_label}. ${data.utility.population_served.toLocaleString()} people served. SDWIS violation history and contaminant detail.`,
    path: `/state/${state}/water/${slug}`,
  });
}

const SOURCE_LABEL: Record<WaterUtilityPayload["utility"]["primary_source"], string> = {
  groundwater: "Groundwater",
  surface_water: "Surface water",
  purchased: "Purchased / wholesale",
  mixed: "Mixed sources",
};

function WaterHero({ data, slug }: { data: WaterUtilityPayload; slug: string }) {
  const u = data.utility;
  const t = data.totals;
  const lead = data.violations[0];
  const city = cityDisplayName(u, slug);
  const history = data.metrics?.violations_history ?? [];
  return (
    <section className="home-hero">
      <div className="wrap">
        <div>
          <div className="eyebrow">{u.state_label} · drinking water · {data.briefing_label}</div>
          <h1>{u.name} Water Quality — {city}, {u.state_label}</h1>
          <p className="muted" style={{ marginTop: -4, marginBottom: 16, fontSize: 13.5 }}>
            PWSID {u.pwsid} · {SOURCE_LABEL[u.primary_source]}
          </p>
          <p className="lead lede" style={{ maxWidth: "70ch" }}>
            <strong>{u.population_served.toLocaleString()}</strong> people served.
            {" "}{t.health_based_violations_5yr === 0 ? (
              <>No <em>health-based</em> SDWIS violations recorded in the past 5 years.</>
            ) : (
              <>
                <strong>{t.health_based_violations_5yr}</strong> health-based{" "}
                SDWIS violation{t.health_based_violations_5yr === 1 ? "" : "s"} recorded in the past 5 years.
              </>
            )}
            {t.unresolved_violations > 0 ? (
              <> {t.unresolved_violations} {t.unresolved_violations === 1 ? "remains" : "remain"} unresolved.</>
            ) : null}
            {t.years_since_last_violation != null ? (
              <> Last cited <strong>{t.years_since_last_violation === 0 ? "this year" : `${t.years_since_last_violation} ${t.years_since_last_violation === 1 ? "year" : "years"} ago`}</strong>.</>
            ) : null}
          </p>
          <div className="actions">
            <Link href="/methodology#sdwis" className="btn btn-primary">
              How we read SDWIS <Ic.arrow s={14} />
            </Link>
            <a href={`https://ofmpub.epa.gov/apex/sfdw/f?p=108:200:::NO::P200_PWSID:${u.pwsid}`} target="_blank" rel="noreferrer" className="btn btn-ghost">
              EPA SDWIS record
            </a>
          </div>
        </div>

        <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr minmax(260px, 360px)", gap: 32, alignItems: "start" }}>
          <div>
            {history.length > 1 ? (
              <>
                <div className="meta-mono" style={{ color: "var(--fg-3)", fontSize: 11, marginBottom: 6 }}>
                  ALL SDWIS VIOLATIONS · {history[0].year}–{history[history.length - 1].year} (annual count)
                </div>
                <HeroChart
                  history={history.map((h) => ({ year: h.year, value: h.value }))}
                  units="violations"
                  color="var(--red)"
                  height={170}
                />
              </>
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>Insufficient violation history for a multi-year chart.</div>
            )}
          </div>
          <aside style={{ borderLeft: "1px solid var(--rule)", paddingLeft: 24 }}>
            <div className="kicker" style={{ marginBottom: 10 }}>5-year tally</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>VIOLATIONS</span>
                <span>{t.violations_5yr}</span>
              </li>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>HEALTH-BASED</span>
                <span>{t.health_based_violations_5yr}</span>
              </li>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>UNRESOLVED</span>
                <span>{t.unresolved_violations}</span>
              </li>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--rule)", paddingTop: 8, marginTop: 4 }}>
                <span>CONTAMINANTS</span>
                <span>{t.contaminants_with_violations}</span>
              </li>
            </ul>
            {lead ? (
              <p className="muted" style={{ fontSize: 12.5, marginTop: 16 }}>
                Most recent: {lead.contaminant} · {lead.year}{lead.is_unresolved ? " (unresolved)" : ""}.
              </p>
            ) : null}
          </aside>
        </div>
      </div>
    </section>
  );
}

function TopContaminantsSection({ data }: { data: WaterUtilityPayload }) {
  const tops = data.metrics?.top_contaminants ?? [];
  if (tops.length === 0) return null;
  const max = tops[0]?.count ?? 1;
  return (
    <section className="section">
      <div className="wrap">
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow">Most-cited contaminants</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            What this utility gets cited for
          </h2>
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12, maxWidth: "60ch" }}>
          {tops.map((c) => (
            <li key={c.contaminant} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 14 }}>{c.contaminant}</span>
              <span className="num-mono" style={{ fontSize: 13 }}>{c.count} {c.count === 1 ? "citation" : "citations"}</span>
              <span style={{ gridColumn: "1 / -1", height: 6, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${(c.count / max) * 100}%`, background: "var(--red)" }} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ViolationsSection({ violations }: { violations: WaterUtilityPayload["violations"] }) {
  return (
    <section className="section">
      <div className="wrap">
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow">Violation history</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            What&apos;s on the SDWIS record
          </h2>
          <p className="lead" style={{ maxWidth: "62ch", marginTop: 14 }}>
            Health-based violations exceed an MCL or treatment-technique standard. Monitoring violations are reporting failures with no measured exceedance — they tell you the system isn&apos;t fully transparent, not that the water is unsafe today.
          </p>
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          {violations.length === 0 ? (
            <p className="muted">No SDWIS violations recorded in the analysis window.</p>
          ) : null}
          {violations.map((v, i) => (
            <article key={i} className={`anomaly-card ${v.severity === "health_based" ? "spike" : "rare"}`}>
              <div className="head">
                <span className={severityClass(v.severity)}>{severityLabel(v.severity)} · {v.contaminant.toUpperCase()}</span>
                {v.is_unresolved && (
                  <span className="meta-mono" style={{ color: "var(--red)" }}>UNRESOLVED</span>
                )}
              </div>
              <h3>
                {v.year} · {v.rule}
              </h3>
              <p>{v.description}</p>
              <p className="meta-mono" style={{ color: "var(--fg-4)", fontSize: 11, marginTop: 12 }}>
                CONTAMINANT CODE {v.contaminant_code}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function EquitySection({ data }: { data: WaterUtilityPayload }) {
  const e = data.equity;
  if (isEquityStub(e)) {
    return (
      <EquityStub
        geographyLabel={e.geography_label}
        population={e.population}
        scopeLabel="Service-area"
      />
    );
  }
  const topDisp = (e.disparity_scores ?? [])[0];
  return (
    <section className="section section-tint" id="equity">
      <div className="wrap">
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">Equity context · ACS 2018-2022 · USEPA-clone EJ disparity</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            Who drinks this water
          </h2>
          <p className="lead" style={{ maxWidth: "62ch", marginTop: 14 }}>
            {e.geography_label}: a service population of <strong>{e.population.toLocaleString()}</strong>.
            {topDisp ? <> Local disparity score for {topDisp.label.toLowerCase()} sits {disparityLanguage(topDisp.score)} ({topDisp.score.toFixed(0)}).</> : null}{" "}
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
              <h3 style={{ fontSize: 28 }}>{row.value == null ? "—" : `${row.value.toFixed(1)}%`}</h3>
              <p className="desc">{row.label}</p>
            </div>
          ))}
        </div>

        {(e.disparity_scores?.length ?? 0) > 0 && (
          <table className="tbl">
            <caption style={{ captionSide: "top", textAlign: "left", padding: "0 0 12px", fontSize: 13, color: "var(--ink-3)" }}>
              EJ disparity scores · service-area block groups (100 = national reference; higher = greater disparate burden)
            </caption>
            <thead>
              <tr>
                <th>Indicator</th>
                <th className="right">Disparity score</th>
                <th>Reading</th>
              </tr>
            </thead>
            <tbody>
              {e.disparity_scores!.map((row) => (
                <tr key={row.label}>
                  <td className="name">{row.label}</td>
                  <td
                    className={`right num-mono ${
                      row.score >= 150 ? "delta-down" : row.score >= 110 ? "delta-flat" : "delta-up"
                    }`}
                  >
                    {row.score.toFixed(0)}
                  </td>
                  <td className="muted">{disparityLanguage(row.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
          Source: {e.source}.
        </p>
      </div>
    </section>
  );
}

function SourceFooter({ data }: { data: WaterUtilityPayload }) {
  return (
    <section className="section" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 24, fontSize: 13, color: "var(--ink-3)" }}>
          <p>
            <strong>Source.</strong>{" "}
            <a href={data.source.url} target="_blank" rel="noreferrer">{data.source.label}</a>{" "}
            · retrieved {data.source.retrieved}. Reporting period {data.reporting_period.start} → {data.reporting_period.end}.
          </p>
          <p style={{ marginTop: 8 }}>
            <strong>What this is not.</strong> SDWIS records compliance against federal MCLs — not a direct readout of tap-water concentrations. Active health-based violations are not the same as a current crisis; we link to the EPA record so you can verify return-to-compliance status before forming a conclusion.
          </p>
        </div>
      </div>
    </section>
  );
}

export default async function WaterPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { state, slug } = await params;
  const data = await loadWaterUtility(state, slug);
  const city = cityDisplayName(data.utility, slug);
  return (
    <>
      <SiteHeader active="water" />
      <main>
        <Crumbs
          items={[
            { label: data.utility.state_label, href: `/state/${data.utility.state}` },
            { label: city },
          ]}
        />
        <WaterHero data={data} slug={slug} />
        <NotableSignals
          flags={data.flags ?? []}
          title="Active signals"
          emptyLabel="No SDWIS health-based or unresolved violations on the record. Contaminant detail and equity context below."
        />
        <TopContaminantsSection data={data} />
        <ViolationsSection violations={data.violations} />
        <EquitySection data={data} />
        <SourceFooter data={data} />
      </main>
      <SiteFooter briefingLabel={data.briefing_label} />
    </>
  );
}
