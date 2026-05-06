// Lucide-style 1.5px-stroke icons, ported verbatim from the design's site-shared.jsx.
// Each Ic.* takes an optional `s` (size) prop. All icons are decorative — they
// always sit next to text labels — so they ship aria-hidden + focusable="false"
// to stay out of the accessibility tree and tab order.

type Props = { s?: number };

const SVG_BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.5",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

export const Ic = {
  search: ({ s = 18 }: Props) => (
    <svg width={s} height={s} {...SVG_BASE}>
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </svg>
  ),
  arrow: ({ s = 16 }: Props) => (
    <svg width={s} height={s} {...SVG_BASE}>
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  ),
  ext: ({ s = 13 }: Props) => (
    <svg width={s} height={s} {...SVG_BASE}>
      <path d="M14 3h7v7" /><path d="M21 3 10 14" />
    </svg>
  ),
  trend: ({ s = 22 }: Props) => (
    <svg width={s} height={s} {...SVG_BASE}>
      <path d="M3 3v18h18" /><path d="m7 15 4-4 4 4 5-5" />
    </svg>
  ),
  shield: ({ s = 22 }: Props) => (
    <svg width={s} height={s} {...SVG_BASE}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  layers: ({ s = 22 }: Props) => (
    <svg width={s} height={s} {...SVG_BASE}>
      <path d="m12 2 10 5-10 5L2 7l10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" />
    </svg>
  ),
  doc: ({ s = 22 }: Props) => (
    <svg width={s} height={s} {...SVG_BASE}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
    </svg>
  ),
  download: ({ s = 14 }: Props) => (
    <svg width={s} height={s} {...SVG_BASE}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" />
    </svg>
  ),
};
