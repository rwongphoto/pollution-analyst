// Magnitude / direction language tables for pollution data, used across
// facility, water, and county pages. Voice rule: plain English, concrete
// numbers, no jargon ("ppb", "TRI Form R") in customer-facing summary copy.
// Per the plan's "Prose Strategy at Scale" section, this is a deterministic
// template library — no LLM in the loop for the POC.

export function pctSigned(n: number | null | undefined): string {
  if (n == null) return "—";
  const prefix = n > 0 ? "+" : "";
  return `${prefix}${n.toFixed(0)}%`;
}

export function poundsFormat(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M lb`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k lb`;
  return `${n.toFixed(0)} lb`;
}

// "+12%" → "rose modestly"; "+250%" → "more than tripled". Mirrors the
// crime site's sigma-to-language mapping but tuned for pollution magnitudes
// (which are routinely ±100% YoY at the facility level).
export function magnitudeLanguage(pctChange: number | null | undefined): string {
  if (pctChange == null) return "held roughly steady";
  const abs = Math.abs(pctChange);
  const dir = pctChange >= 0 ? "rose" : "fell";
  if (abs < 5) return "held roughly steady";
  if (abs < 15) return `${dir} modestly`;
  if (abs < 35) return `${dir} meaningfully`;
  if (abs < 75) return `${dir} sharply`;
  if (abs < 200) return `${dir === "rose" ? "more than doubled" : "more than halved"}`;
  if (abs < 400) return `${dir === "rose" ? "more than tripled" : "fell more than three-fold"}`;
  return `${dir === "rose" ? "rose by an order of magnitude" : "fell by an order of magnitude"}`;
}

// Long-arc improvement language. e.g. "ozone here is half what it was in
// 1995" — keyed to the sign of the change relative to a baseline year.
export function longArcLanguage(
  pctChange: number | null | undefined,
  pollutant: string,
  baselineYear: number,
): string {
  // Null path covers both "no multi-year history yet" and the case where
  // the geography's current value is below the operationally-meaningful
  // floor (so a percent-change framing would misrepresent noise as trend).
  if (pctChange == null) return `${pollutant} volumes here are too small to anchor a multi-year trend; YoY movement is still shown above.`;
  const abs = Math.abs(pctChange);
  if (abs < 10) return `${pollutant} concentrations are roughly unchanged from ${baselineYear}.`;
  if (pctChange < 0) {
    if (abs >= 50) return `${pollutant} concentrations have more than halved since ${baselineYear}.`;
    return `${pollutant} concentrations have fallen ${abs.toFixed(0)}% since ${baselineYear}.`;
  }
  if (abs >= 100) return `${pollutant} concentrations have more than doubled since ${baselineYear}.`;
  return `${pollutant} concentrations are up ${abs.toFixed(0)}% since ${baselineYear}.`;
}

export function chipColorForChange(pctChange: number | null | undefined): "high" | "low" | "mid" | "ink" {
  if (pctChange == null) return "ink";
  if (pctChange <= -25) return "high"; // big drop = good for pollution
  if (pctChange <= -5) return "high";
  if (pctChange >= 25) return "low";   // big rise = bad
  if (pctChange >= 5) return "low";
  return "mid";
}

export function severityLabel(s: "health_based" | "monitoring" | "other"): string {
  if (s === "health_based") return "HEALTH-BASED";
  if (s === "monitoring") return "MONITORING";
  return "OTHER";
}

export function severityClass(s: "health_based" | "monitoring" | "other"): string {
  if (s === "health_based") return "chip low";
  if (s === "monitoring") return "chip mid";
  return "chip ink";
}

// True when the equity overlay is an "ingest pending" placeholder — used by
// page templates to render a banner instead of empty cards. Detected by the
// source-string convention written by pipeline/src/publish/site.py.
export function isEquityStub(equity: {
  source: string;
  ej_indexes: { label: string }[];
  disparity_scores?: { label: string; score: number }[];
  pct_low_income?: number | null;
}): boolean {
  if (!equity) return true;
  if (equity.source.toLowerCase().includes("pending")) return true;
  // Real equity: at least one of (ej_indexes, disparity_scores, demographic shares) populated
  const hasEjScreenIndexes = equity.ej_indexes.length > 0;
  const hasDisparity = (equity.disparity_scores?.length ?? 0) > 0;
  const hasDemo = equity.pct_low_income != null;
  return !hasEjScreenIndexes && !hasDisparity && !hasDemo;
}

// Plain-language framing for an EJ disparity score. EPA's disparity-score
// methodology centers on 100 (population-weighted reference). Higher = more
// burden, lower = less. ~150+ is widely considered notable; 200+ severe.
export function disparityLanguage(score: number): string {
  if (score >= 200) return "severely above the reference burden";
  if (score >= 150) return "well above the reference burden";
  if (score >= 110) return "moderately above the reference";
  if (score >= 90)  return "near the reference";
  if (score >= 50)  return "below the reference";
  return "well below the reference";
}

// EJScreen percentile thresholds for narrative framing. EPA's own guidance
// flags 80th percentile as "high" — we mirror that to stay defensible.
export function equityIndexLanguage(pctUs: number): string {
  if (pctUs >= 95) return "in the highest 5% nationally";
  if (pctUs >= 90) return "in the highest 10% nationally";
  if (pctUs >= 80) return "in the highest 20% nationally";
  if (pctUs >= 60) return "above the national median";
  if (pctUs >= 40) return "near the national median";
  return "below the national median";
}
