// TS mirror of pipeline/src/states.py — kept in sync manually when a state is
// added to the Python registry. Used by SiteHeader / SiteFooter to render
// per-state nav links without reading the filesystem at request time.

export type LiveState = {
  slug: string;
  abbr: string;
  name: string;
};

export const LIVE_STATES: LiveState[] = [
  { slug: "ca", abbr: "CA", name: "California" },
  { slug: "de", abbr: "DE", name: "Delaware" },
  { slug: "me", abbr: "ME", name: "Maine" },
  { slug: "nh", abbr: "NH", name: "New Hampshire" },
  { slug: "ri", abbr: "RI", name: "Rhode Island" },
  { slug: "tx", abbr: "TX", name: "Texas" },
  { slug: "vt", abbr: "VT", name: "Vermont" },
];
