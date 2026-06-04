// Server-component helpers to read the per-page JSON artifacts that the
// pipeline writes to ../data/published/. Called inside async page
// components — Next.js bakes the result into the static build.
//
// process.cwd() is the frontend/ directory during `next build` and `next dev`,
// so we walk up one level to the repo root where data/ lives.

import { existsSync, promises as fs, readFileSync } from "node:fs";

import { notFound } from "next/navigation";

import type {
  CityHubPayload,
  CountyPagePayload,
  FacilityPagePayload,
  HomePagePayload,
  RankingsPayload,
  StatePagePayload,
  SuperfundPayload,
  WaterUtilityPayload,
} from "./types";

// Turbopack 16.2's static analyzer traces dynamic fs paths under data/published
// regardless of how the path is constructed (path.join, +-concat, or this loop
// helper) and emits "Overly broad patterns" warnings. The warnings are
// suppressed via `turbopack.ignoreIssue` in next.config.ts — they don't apply
// to us because `output: 'export'` ships rendered HTML, not a server bundle
// that could over-bundle the JSON tree. Reads here happen at SSG time only.
function dataPath(...segments: string[]): string {
  let p = process.cwd() + "/../data/published";
  for (const s of segments) p += "/" + s;
  return p;
}

async function readJson<T>(relPath: string): Promise<T> {
  const raw = await fs.readFile(dataPath(relPath), "utf8");
  return JSON.parse(raw) as T;
}

// Big-tree CDN base. Defaults to this repo's published data served over GitHub
// raw so prod works even when the env var isn't set (matches bird-analyst).
// Override with NEXT_PUBLIC_DATA_CDN_BASE for staging/branch data.
const CDN = (
  process.env.NEXT_PUBLIC_DATA_CDN_BASE ??
  "https://raw.githubusercontent.com/rwongphoto/pollution-analyst/main/data/published"
).replace(/\/$/, "");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Big per-entity trees (facility/water/city/county/superfund): read from disk
// when present (local dev), otherwise fetch from the CDN at request time. On
// Vercel these subtrees are dropped from the build workspace by prebuild, so the
// fetch path runs in prod. Their pages return [] from generateStaticParams
// (pure on-demand ISR) — never a build-time dependency.
async function bigJson<T>(relPath: string): Promise<T> {
  const local = dataPath(relPath);
  if (existsSync(local)) return JSON.parse(readFileSync(local, "utf8")) as T;
  const url = `${CDN}/${relPath}`;
  // A crawl burst (Screaming Frog, Googlebot) makes raw.githubusercontent
  // throttle cold renders, which would otherwise throw → HTTP 500. Retry
  // transient failures (429 / 5xx / network) with exponential backoff + jitter.
  // A genuine 404 means the combo doesn't exist → render a clean not-found.
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(200 * 2 ** (attempt - 1) + Math.floor(Math.random() * 150));
    let res: Response;
    try {
      res = await fetch(url, { next: { revalidate: 86400 } });
    } catch {
      lastStatus = 0; // network error → retry
      continue;
    }
    if (res.ok) return (await res.json()) as T;
    lastStatus = res.status;
    if (res.status === 404) notFound();
    if (res.status !== 429 && res.status < 500) break; // other 4xx → don't retry
  }
  throw new Error(`fetch ${relPath} → ${lastStatus}`);
}

export async function loadHome(): Promise<HomePagePayload> {
  return readJson<HomePagePayload>("home.json");
}

export type SiteCounts = {
  states: number;
  facility: number;
  water: number;
  city: number;
  county: number;
  superfund: number;
};

// Headline entity counts written by scripts/prebuild.mjs while it walks the
// published tree. Read here (not derived from listing the big trees) because
// those trees are dropped from the build workspace on Vercel before render.
export async function loadSiteCounts(): Promise<SiteCounts> {
  try {
    return await readJson<SiteCounts>("_site-counts.json");
  } catch {
    return { states: 0, facility: 0, water: 0, city: 0, county: 0, superfund: 0 };
  }
}

export async function loadRankings(): Promise<RankingsPayload> {
  return readJson<RankingsPayload>("rankings.json");
}

export async function loadFacility(state: string, slug: string): Promise<FacilityPagePayload> {
  return bigJson<FacilityPagePayload>(`facility/${state}/${slug}.json`);
}

export async function loadWaterUtility(state: string, slug: string): Promise<WaterUtilityPayload> {
  return bigJson<WaterUtilityPayload>(`water/${state}/${slug}.json`);
}

export async function loadSuperfund(state: string, slug: string): Promise<SuperfundPayload> {
  return bigJson<SuperfundPayload>(`superfund/${state}/${slug}.json`);
}

export async function loadCityHub(state: string, slug: string): Promise<CityHubPayload> {
  return bigJson<CityHubPayload>(`city/${state}/${slug}.json`);
}

export async function loadCounty(state: string, slug: string): Promise<CountyPagePayload> {
  return bigJson<CountyPagePayload>(`county/${state}/${slug}.json`);
}

export async function loadState(state: string): Promise<StatePagePayload> {
  return readJson<StatePagePayload>(`state/${state}.json`);
}

export type StateMapSummary = {
  fips: string;            // 2-char e.g. '06'
  slug: string;            // 'ca'
  name: string;            // 'California'
  reporting_year: number;
  facilities_tracked: number;
  total_releases_pounds: number;
  yoy_pct_change: number | null;
  long_arc_pct_change: number | null;
  long_arc_baseline_year: number;
  counties_with_data: number;
};

// State-level summary for every ingested state. Used to power the homepage
// US map's hover panel — keyed by 2-char state FIPS so the map can resolve
// any hovered county to its state without an extra fetch.
export async function loadStateMapSummaries(): Promise<StateMapSummary[]> {
  const root = dataPath("state");
  let files: string[] = [];
  try {
    files = await fs.readdir(root);
  } catch {
    return [];
  }
  const out: StateMapSummary[] = [];
  await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        try {
          const raw = await fs.readFile(root + "/" + f, "utf8");
          const data = JSON.parse(raw) as StatePagePayload;
          out.push({
            fips: data.state.fips,
            slug: data.state.slug,
            name: data.state.name,
            reporting_year: data.reporting_year,
            facilities_tracked: data.totals.facilities_tracked,
            total_releases_pounds: data.totals.total_releases_pounds,
            yoy_pct_change: data.totals.yoy_pct_change,
            long_arc_pct_change: data.totals.long_arc_pct_change,
            long_arc_baseline_year: data.totals.long_arc_baseline_year,
            counties_with_data: data.totals.counties_with_data,
          });
        } catch {
          // skip unreadable / malformed state files
        }
      }),
  );
  return out;
}

export type StateNplCount = {
  slug: string;  // 'nj'
  name: string;  // 'New Jersey'
  npl: number;   // count of NPL sites tracked in this state
};

// Per-state NPL site counts, summed from each state's totals.npl_sites_tracked
// and sorted highest-first. Powers the "Regional Distribution" section on the
// Superfund rankings page (answers "which state has the most Superfund sites").
// State JSONs stay in the build workspace on Vercel (only big per-entity trees
// are dropped), so this disk read is safe at render time.
export async function loadStateNplCounts(): Promise<StateNplCount[]> {
  const root = dataPath("state");
  let files: string[] = [];
  try {
    files = await fs.readdir(root);
  } catch {
    return [];
  }
  const out: StateNplCount[] = [];
  await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        try {
          const raw = await fs.readFile(root + "/" + f, "utf8");
          const data = JSON.parse(raw) as StatePagePayload;
          const npl = data.totals.npl_sites_tracked ?? 0;
          if (npl > 0) {
            out.push({ slug: data.state.slug, name: data.state.name, npl });
          }
        } catch {
          // skip unreadable / malformed state files
        }
      }),
  );
  out.sort((a, b) => b.npl - a.npl);
  return out;
}

export async function loadNationalCountyBurdens(): Promise<
  { fips: string; total_releases_pounds: number }[]
> {
  const root = dataPath("state");
  let files: string[] = [];
  try {
    files = await fs.readdir(root);
  } catch {
    return [];
  }
  const out: { fips: string; total_releases_pounds: number }[] = [];
  await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        try {
          const raw = await fs.readFile(root + "/" + f, "utf8");
          const data = JSON.parse(raw) as StatePagePayload;
          for (const c of data.counties_directory ?? []) {
            if (c.fips && typeof c.total_releases_pounds === "number") {
              out.push({ fips: c.fips, total_releases_pounds: c.total_releases_pounds });
            }
          }
        } catch {
          // skip unreadable / malformed state files
        }
      }),
  );
  return out;
}

export async function listStateSlugs(): Promise<{ state: string }[]> {
  const root = dataPath("state");
  let files: string[] = [];
  try {
    files = await fs.readdir(root);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ state: f.replace(/\.json$/, "") }));
}

export async function listFacilitySlugs(): Promise<{ state: string; slug: string }[]> {
  return listEntitySlugs("facility");
}

export async function listWaterSlugs(): Promise<{ state: string; slug: string }[]> {
  return listEntitySlugs("water");
}

export async function listSuperfundSlugs(): Promise<{ state: string; slug: string }[]> {
  return listEntitySlugs("superfund");
}

export async function listCitySlugs(): Promise<{ state: string; slug: string }[]> {
  return listEntitySlugs("city");
}

export async function listCountySlugs(): Promise<{ state: string; slug: string }[]> {
  return listEntitySlugs("county");
}

async function listEntitySlugs(kind: string): Promise<{ state: string; slug: string }[]> {
  const out: { state: string; slug: string }[] = [];
  const root = dataPath(kind);
  let states: string[] = [];
  try {
    states = await fs.readdir(root);
  } catch {
    return out;
  }
  for (const state of states) {
    const stateDir = root + "/" + state;
    const stat = await fs.stat(stateDir);
    if (!stat.isDirectory()) continue;
    const files = await fs.readdir(stateDir);
    for (const f of files) {
      if (f.endsWith(".json")) {
        out.push({ state, slug: f.replace(/\.json$/, "") });
      }
    }
  }
  return out;
}
