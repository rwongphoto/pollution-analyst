// Types matching the JSON shapes the pipeline writes to ../data/published/.
// Three programmatic surfaces — entity (facility / water utility), place
// (county), neighborhood (deferred). Equity overlay (EJScreen) is a
// first-class section on place + entity templates per the methodology
// inversion from the crime site.

export type PollutantPathway =
  | "criteria_air"
  | "hazardous_air"
  | "ghg"
  | "drinking_water"
  | "tri_release"
  | "tri_air"
  | "tri_water"
  | "tri_land"
  | "pesticide";

export type Direction = "increase" | "decrease" | "flat";

// ---- Annual / monthly time series ----------------------------------------

export interface AnnualPoint {
  year: number;
  value: number; // pounds for TRI; ppm/ppb for water; etc.
}

export interface MonthPoint {
  month: string; // 'YYYY-MM'
  value: number;
}

// ---- Equity overlay (EJScreen rollup) ------------------------------------
// EJScreen indexes are percentile ranks (0-100). Stored verbatim rather than
// re-computed so the methodology page can name the source explicitly.

export interface EquityIndex {
  label: string;        // e.g. "PM2.5 environmental justice index"
  pct_us: number;       // national percentile (0-100)
  pct_state: number | null;
}

export interface EquityOverlay {
  // Population characteristics (from Census ACS at the geography)
  population: number;
  pct_low_income: number | null;
  pct_people_of_color: number | null;
  pct_under_5: number | null;
  pct_over_64: number | null;
  // Legacy EJScreen percentile rankings (kept for shape compatibility).
  // Empty since EPA deprecated the public EJScreen tool in 2025.
  ej_indexes: EquityIndex[];
  // EPA's newer EJ disparity scores per environmental indicator. Higher
  // = greater disparate exposure burden. Sourced from USEPA-clone GitHub
  // mirror (ejamdata bgej.arrow). Empty when EJScreen-replacement ingest
  // hasn't run for this geography yet.
  disparity_scores: { label: string; score: number }[];
  // Source attribution
  source: string;
  geography_label: string;
}

// ---- Tier 1: TRI facility -----------------------------------------------

export interface ChemicalRelease {
  chemical: string;       // friendly name, e.g. "Benzene"
  cas: string;            // e.g. "71-43-2"
  category: "carcinogen" | "pbt" | "neurotoxin" | "respiratory" | "general";
  total_pounds_recent: number; // most-recent reporting year
  history: AnnualPoint[]; // pounds per year
  yoy_pct_change: number | null;
  long_arc_pct_change: number | null; // recent vs first-year
  long_arc_baseline_year: number;
}

export interface FacilityPagePayload {
  facility: {
    state: string;
    state_label: string;
    slug: string;
    name: string;
    parent_company: string | null;
    address: string;
    city: string;
    county: string;
    county_slug: string;
    naics_label: string;
    lat: number;
    lng: number;
  };
  reporting_year: number;
  briefing_label: string; // e.g. "TRI 2023 reporting year"
  totals: {
    total_releases_pounds: number;
    air_releases_pounds: number;
    water_releases_pounds: number;
    land_releases_pounds: number;
    chemicals_reported: number;
    yoy_pct_change: number | null;
    long_arc_pct_change: number | null;
    long_arc_baseline_year: number;
    history: AnnualPoint[]; // facility-total pounds per year, full multi-year span
  };
  chemicals: ChemicalRelease[]; // sorted by total_pounds_recent desc
  equity: EquityOverlay;
  source: {
    label: string;        // "EPA Toxics Release Inventory"
    url: string;
    retrieved: string;    // ISO date
  };
  _published_at?: string;
}

// ---- Tier 1: SDWIS water utility ----------------------------------------

export type ViolationSeverity = "health_based" | "monitoring" | "other";

export interface WaterViolation {
  year: number;
  contaminant: string;
  contaminant_code: string;
  severity: ViolationSeverity;
  rule: string;            // e.g. "Lead and Copper Rule"
  is_unresolved: boolean;
  description: string;
}

export interface WaterUtilityPayload {
  utility: {
    state: string;
    state_label: string;
    slug: string;
    name: string;            // PWS name
    pwsid: string;
    population_served: number;
    primary_source: "groundwater" | "surface_water" | "purchased" | "mixed";
    cities_served: string[];
  };
  reporting_period: { start: string; end: string }; // ISO dates
  briefing_label: string;
  totals: {
    violations_5yr: number;
    health_based_violations_5yr: number;
    unresolved_violations: number;
    contaminants_with_violations: number;
    years_since_last_violation: number | null;
  };
  violations: WaterViolation[]; // most recent first
  metrics?: {
    violations_history: AnnualPoint[]; // counts of all violations per year
    health_based_history: AnnualPoint[]; // counts of health-based per year
    top_contaminants: { contaminant: string; count: number }[];
  };
  equity: EquityOverlay;
  source: {
    label: string;
    url: string;
    retrieved: string;
  };
  _published_at?: string;
}

// ---- Tier 2: County place page ------------------------------------------

export interface FacilitySummary {
  slug: string;
  state: string;
  state_label: string;
  name: string;
  parent_company: string | null;
  total_pounds_recent: number;
  yoy_pct_change: number | null;
  top_chemical: string;
  city: string;
}

export interface UtilitySummary {
  slug: string;
  state: string;
  state_label: string;
  name: string;
  pwsid: string;
  population_served: number;
  health_based_violations_5yr: number;
  unresolved: boolean;
}

export interface PollutantSummary {
  pathway: PollutantPathway;
  label: string;
  current: number;          // most-recent value (units depend on pathway)
  units: string;
  yoy_pct_change: number | null;
  long_arc_pct_change: number | null;
  baseline_year: number;
  history: AnnualPoint[];   // up to 24 years for sparkline
}

export interface CountyPagePayload {
  county: {
    state: string;
    state_label: string;
    slug: string;
    name: string;            // e.g. "Harris County"
    fips: string;            // e.g. "48201"
    population: number;
  };
  reporting_year: number;
  briefing_label: string;
  pathways: PollutantSummary[]; // 3-5 top-level pollutants
  facilities: FacilitySummary[]; // top TRI facilities by pounds
  utilities: UtilitySummary[];   // water utilities serving the county
  equity: EquityOverlay;
  sources: {
    label: string;
    url: string;
    retrieved: string;
  }[];
  _published_at?: string;
}

// ---- Tier 2: State place page -------------------------------------------

export interface CountySummary {
  slug: string;
  state: string;
  state_label: string;
  name: string;
  fips: string;
  population: number;
  facilities_count: number;
  total_releases_pounds: number;
  yoy_pct_change: number | null;
  top_chemical: string;
}

export interface StatePagePayload {
  state: {
    slug: string;            // 'tx'
    name: string;            // 'Texas'
    fips: string;            // '48'
    population: number;
    counties_total: number;  // 254 for TX
  };
  reporting_year: number;
  briefing_label: string;
  totals: {
    facilities_tracked: number;
    utilities_tracked: number;
    counties_with_data: number;
    total_releases_pounds: number;
    yoy_pct_change: number | null;
    long_arc_pct_change: number | null;
    long_arc_baseline_year: number;
  };
  pathways: PollutantSummary[]; // state-level rollups for top 3-4 pathways
  top_counties: CountySummary[];
  // Full alphabetical county list for the bottom-of-page directory (SEO).
  // Counties with no TRI data are excluded — only published-page counties.
  counties_directory: { slug: string; name: string; facilities_count: number }[];
  top_facilities: FacilitySummary[];
  top_utilities: UtilitySummary[];
  equity: EquityOverlay;
  sources: { label: string; url: string; retrieved: string }[];
  _published_at?: string;
}

// ---- Home page ----------------------------------------------------------

export interface FeaturedEntity {
  kind: "facility" | "city" | "county";
  state: string;
  slug: string;
  name: string;
  state_label: string;
  headline: string;        // one-line lede
  metric_label: string;
  metric_value: string;
  trend_24mo?: number[];
}

export interface HomePagePayload {
  reporting_year: number;
  briefing_label: string;
  totals: {
    facilities_tracked: number;
    utilities_tracked: number;
    counties_covered: number;
    chemicals_indexed: number;
  };
  featured: FeaturedEntity[]; // 3 featured cards
  _published_at?: string;
}
