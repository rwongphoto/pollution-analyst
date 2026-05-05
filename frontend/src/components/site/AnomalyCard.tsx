import type { Flag, FlagSeverity, FlagType } from "@/lib/types";
import { Sparkline } from "./Sparkline";

// Map flag severity to the CSS visual variant on .anomaly-card. The
// existing classes are spike (red) / drop (green) / rare (amber) — we
// reuse them rather than introducing a new palette.
function variantFor(s: FlagSeverity): "spike" | "drop" | "rare" {
  switch (s) {
    case "regression":
    case "surge":
    case "unresolved":
    case "health_based_recent":
      return "spike";
    case "improvement":
    case "drop":
      return "drop";
    case "health_based_recent5y":
    default:
      return "rare";
  }
}

const SEVERITY_LABEL: Record<FlagSeverity, string> = {
  improvement: "LONG-ARC IMPROVEMENT",
  regression: "LONG-ARC REGRESSION",
  surge: "YEAR-OVER-YEAR SURGE",
  drop: "YEAR-OVER-YEAR DROP",
  unresolved: "UNRESOLVED VIOLATION",
  health_based_recent: "RECENT HEALTH-BASED VIOLATION",
  health_based_recent5y: "HEALTH-BASED · 5-YEAR WINDOW",
};

const TYPE_LABEL: Record<FlagType, string> = {
  long_arc_shift: "LONG-ARC SHIFT",
  release_shift: "RELEASE SHIFT",
  violation_event: "SDWIS VIOLATION",
  ghg_step: "GHG STEP CHANGE",
};

function chipColor(s: FlagSeverity): string {
  switch (s) {
    case "regression":
    case "surge":
    case "unresolved":
    case "health_based_recent":
      return "var(--red)";
    case "health_based_recent5y":
      return "var(--amber)";
    default:
      return "var(--green)";
  }
}

export function AnomalyCard({ flag }: { flag: Flag }) {
  const variant = variantFor(flag.severity);
  const values = flag.history.map((h) => h.value);
  return (
    <article className={`anomaly-card ${variant}`}>
      <div className="head">
        <span className="meta-mono" style={{ color: chipColor(flag.severity), fontSize: 11 }}>
          {SEVERITY_LABEL[flag.severity]} · {TYPE_LABEL[flag.type]}
        </span>
      </div>
      <h3>{flag.label}</h3>
      <p>{flag.summary}</p>
      {values.length > 1 ? (
        <div style={{ marginTop: 14, height: 36 }}>
          <Sparkline values={values} width={400} height={36} color={chipColor(flag.severity)} strokeWidth={1.7} />
        </div>
      ) : null}
      {flag.link ? (
        <p className="meta-mono" style={{ color: "var(--fg-3)", fontSize: 11, marginTop: 12 }}>
          <a href={flag.link.href} target="_blank" rel="noreferrer">
            {flag.link.label} →
          </a>
        </p>
      ) : null}
    </article>
  );
}

// Severity weights for client-side ordering — mirrors pipeline severity_weight().
const SEVERITY_WEIGHT: Record<FlagSeverity, number> = {
  unresolved: 100,
  regression: 80,
  surge: 70,
  health_based_recent: 60,
  health_based_recent5y: 50,
  drop: 30,
  improvement: 20,
};

export function NotableSignals({
  flags,
  title = "Notable signals",
  emptyLabel,
  cap = 4,
}: {
  flags: Flag[];
  title?: string;
  emptyLabel?: string;
  cap?: number;
}) {
  if (flags.length === 0 && !emptyLabel) return null;
  // Sort severity-desc, then by absolute magnitude when present so the
  // visible cap surfaces the most editorial flags.
  const sorted = [...flags].sort((a, b) => {
    const sw = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
    if (sw !== 0) return sw;
    return Math.abs(b.magnitude_pct ?? 0) - Math.abs(a.magnitude_pct ?? 0);
  });
  const visible = sorted.slice(0, cap);
  const hidden = sorted.length - visible.length;
  return (
    <section className="section">
      <div className="wrap">
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow">Anomaly engine</div>
          <h2 className="h-display" style={{ fontSize: "clamp(28px,3vw,40px)", margin: "8px 0 0" }}>
            {title}
          </h2>
        </div>
        {flags.length === 0 ? (
          <p className="muted" style={{ maxWidth: "62ch" }}>
            {emptyLabel}
          </p>
        ) : (
          <>
            <div className="anomaly-strip">
              {visible.map((f, i) => (
                <AnomalyCard key={`${f.type}-${f.label}-${i}`} flag={f} />
              ))}
            </div>
            {hidden > 0 ? (
              <p className="muted" style={{ fontSize: 12.5, marginTop: 18 }}>
                Showing the {cap} most editorially weighted signals out of {flags.length}. Lower-severity signals fold into the chemical breakdown and history charts below.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
