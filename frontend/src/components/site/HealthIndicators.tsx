import type { HealthIndicator } from "@/lib/types";

// Co-located health indicators — modeled small-area prevalence from CDC
// PLACES paired with the local pollution + demographic context.
//
// EDITORIAL CONTRACT: every tile is labeled with source + vintage; the
// section subtitle states the modeled-not-measured caveat and the
// ecological-not-causal disclaimer. Methodology page carries the longer
// form. Do not remove these guardrails — health indicators on a pollution
// site invite causal misreading and we are deliberately preventing that.

function pillStyle(cls: HealthIndicator["vs_state_class"]) {
  switch (cls) {
    case "worse":
      return { color: "var(--red)", bg: "rgba(239, 68, 68, 0.12)" };
    case "elevated":
      return { color: "var(--amber)", bg: "rgba(245, 158, 11, 0.12)" };
    case "better":
      return { color: "var(--green)", bg: "rgba(34, 197, 94, 0.12)" };
    case "neutral":
    default:
      return { color: "var(--fg-2)", bg: "var(--bg-3)" };
  }
}

function compareLabel(h: HealthIndicator, geographyLabel: string): string {
  if (h.vs_state_pct == null) return "—";
  const sign = h.vs_state_pct > 0 ? "+" : "";
  const pp = h.vs_state_pp != null ? ` (${h.vs_state_pp > 0 ? "+" : ""}${h.vs_state_pp.toFixed(1)} pp)` : "";
  return `${sign}${h.vs_state_pct.toFixed(0)}% vs ${geographyLabel}${pp}`;
}

export function HealthIndicators({
  indicators,
  scopeLabel,
  comparatorLabel,
}: {
  indicators: HealthIndicator[];
  scopeLabel: "County" | "City";
  comparatorLabel: string; // e.g. "California mean"
}) {
  if (!indicators || indicators.length === 0) return null;
  const sourceLabels = Array.from(new Set(indicators.map((h) => h.source)));
  return (
    <section className="section" id="health">
      <div className="wrap">
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">Health context</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 12px" }}>
            Co-located health indicators
          </h2>
          <p className="lead" style={{ margin: 0, maxWidth: "62ch", fontSize: 15 }}>
            Modeled adult-prevalence estimates published by CDC PLACES, paired with this {scopeLabel.toLowerCase()}&apos;s pollution and demographic context. Comparisons are ecological, not causal — pollution and disease prevalence covary at the area level, but the data does not attribute any individual&apos;s diagnosis to local exposure.{" "}
            <a href="/methodology#health" style={{ color: "var(--blue)" }}>
              How this section works →
            </a>
          </p>
        </div>
        <div
          className="cities-grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
        >
          {indicators.map((h) => {
            const { color, bg } = pillStyle(h.vs_state_class);
            return (
              <div
                key={h.measure_key}
                className="city-tile live"
                style={{ cursor: "default" }}
              >
                <div className="tile-meta">
                  <span>{h.label.toUpperCase()}</span>
                  <span>BRFSS {h.vintage_year}</span>
                </div>
                <h3 style={{ fontSize: 32 }}>
                  {h.crude.toFixed(1)}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 13,
                      color: "var(--fg-3)",
                      marginLeft: 4,
                      letterSpacing: "0.04em",
                    }}
                  >
                    %
                  </span>
                </h3>
                <p
                  className="meta-mono"
                  style={{
                    margin: "8px 0 0",
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: bg,
                      color,
                      fontWeight: 600,
                    }}
                  >
                    {compareLabel(h, comparatorLabel)}
                  </span>
                </p>
                <p
                  className="muted"
                  style={{ marginTop: 12, fontSize: 11.5, lineHeight: 1.4 }}
                >
                  {h.source}
                </p>
              </div>
            );
          })}
        </div>
        <p
          className="muted"
          style={{
            fontSize: 12,
            marginTop: 18,
            maxWidth: "70ch",
          }}
        >
          PLACES uses BRFSS-modeled small-area estimates, not individual records. Crude prevalence shown above is the local rate as published; the comparator is age-adjusted vs the {comparatorLabel.toLowerCase()} so geographies with different age structures stay apples-to-apples. Sources: <a href="https://www.cdc.gov/places/" target="_blank" rel="noreferrer">{sourceLabels.join(", ")}</a>.
        </p>
      </div>
    </section>
  );
}
