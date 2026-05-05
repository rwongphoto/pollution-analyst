// Server-component helpers to read the per-page JSON artifacts that the
// pipeline writes to ../data/published/. Called inside async page
// components — Next.js bakes the result into the static build.
//
// process.cwd() is the frontend/ directory during `next build` and `next dev`,
// so we walk up one level to the repo root where data/ lives.

import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  CityHubPayload,
  CountyPagePayload,
  FacilityPagePayload,
  HomePagePayload,
  StatePagePayload,
  WaterUtilityPayload,
} from "./types";

const DATA_ROOT = path.join(process.cwd(), "..", "data", "published");

async function readJson<T>(relPath: string): Promise<T> {
  const raw = await fs.readFile(path.join(DATA_ROOT, relPath), "utf8");
  return JSON.parse(raw) as T;
}

export async function loadHome(): Promise<HomePagePayload> {
  return readJson<HomePagePayload>("home.json");
}

export async function loadFacility(state: string, slug: string): Promise<FacilityPagePayload> {
  return readJson<FacilityPagePayload>(`facility/${state}/${slug}.json`);
}

export async function loadWaterUtility(state: string, slug: string): Promise<WaterUtilityPayload> {
  return readJson<WaterUtilityPayload>(`water/${state}/${slug}.json`);
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

export async function listStateSlugs(): Promise<{ state: string }[]> {
  const root = path.join(DATA_ROOT, "state");
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
  return listEntitySlugs(path.join(DATA_ROOT, "facility"));
}

export async function listWaterSlugs(): Promise<{ state: string; slug: string }[]> {
  return listEntitySlugs(path.join(DATA_ROOT, "water"));
}

export async function listCitySlugs(): Promise<{ state: string; slug: string }[]> {
  return listEntitySlugs(path.join(DATA_ROOT, "city"));
}

export async function listCountySlugs(): Promise<{ state: string; slug: string }[]> {
  return listEntitySlugs(path.join(DATA_ROOT, "county"));
}

async function listEntitySlugs(root: string): Promise<{ state: string; slug: string }[]> {
  const out: { state: string; slug: string }[] = [];
  let states: string[] = [];
  try {
    states = await fs.readdir(root);
  } catch {
    return out;
  }
  for (const state of states) {
    const stateDir = path.join(root, state);
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
