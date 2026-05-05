// Tiny inline-SVG sparkline. Takes any numeric array and draws a smooth path.
// Optionally renders start/end year labels at the bottom corners when
// ``years`` is supplied — gives multi-decade trend lines explicit time
// context without needing a separate caption.

type Props = {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
  // When provided, renders the first and last year as small text labels
  // at the bottom corners of the SVG. Plot area is reduced by 12px to
  // make room — pass a height >= 36 for a comfortable result.
  years?: number[];
};

export function Sparkline({
  values,
  width = 80,
  height = 22,
  color = "var(--fg-3)",
  strokeWidth = 1.5,
  className,
  years,
}: Props) {
  if (!values.length) {
    return <svg width={width} height={height} className={className} />;
  }
  const showLabels = years != null && years.length >= 2 && height >= 30;
  const labelH = showLabels ? 12 : 0;
  const plotH = height - labelH;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = plotH - ((v - min) / range) * (plotH - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" L ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} style={{ display: "block" }}>
      <path d={`M ${points}`} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      {showLabels && (
        <>
          <text x={0} y={height - 2} fontSize="9" fill="var(--fg-4)" fontFamily="var(--font-mono)">
            {years![0]}
          </text>
          <text x={width} y={height - 2} fontSize="9" fill="var(--fg-4)" fontFamily="var(--font-mono)" textAnchor="end">
            {years![years!.length - 1]}
          </text>
        </>
      )}
    </svg>
  );
}
