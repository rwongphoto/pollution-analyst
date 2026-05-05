import type { Metadata } from "next";
import Link from "next/link";

import { NotableSignals } from "@/components/site/AnomalyCard";
import { Crumbs } from "@/components/site/Crumbs";
import { EquityStub } from "@/components/site/EquityStub";
import { HeroChart, MediaSplitBar } from "@/components/site/HeroChart";
import { Ic } from "@/components/site/icons";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Sparkline } from "@/components/site/Sparkline";
import {
  listFacilitySlugs,
  loadFacility,
} from "@/lib/data";
import {
  disparityLanguage,
  equityIndexLanguage,
  isEquityStub,
  longArcLanguage,
  magnitudeLanguage,
  pctSigned,
  poundsFormat,
} from "@/lib/prose";
import { pageMeta } from "@/lib/seo";
import type { ChemicalRelease, FacilityPagePayload } from "@/lib/types";

export const dynamicParams = false;

type RouteParams = { state: string; slug: string };

export async function generateStaticParams(): Promise<RouteParams[]> {
  return listFacilitySlugs();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { state, slug } = await params;
  const data = await loadFacility(state, slug);
  return pageMeta({
    title: `${data.facility.name} — TRI Releases | Pollution Analyst.ai`,
    description: `${data.facility.name} reported ${poundsFormat(data.totals.total_releases_pounds)} of TRI-tracked toxic releases in ${data.reporting_year}. ${data.totals.chemicals_reported} chemicals; equity context from EJScreen.`,
    path: `/state/${state}/facility/${slug}`,
  });
}

const CHEM_COLOR: Record<ChemicalRelease["category"], string> = {
  carcinogen: "#FF6B6B",
  pbt: "#E6B450",
  neurotoxin: "#A78BFA",
  respiratory: "#22D3EE",
  general: "#60A5FA",
};

const CHEM_LABEL: Record<ChemicalRelease["category"], string> = {
  carcinogen: "CARCINOGEN",
  pbt: "PBT",
  neurotoxin: "NEUROTOXIN",
  respiratory: "RESPIRATORY",
  general: "GENERAL",
};

function FacilityHero({ data }: { data: FacilityPagePayload }) {
  const f = data.facility;
  const t = data.totals;
  const yoyLanguage = magnitudeLanguage(t.yoy_pct_change);
  const longArcText = t.long_arc_pct_change != null
    ? longArcLanguage(t.long_arc_pct_change, "Total releases", t.long_arc_baseline_year)
    : null;
  return (
    <section className="home-hero">
      <div className="wrap">
        <div>
          <div className="eyebrow">TRI facility · {data.briefing_label}</div>
          <h1>{f.name}</h1>
          <p className="lead lede" style={{ maxWidth: "70ch" }}>
            Total reported releases <strong>{poundsFormat(t.total_releases_pounds)}</strong>{" "}
            {yoyLanguage} year over year ({pctSigned(t.yoy_pct_change)}).
            {longArcText ? <> {longArcText}</> : null}
          </p>
          <p className="muted" style={{ marginTop: 8 }}>
            {f.address}, {f.city}, {f.state_label} · {f.naics_label}
            {f.parent_company ? <> · operated by {f.parent_company}</> : null}
          </p>
          <div className="actions">
            <Link href={`/state/${f.state}/county/${f.county_slug}`} className="btn btn-primary">
              See {f.county} <Ic.arrow s={14} />
            </Link>
            <Link href="/methodology" className="btn btn-ghost">
              How we read TRI
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr minmax(260px, 360px)", gap: 32, alignItems: "start" }}>
          <div>
            <div className="meta-mono" style={{ color: "var(--fg-3)", fontSize: 11, marginBottom: 6 }}>
              TOTAL RELEASES · {t.long_arc_baseline_year}–{data.reporting_year}
            </div>
            <HeroChart history={t.history} units="lb" color="var(--blue)" height={170} />
          </div>
          <aside style={{ borderLeft: "1px solid var(--rule)", paddingLeft: 24 }}>
            <div className="kicker" style={{ marginBottom: 10 }}>Release breakdown · {data.reporting_year}</div>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "grid", gap: 8 }}>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>AIR</span>
                <span>{poundsFormat(t.air_releases_pounds)}</span>
              </li>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>WATER</span>
                <span>{poundsFormat(t.water_releases_pounds)}</span>
              </li>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>LAND/OFF-SITE</span>
                <span>{poundsFormat(t.land_releases_pounds)}</span>
              </li>
              <li className="meta-mono" style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--rule)", paddingTop: 8, marginTop: 4 }}>
                <span>CHEMICALS</span>
                <span>{t.chemicals_reported}</span>
              </li>
            </ul>
            <MediaSplitBar
              air={t.air_releases_pounds}
              water={t.water_releases_pounds}
              land={t.land_releases_pounds}
            />
          </aside>
        </div>
      </div>
    </section>
  );
}

function ChemicalsSection({ chemicals }: { chemicals: ChemicalRelease[] }) {
  return (
    <section className="section">
      <div className="wrap">
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow">Chemicals reported · most recent year</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            What this facility releases
          </h2>
        </div>
        <div className="cities-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {chemicals.map((c) => {
            const color = CHEM_COLOR[c.category];
            const values = c.history.map((p) => p.value);
            const years = c.history.map((p) => p.year);
            return (
              <div key={c.cas} className="city-tile live" style={{ cursor: "default" }}>
                <div className="tile-meta">
                  <span style={{ color }}>{CHEM_LABEL[c.category]}</span>
                  <span>CAS {c.cas}</span>
                </div>
                <h3>{c.chemical}</h3>
                <p className="meta-mono" style={{ margin: "4px 0 12px", fontSize: 12 }}>
                  {poundsFormat(c.total_pounds_recent)} · {pctSigned(c.yoy_pct_change)} YoY
                </p>
                <div style={{ height: 50, marginBottom: 12 }}>
                  <Sparkline values={values} years={years} width={260} height={50} color={color} strokeWidth={1.7} />
                </div>
                <p className="desc" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                  {longArcLanguage(c.long_arc_pct_change, c.chemical, c.long_arc_baseline_year)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function EquitySection({ data }: { data: FacilityPagePayload }) {
  const e = data.equity;
  if (isEquityStub(e)) {
    return (
      <EquityStub
        geographyLabel={e.geography_label}
        population={e.population}
        scopeLabel="Around this facility"
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
            Who lives next to this facility
          </h2>
          <p className="lead" style={{ maxWidth: "62ch", marginTop: 14 }}>
            {e.geography_label}: a population of <strong>{e.population.toLocaleString()}</strong>.
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

        {(e.ej_indexes?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 32 }}>
            <p className="meta-mono" style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 14 }}>
              NATIONAL PERCENTILE · vs all US block groups (population-weighted; ranked against the national EJScreen indicator distribution)
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 14 }}>
              {e.ej_indexes.map((row) => {
                const pct = row.pct_us;
                const barColor = pct >= 90 ? "var(--red)" : pct >= 80 ? "var(--amber)" : pct >= 60 ? "var(--blue)" : "var(--green)";
                const numColor = pct >= 80 ? "var(--red)" : pct >= 60 ? "var(--amber)" : "var(--fg-2)";
                return (
                  <li key={row.label} style={{ display: "grid", gridTemplateColumns: "1fr 60px 220px", gap: 12, alignItems: "center" }}>
                    <span style={{ fontSize: 14, color: "var(--fg-2)" }}>{row.label}</span>
                    <span className="num-mono" style={{ textAlign: "right", color: numColor, fontSize: 14 }}>
                      {pct.toFixed(0)}
                    </span>
                    <span className="muted" style={{ fontSize: 12.5 }}>{equityIndexLanguage(pct)}</span>
                    <span style={{ gridColumn: "1 / -1", height: 6, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", width: `${pct}%`, background: barColor }} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {(e.disparity_scores?.length ?? 0) > 0 && (
          <table className="tbl">
            <caption style={{ captionSide: "top", textAlign: "left", padding: "0 0 12px", fontSize: 13, color: "var(--ink-3)" }}>
              EJ disparity scores · population-weighted (100 = national reference; higher = greater disparate burden)
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

function SourceFooter({ data }: { data: FacilityPagePayload }) {
  return (
    <section className="section" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 24, fontSize: 13, color: "var(--ink-3)" }}>
          <p>
            <strong>Source.</strong>{" "}
            <a href={data.source.url} target="_blank" rel="noreferrer">{data.source.label}</a>{" "}
            · retrieved {data.source.retrieved}. Reporting year {data.reporting_year}. TRI is a federal public-domain dataset under 17 USC §105.
          </p>
          <p style={{ marginTop: 8 }}>
            <strong>What this is not.</strong> TRI quantifies releases reported by the facility under EPCRA §313 — not ambient air or water concentrations measured at receptors. We do not attribute individual health outcomes to specific facilities; that exceeds what the data can support.
          </p>
        </div>
      </div>
    </section>
  );
}

export default async function FacilityPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { state, slug } = await params;
  const data = await loadFacility(state, slug);
  return (
    <>
      <SiteHeader active="facility" />
      <main>
        <Crumbs
          items={[
            { label: data.facility.state_label, href: `/state/${data.facility.state}` },
            { label: data.facility.county, href: `/state/${data.facility.state}/county/${data.facility.county_slug}` },
            { label: data.facility.name },
          ]}
        />
        <FacilityHero data={data} />
        <NotableSignals
          flags={data.flags ?? []}
          emptyLabel="No notable signals at this facility for the current reporting year. See chemicals and equity context below for the full picture."
        />
        <ChemicalsSection chemicals={data.chemicals} />
        <EquitySection data={data} />
        <SourceFooter data={data} />
      </main>
      <SiteFooter briefingLabel={data.briefing_label} />
    </>
  );
}
