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
        <div className="eyebrow">Equity context · EJScreen 2024</div>
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
            EJSCREEN INGEST PENDING
          </p>
          <p style={{ margin: "0 0 12px", color: "var(--fg-2)" }}>
            {geographyLabel}{population > 0 ? <> · <strong>{population.toLocaleString()}</strong> residents</> : null}.
          </p>
          <p style={{ margin: 0, color: "var(--fg-3)", fontSize: 13.5 }}>
            Equity-overlay percentiles (low-income share, people-of-color share, EJScreen environmental-justice indexes for cancer risk, respiratory hazard, PM2.5, ozone, and toxic releases) ship in the next pipeline run.{" "}
            <Link href="/methodology#equity">Why this section matters →</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
