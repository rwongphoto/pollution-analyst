// TS mirror of pipeline/src/states.py — kept in sync manually when a state is
// added to the Python registry. Used by SiteHeader / SiteFooter to render
// per-state nav links without reading the filesystem at request time.

export type Region =
  | "Pacific"
  | "Southwest"
  | "Rocky Mountain"
  | "Midwest"
  | "South"
  | "Northeast";

export type LiveState = {
  slug: string;
  abbr: string;
  name: string;
  region: Region;
};

// Display order for the States mega-nav (west → east).
export const REGION_ORDER: readonly Region[] = [
  "Pacific",
  "Southwest",
  "Rocky Mountain",
  "Midwest",
  "South",
  "Northeast",
];

export const LIVE_STATES: LiveState[] = [
  { slug: "ar", abbr: "AR", name: "Arkansas", region: "South" },
  { slug: "az", abbr: "AZ", name: "Arizona", region: "Southwest" },
  { slug: "ca", abbr: "CA", name: "California", region: "Pacific" },
  { slug: "ct", abbr: "CT", name: "Connecticut", region: "Northeast" },
  { slug: "de", abbr: "DE", name: "Delaware", region: "Northeast" },
  { slug: "hi", abbr: "HI", name: "Hawaii", region: "Pacific" },
  { slug: "ma", abbr: "MA", name: "Massachusetts", region: "Northeast" },
  { slug: "md", abbr: "MD", name: "Maryland", region: "Northeast" },
  { slug: "me", abbr: "ME", name: "Maine", region: "Northeast" },
  { slug: "mt", abbr: "MT", name: "Montana", region: "Rocky Mountain" },
  { slug: "nd", abbr: "ND", name: "North Dakota", region: "Rocky Mountain" },
  { slug: "nh", abbr: "NH", name: "New Hampshire", region: "Northeast" },
  { slug: "nm", abbr: "NM", name: "New Mexico", region: "Southwest" },
  { slug: "nv", abbr: "NV", name: "Nevada", region: "Rocky Mountain" },
  { slug: "ok", abbr: "OK", name: "Oklahoma", region: "Southwest" },
  { slug: "ri", abbr: "RI", name: "Rhode Island", region: "Northeast" },
  { slug: "sd", abbr: "SD", name: "South Dakota", region: "Rocky Mountain" },
  { slug: "tx", abbr: "TX", name: "Texas", region: "Southwest" },
  { slug: "ut", abbr: "UT", name: "Utah", region: "Rocky Mountain" },
  { slug: "vt", abbr: "VT", name: "Vermont", region: "Northeast" },
  { slug: "wv", abbr: "WV", name: "West Virginia", region: "South" },
  { slug: "wy", abbr: "WY", name: "Wyoming", region: "Rocky Mountain" },
];

// Regions in REGION_ORDER, omitting any with no live states. Each region's
// states are sorted by name so the column reads alphabetically.
export const LIVE_STATES_BY_REGION: { region: Region; states: LiveState[] }[] =
  REGION_ORDER.flatMap((region) => {
    const states = LIVE_STATES.filter((s) => s.region === region).sort(
      (a, b) => a.name.localeCompare(b.name),
    );
    return states.length ? [{ region, states }] : [];
  });
