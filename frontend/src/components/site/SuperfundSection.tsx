import Link from "next/link";

import { ChemicalCell } from "@/components/site/ChemicalCell";
import type { SuperfundSummary } from "@/lib/types";

function statusChip(s: SuperfundSummary): { label: string; cls: string } {
  if (s.is_active_npl) return { label: "NPL FINAL", cls: "low" };       // red — still in cleanup
  if (s.npl_status === "Proposed for NPL") return { label: "PROPOSED", cls: "med" };
  if (s.is_deleted) return { label: "DELETED", cls: "high" };           // green — cleanup objectives met
  return { label: "OTHER", cls: "med" };
}

export function SuperfundSection({
  sites,
  total,
  geographyLabel,
  showHostCity = true,
  emptyLabel,
}: {
  sites: SuperfundSummary[];
  total?: number;            // total in scope; if > sites.length, render an overflow note
  geographyLabel: string;    // "California", "Alameda County", "Mountain View"
  showHostCity?: boolean;
  emptyLabel?: string;       // when no NPL sites — null hides the section entirely
}) {
  if (sites.length === 0) {
    if (!emptyLabel) return null;
    return (
      <section className="section">
        <div className="wrap">
          <div className="eyebrow">Superfund / NPL sites</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            No NPL Sites In {geographyLabel}
          </h2>
          <p className="muted" style={{ marginTop: 10, maxWidth: "62ch" }}>
            {emptyLabel}
          </p>
        </div>
      </section>
    );
  }
  const overflow = total != null && total > sites.length ? total - sites.length : 0;
  return (
    <section className="section">
      <div className="wrap">
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow">Superfund / NPL sites</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            Federal Cleanup Sites In {geographyLabel}
          </h2>
          <p className="muted" style={{ fontSize: 14, marginTop: 10, maxWidth: "62ch" }}>
            Sites on EPA's Superfund National Priorities List, plus deleted sites whose
            cleanup objectives EPA has finalized. Federal-facility sites (defense, DOE,
            etc.) are flagged separately. Each link routes to a per-site page.
          </p>
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
            <Link href="/methodology#sources">Methodology &rarr;</Link>
          </p>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Site</th>
              {showHostCity ? <th>City</th> : null}
              <th>Status</th>
              <th>Federal facility</th>
              <th>Primary contaminant</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => {
              const chip = statusChip(s);
              return (
                <tr key={s.slug}>
                  <td className="name">
                    <Link href={`/state/${s.state}/superfund/${s.slug}`}>{s.name}</Link>
                  </td>
                  {showHostCity ? (
                    <td>
                      {s.city ? (
                        s.city_slug ? (
                          <Link href={`/state/${s.state}/city/${s.city_slug}`}>{s.city}</Link>
                        ) : (
                          s.city
                        )
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  ) : null}
                  <td>
                    <span className={`chip ${chip.cls}`}>{chip.label}</span>
                  </td>
                  <td>{s.is_federal_facility ? <span className="chip med">FEDERAL</span> : <span className="muted">No</span>}</td>
                  <td>{s.primary_contaminant ? <ChemicalCell name={s.primary_contaminant} /> : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {overflow > 0 ? (
          <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
            Showing the top {sites.length} sites by status priority. {overflow} additional NPL-relevant
            sites in {geographyLabel} have entity pages — browse them via the host-county or host-city
            page rollups.
          </p>
        ) : null}
      </div>
    </section>
  );
}
