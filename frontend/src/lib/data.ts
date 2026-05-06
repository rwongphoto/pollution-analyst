// Server-component helpers to read the per-page JSON artifacts that the
// pipeline writes to ../data/published/. Called inside async page
// components — Next.js bakes the result into the static build.
//
// process.cwd() is the frontend/ directory during `next build` and `next dev`,
// so we walk up one level to the repo root where data/ lives.

import { promises as fs } from "node:fs";

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

// String-concat instead of `path.join(process.cwd(), "..", "data", "published")`.
// Turbopack recognizes the path.join form as a resolvable literal prefix and
// reports the entire data/published tree (~15K JSON, 60K+ context-module
// matches) as bundleable, which produces the "Overly broad patterns" warnings
// at lib/data.ts:22 and :25. `+` concatenation isn't analyzed as a path build,
// so the read stays a true runtime fs operation.
function dataPath(...segments: string[]): string {
  let p = process.cwd() + "/../data/published";
  for (const s of segments) p += "/" + s;
  return p;
}

async function readJson<T>(relPath: string): Promise<T> {
  const raw = await fs.readFile(dataPath(relPath), "utf8");
  return JSON.parse(raw) as T;
}

export async function loadHome(): Promise<HomePagePayload> {
  return readJson<HomePagePayload>("home.json");
}

export async function loadRankings(): Promise<RankingsPayload> {
  return readJson<RankingsPayload>("rankings.json");
}

export async function loadFacility(state: string, slug: string): Promise<FacilityPagePayload> {
  return readJson<FacilityPagePayload>(`facility/${state}/${slug}.json`);
}

export async function loadWaterUtility(state: string, slug: string): Promise<WaterUtilityPayload> {
  return readJson<WaterUtilityPayload>(`water/${state}/${slug}.json`);
}

export async function loadSuperfund(state: string, slug: string): Promise<SuperfundPayload> {
  return readJson<SuperfundPayload>(`superfund/${state}/${slug}.json`);
}

export async function loadCityHub(state: string, slug: string): Promise<CityHubPayload> {
  return readJson<CityHubPayload>(`city/${state}/${slug}.json`);
}

export async function loadCounty(state: string, slug: string): Promise<CountyPagePayload> {
  return readJson<CountyPagePayload>(`county/${state}/${slug}.json`);
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
