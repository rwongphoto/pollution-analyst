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
  { slug: "ak", abbr: "AK", name: "Alaska", region: "Pacific" },
  { slug: "al", abbr: "AL", name: "Alabama", region: "South" },
  { slug: "ar", abbr: "AR", name: "Arkansas", region: "South" },
  { slug: "az", abbr: "AZ", name: "Arizona", region: "Southwest" },
  { slug: "ca", abbr: "CA", name: "California", region: "Pacific" },
  { slug: "co", abbr: "CO", name: "Colorado", region: "Rocky Mountain" },
  { slug: "ct", abbr: "CT", name: "Connecticut", region: "Northeast" },
  { slug: "de", abbr: "DE", name: "Delaware", region: "Northeast" },
  { slug: "fl", abbr: "FL", name: "Florida", region: "South" },
  { slug: "ga", abbr: "GA", name: "Georgia", region: "South" },
  { slug: "hi", abbr: "HI", name: "Hawaii", region: "Pacific" },
  { slug: "id", abbr: "ID", name: "Idaho", region: "Rocky Mountain" },
  { slug: "ky", abbr: "KY", name: "Kentucky", region: "South" },
  { slug: "la", abbr: "LA", name: "Louisiana", region: "South" },
  { slug: "ma", abbr: "MA", name: "Massachusetts", region: "Northeast" },
  { slug: "md", abbr: "MD", name: "Maryland", region: "Northeast" },
  { slug: "me", abbr: "ME", name: "Maine", region: "Northeast" },
  { slug: "ms", abbr: "MS", name: "Mississippi", region: "South" },
  { slug: "mt", abbr: "MT", name: "Montana", region: "Rocky Mountain" },
  { slug: "nd", abbr: "ND", name: "North Dakota", region: "Rocky Mountain" },
  { slug: "nh", abbr: "NH", name: "New Hampshire", region: "Northeast" },
  { slug: "nj", abbr: "NJ", name: "New Jersey", region: "Northeast" },
  { slug: "nm", abbr: "NM", name: "New Mexico", region: "Southwest" },
  { slug: "nv", abbr: "NV", name: "Nevada", region: "Rocky Mountain" },
  { slug: "ny", abbr: "NY", name: "New York", region: "Northeast" },
  { slug: "ok", abbr: "OK", name: "Oklahoma", region: "Southwest" },
  { slug: "or", abbr: "OR", name: "Oregon", region: "Pacific" },
  { slug: "pa", abbr: "PA", name: "Pennsylvania", region: "Northeast" },
  { slug: "ri", abbr: "RI", name: "Rhode Island", region: "Northeast" },
  { slug: "sd", abbr: "SD", name: "South Dakota", region: "Rocky Mountain" },
  { slug: "tx", abbr: "TX", name: "Texas", region: "Southwest" },
  { slug: "ut", abbr: "UT", name: "Utah", region: "Rocky Mountain" },
  { slug: "va", abbr: "VA", name: "Virginia", region: "South" },
  { slug: "vt", abbr: "VT", name: "Vermont", region: "Northeast" },
  { slug: "wa", abbr: "WA", name: "Washington", region: "Pacific" },
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
