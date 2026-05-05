// Tiny inline-SVG sparkline. Takes any numeric array and draws a smooth path.
// Intentionally no axes / labels — context comes from the surrounding tile.

type Props = {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
};

export function Sparkline({
  values,
  width = 80,
  height = 22,
  color = "var(--fg-3)",
  strokeWidth = 1.5,
  className,
}: Props) {
  if (!values.length) {
    return <svg width={width} height={height} className={className} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" L ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} style={{ display: "block" }}>
      <path d={`M ${points}`} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
