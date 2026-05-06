import Link from "next/link";

import { poundsFormat } from "@/lib/prose";
import type { RelatedPlace } from "@/lib/types";

// Cross-link module rendered at the bottom of county and city pages.
// 5 pollution-profile peers + 1 deliberate contrast (similar scale,
// opposite EJ band) — the contrast slot is the editorial point. Picker
// logic + selection lives in pipeline/src/publish/site.py.

const MEDIUM_LABEL: Record<RelatedPlace["dominant_medium"], string> = {
  air: "Air-dominant",
  water: "Water-dominant",
  land: "Land-dominant",
  none: "Quiet TRI profile",
};

function placeHref(p: RelatedPlace): string {
  return `/state/${p.state}/${p.kind}/${p.slug}`;
}

export function RelatedPlaces({
  places,
  scopeLabel,
  stateLabel,
}: {
  places: RelatedPlace[];
  scopeLabel: "County" | "City";
  stateLabel: string;
}) {
  if (!places || places.length === 0) return null;
  const heading =
    scopeLabel === "County"
      ? `Counties To Compare In ${stateLabel}`
      : `Cities To Compare In ${stateLabel}`;
  const lede =
    scopeLabel === "County"
      ? "Five counties whose pollution profile most resembles this one — plus one deliberate contrast at similar scale but opposite equity burden, so the wealth-pollution gap stays on the page."
      : "Mostly nearby cities in the same county, plus one statewide profile peer and a deliberate contrast at comparable scale.";
  return (
    <section className="section" id="related" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="wrap">
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">Compare {scopeLabel.toLowerCase() === "county" ? "counties" : "cities"}</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 12px" }}>
            {heading}
          </h2>
          <p className="lead" style={{ margin: 0, maxWidth: "62ch", fontSize: 15 }}>
            {lede}
          </p>
        </div>
        <div
          className="cities-grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
        >
          {places.map((p) => {
            const isContrast = p.relation === "contrast";
            const tagLabel = isContrast ? "CONTRAST" : "PEER";
            const tagColor = isContrast ? "var(--amber)" : "var(--blue)";
            const releaseStr =
              p.total_releases_pounds > 0 ? poundsFormat(p.total_releases_pounds) : "0 lb";
            return (
              <Link
                key={`${p.kind}-${p.slug}`}
                href={placeHref(p)}
                className="city-tile live"
                style={{ textDecoration: "none", color: "inherit", display: "block" }}
              >
                <div className="tile-meta">
                  <span style={{ color: tagColor, fontWeight: 600 }}>{tagLabel}</span>
                  <span>{MEDIUM_LABEL[p.dominant_medium]}</span>
                </div>
                <h3 style={{ fontSize: 20, lineHeight: 1.25 }}>{p.name}</h3>
                <p
                  className="meta-mono"
                  style={{ margin: "4px 0 10px", fontSize: 12, color: "var(--fg-2)" }}
                >
                  {p.facilities_count} {p.facilities_count === 1 ? "facility" : "facilities"} · {releaseStr}
                  {p.population > 0 ? <> · {p.population.toLocaleString()} residents</> : null}
                  {p.ej_pct_avg != null ? <> · EJ avg {p.ej_pct_avg.toFixed(0)}</> : null}
                </p>
                <p className="desc" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                  {p.reason}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
