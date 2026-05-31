// Resolve city/county hub links from the free-text place names carried in
// facility / city / related-place payloads. Pages don't get a canonical slug
// for these references, so historically they slugified the name inline and
// linked unconditionally — producing 404s when (a) the name slugified to
// something other than the published hub's slug, or (b) no hub exists for that
// place at all. These helpers gate every link on the set of slugs the pipeline
// actually published (emitted by scripts/prebuild.mjs as _place-slugs.json):
// resolve to the real hub when one exists, otherwise return null so the caller
// renders plain text instead of a dead link.
import { promises as fs } from "node:fs";

// Mirrors the pipeline's `slugify` (pipeline/src/_slug.py) exactly so derived
// slugs match published ones (the old countySlugFromName only replaced
// whitespace, so apostrophes etc. diverged).
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Mirrors `_COUNTY_SUFFIXES_LOWER` / `_strip_county_suffix` in
// pipeline/src/publish/site.py. Order matters: "city and borough" before
// "borough".
const COUNTY_SUFFIXES = [
  " city and borough",
  " borough",
  " parish",
  " census area",
  " municipality",
  " municipio",
  " county",
];

export function stripCountySuffix(name: string): string {
  const low = name.toLowerCase();
  for (const suffix of COUNTY_SUFFIXES) {
    if (low.endsWith(suffix)) return name.slice(0, -suffix.length).trimEnd();
  }
  return name;
}

// Census-name abbreviations: a place's free-text name ("Saint Pauls") can differ
// from the TIGER place name the hub was published under ("St. Pauls"). Map the
// common prefixes so those legitimate links resolve instead of being dropped.
function abbreviate(slug: string): string {
  for (const [from, to] of [
    ["saint-", "st-"],
    ["mount-", "mt-"],
    ["fort-", "ft-"],
  ] as const) {
    if (slug.startsWith(from)) return to + slug.slice(from.length);
  }
  return slug;
}

type PlaceSlugIndex = { city: Record<string, string[]>; county: Record<string, string[]> };
export type PlaceSlugs = { city: Map<string, Set<string>>; county: Map<string, Set<string>> };

const dataPath = (rel: string) => `${process.cwd()}/../data/published/${rel}`;

let cache: PlaceSlugs | null = null;

// Loaded once per function instance from the bundled _place-slugs.json.
export async function loadPlaceSlugs(): Promise<PlaceSlugs> {
  if (cache) return cache;
  const empty: PlaceSlugs = { city: new Map(), county: new Map() };
  let raw: PlaceSlugIndex;
  try {
    raw = JSON.parse(await fs.readFile(dataPath("_place-slugs.json"), "utf8")) as PlaceSlugIndex;
  } catch {
    cache = empty;
    return empty;
  }
  const toMap = (rec: Record<string, string[]>) =>
    new Map(Object.entries(rec ?? {}).map(([st, slugs]) => [st, new Set(slugs)]));
  cache = { city: toMap(raw.city), county: toMap(raw.county) };
  return cache;
}

function resolve(set: Set<string> | undefined, base: string): string | null {
  if (!set) return null;
  if (set.has(base)) return base;
  const ab = abbreviate(base);
  if (ab !== base && set.has(ab)) return ab;
  return null;
}

// Returns the city hub path if a hub exists for this name, else null.
export function cityHref(slugs: PlaceSlugs, state: string, name: string | null | undefined): string | null {
  if (!name) return null;
  const slug = resolve(slugs.city.get(state), slugify(name));
  return slug ? `/state/${state}/city/${slug}` : null;
}

// Returns the county hub path if a hub exists for this name, else null.
export function countyHref(slugs: PlaceSlugs, state: string, name: string | null | undefined): string | null {
  if (!name) return null;
  const slug = resolve(slugs.county.get(state), slugify(stripCountySuffix(name)));
  return slug ? `/state/${state}/county/${slug}` : null;
}
