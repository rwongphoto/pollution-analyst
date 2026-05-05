import Link from "next/link";

// Rendered in place of the equity overlay when the EJScreen ingest hasn't
// run for this geography yet. Honest about the gap rather than showing
// empty population-share tiles that read as broken data.
export function EquityStub({
  geographyLabel,
  population,
  scopeLabel,
}: {
  geographyLabel: string;
  population: number;
  scopeLabel: string; // "Statewide", "County", "Around this facility", etc.
}) {
  return (
    <section className="section" id="equity">
      <div className="wrap">
        <div className="eyebrow">Equity context</div>
        <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 16px" }}>
          {scopeLabel} population characteristics
        </h2>
        <div
          style={{
            background: "var(--graphite)",
            border: "1px solid var(--line-2)",
            borderRadius: 10,
            padding: "24px 28px",
            maxWidth: "70ch",
          }}
        >
          <p className="meta-mono" style={{ color: "var(--amber)", fontSize: 11, letterSpacing: "0.08em", marginBottom: 12 }}>
            EQUITY INGEST PENDING FOR THIS GEOGRAPHY
          </p>
          <p style={{ margin: "0 0 12px", color: "var(--fg-2)" }}>
            {geographyLabel}{population > 0 ? <> · <strong>{population.toLocaleString()}</strong> residents</> : null}.
          </p>
          <p style={{ margin: 0, color: "var(--fg-3)", fontSize: 13.5 }}>
            Demographic shares, national-percentile rankings (PM2.5, ozone, NO₂, diesel particulate, lead-paint risk, NPL/RMP/TSDF/NPDES proximity, drinking-water non-compliance), and EJ disparity scores will render here once the EJScreen-clone ingest completes for this geography.{" "}
            <Link href="/methodology#equity">Why this section matters →</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
