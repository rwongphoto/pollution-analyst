import { Sparkline } from "./Sparkline";

// Large multi-year bar chart for the hero of state / county / facility pages.
// Shows annual values as bars with year labels along the x-axis. Highlights
// the most-recent year. Pure inline SVG — no charting lib, no client JS.

type Pt = { year: number; value: number };

export function HeroChart({
  history,
  units = "lb",
  color = "var(--blue)",
  height = 160,
}: {
  history: Pt[];
  units?: string;
  color?: string;
  height?: number;
}) {
  if (!history || history.length === 0) {
    return null;
  }
  if (history.length < 2) {
    // Single point — fall back to a flat sparkline so the design doesn't break
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-3)", fontSize: 13 }}>
        Multi-year history not yet ingested.
      </div>
    );
  }

  const sorted = [...history].sort((a, b) => a.year - b.year);
  const max = Math.max(...sorted.map((p) => p.value));
  const min = 0;
  const range = max - min || 1;

  const padTop = 22;
  const padBottom = 28;
  const padLeft = 4;
  const padRight = 4;
  const innerH = height - padTop - padBottom;
  const widthPerBar = 40;
  const barGap = 6;
  const barW = widthPerBar - barGap;
  const totalW = padLeft + padRight + sorted.length * widthPerBar;

  const firstYear = sorted[0].year;
  const lastYear = sorted[sorted.length - 1].year;
  const lastValue = sorted[sorted.length - 1].value;
  const ariaLabel =
    `Bar chart of annual values from ${firstYear} to ${lastYear}, in ${units}. ` +
    `Most recent year (${lastYear}): ${formatValue(lastValue, units)}.`;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        width={totalW}
        height={height}
        viewBox={`0 0 ${totalW} ${height}`}
        style={{ display: "block" }}
        role="img"
        aria-label={ariaLabel}
      >
        <title>{ariaLabel}</title>
        {/* y-axis max label */}
        <text x={padLeft} y={padTop - 8} fontSize={10} fontFamily="var(--font-mono)" fill="var(--fg-4)">
          {formatValue(max, units)}
        </text>
        {/* baseline */}
        <line
          x1={padLeft}
          x2={totalW - padRight}
          y1={padTop + innerH}
          y2={padTop + innerH}
          stroke="var(--line)"
          strokeWidth={1}
        />
        {sorted.map((p, i) => {
          const x = padLeft + i * widthPerBar;
          const h = ((p.value - min) / range) * innerH;
          const y = padTop + innerH - h;
          const isLatest = i === sorted.length - 1;
          return (
            <g key={p.year}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 1)}
                fill={isLatest ? color : "var(--fg-4)"}
                opacity={isLatest ? 0.95 : 0.55}
              />
              {(i === 0 || i === sorted.length - 1 || sorted.length <= 8 || i % 2 === 0) && (
                <text
                  x={x + barW / 2}
                  y={padTop + innerH + 14}
                  fontSize={10}
                  fontFamily="var(--font-mono)"
                  fill={isLatest ? "var(--fg-2)" : "var(--fg-4)"}
                  textAnchor="middle"
                >
                  {`'${String(p.year).slice(2)}`}
                </text>
              )}
            </g>
          );
        })}
        {/* most-recent value annotation */}
        {(() => {
          const last = sorted[sorted.length - 1];
          const i = sorted.length - 1;
          const h = ((last.value - min) / range) * innerH;
          const y = padTop + innerH - h;
          const x = padLeft + i * widthPerBar + barW / 2;
          return (
            <text
              x={x}
              y={Math.max(y - 6, 12)}
              fontSize={10}
              fontFamily="var(--font-mono)"
              fill={color}
              textAnchor="middle"
              fontWeight={600}
            >
              {formatValue(last.value, units)}
            </text>
          );
        })()}
      </svg>
    </div>
  );
}

function formatValue(v: number, units: string): string {
  if (units === "lb") {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
    return `${v.toFixed(0)}`;
  }
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M ${units}`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k ${units}`;
  return `${v.toFixed(0)} ${units}`;
}

// Air/water/land split bar — proportional rectangle showing share of releases
// across the three on-site media + off-site. Used in hero asides.
export function MediaSplitBar({
  air,
  water,
  land,
}: {
  air: number;
  water: number;
  land: number;
}) {
  const total = air + water + land;
  if (total <= 0) return null;
  const aPct = (air / total) * 100;
  const wPct = (water / total) * 100;
  const lPct = (land / total) * 100;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", height: 12, borderRadius: 3, overflow: "hidden", background: "var(--bg-3)", border: "1px solid var(--line)" }}>
        {aPct > 0 && <span title={`Air ${aPct.toFixed(0)}%`} style={{ width: `${aPct}%`, background: "var(--blue)" }} />}
        {wPct > 0 && <span title={`Water ${wPct.toFixed(0)}%`} style={{ width: `${wPct}%`, background: "var(--cyan)" }} />}
        {lPct > 0 && <span title={`Land ${lPct.toFixed(0)}%`} style={{ width: `${lPct}%`, background: "var(--amber)" }} />}
      </div>
      <div className="meta-mono" style={{ fontSize: 10, color: "var(--fg-3)", display: "flex", justifyContent: "space-between" }}>
        <span><span style={{ color: "var(--blue)" }}>■</span> AIR {aPct.toFixed(0)}%</span>
        <span><span style={{ color: "var(--cyan)" }}>■</span> WATER {wPct.toFixed(0)}%</span>
        <span><span style={{ color: "var(--amber)" }}>■</span> LAND/OFF-SITE {lPct.toFixed(0)}%</span>
      </div>
    </div>
  );
}
// Re-export Sparkline so consumers can pull both from one module.
export { Sparkline };
