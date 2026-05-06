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

// ---- Anomaly engine flags ------------------------------------------------
// Mirrors pipeline/src/flags/types.py. Emitted between aggregate and publish;
// rendered as <AnomalyCard> in a "Notable signals" section on each template.

export type FlagType =
  | "long_arc_shift"
  | "release_shift"
  | "violation_event"
  | "ghg_step"
  | "naaqs_exceedance";

export type FlagSeverity =
  | "improvement"
  | "regression"
  | "surge"
  | "drop"
  | "unresolved"
  | "health_based_recent"
  | "health_based_recent5y"
  | "exceedance";

export interface Flag {
  type: FlagType;
  severity: FlagSeverity;
  label: string;
  summary: string;
  magnitude_pct: number | null;
  magnitude_abs: number | null;
  baseline_year: number | null;
  recent_year: number;
  units: string | null;
  history: AnnualPoint[];
  link?: { label: string; href: string };
}

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

// ---- Co-located health indicators (CDC PLACES) --------------------------
// Modeled small-area prevalence estimates from CDC PLACES, paired with
// the existing pollution + demographic surfaces. Crude prevalence is the
// headline value (the actual local rate); age-adjusted prevalence drives
// the cross-geography comparator (vs state mean).
//
// EDITORIAL CONTRACT — modeled, not measured. Comparisons are ecological,
// not causal. The methodology page must state this and the section
// subtitle on the page reinforces it.

export interface HealthIndicator {
  measure_key: string;        // "asthma" / "copd" / "chd" / "diabetes" / "mental"
  label: string;              // "Adult asthma (current)"
  crude: number;              // local prevalence %
  age_adjusted: number | null;
  state_mean: number | null;  // age-adjusted state mean comparator
  us_mean: number | null;     // age-adjusted national mean comparator
  // Pre-computed comparator deltas vs state and vs US. pp = percentage-
  // point delta; pct = relative percent difference (+38% etc). Class is
  // the editorial color bucket each comparator renders against.
  vs_state_pp: number | null;
  vs_state_pct: number | null;
  vs_state_class: "worse" | "elevated" | "neutral" | "better";
  vs_us_pp: number | null;
  vs_us_pct: number | null;
  vs_us_class: "worse" | "elevated" | "neutral" | "better";
  source: string;             // "CDC PLACES · 2025 release"
  vintage_year: number;       // BRFSS data year (2022 / 2023)
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
  flags: Flag[];                // "Notable signals" section, possibly empty
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
    county?: string | null;
    county_slug?: string | null;
    place_slug?: string | null;
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
  flags: Flag[];
  equity: EquityOverlay;
  source: {
    label: string;
    url: string;
    retrieved: string;
  };
  _published_at?: string;
}

// ---- Superfund / NPL site (Tier 1 entity, /superfund/[slug]) -----------
// Reframes EPA's procedural site record as a place-anchored narrative.
// V1 hero is degraded relative to the §8 design — listing-date enrichment
// is Phase 1.5 work; until that lands the hero leads with status + city/
// county + federal-facility flag rather than "Listed YYYY — N years."

// Roll-up summary used in state / county / city Superfund-section tables.
// Lighter than the full SuperfundPayload — no contaminants list, no equity.
// Live alongside FacilitySummary / UtilitySummary in shape and intent.
export interface SuperfundSummary {
  slug: string;
  state: string;
  name: string;
  epa_id: string;
  npl_status: string;            // verbatim from SEMS (e.g. 'Currently on the Final NPL')
  is_active_npl: boolean;
  is_deleted: boolean;
  is_federal_facility: boolean;
  city: string | null;           // host city display name (TIGER place when matched)
  city_slug: string | null;      // TIGER place slug — present only when point-in-polygon resolved
  primary_contaminant: string | null;
}

export interface SuperfundContaminant {
  name: string;
  media: string;            // 'Groundwater' | 'Soil' | 'Sediment' | 'Surface Water' | etc.
  operable_units: string[]; // SEMS OU numbers (e.g. '02') — context only
  citation_count: number;   // SEMS row count for this (name, media) pair
}

// Cross-source differentiator: SDWIS PWSes drawing groundwater within the
// configured radius of an NPL site. Distance is computed from the site
// lat/lon to the served-city's TIGER place centroid (SDWIS doesn't expose
// well or treatment-plant lat/lon) — coarse on purpose. Empty list with
// `radius_miles` set is itself a finding worth surfacing.
export interface NearbyGroundwaterUtility {
  pwsid: string;
  name: string;
  slug: string;
  state: string;
  distance_miles: number;
  place_name: string;
  primary_source: "groundwater" | "mixed" | "purchased" | "surface_water";
  population_served: number;
  health_based_5yr: number;
  unresolved: boolean;
}

export interface SuperfundWaterLinkage {
  radius_miles: number;
  utilities: NearbyGroundwaterUtility[];
}

export interface SuperfundPayload {
  site: {
    state: string;
    state_label: string;
    slug: string;
    name: string;
    epa_id: string;          // e.g. 'CA2170023236' — URL-stable
    npl_status: string;      // verbatim from SEMS (e.g. 'Currently on the Final NPL')
    is_active_npl: boolean;
    is_deleted: boolean;
    is_federal_facility: boolean;
    county: string | null;
    county_slug: string | null;
    city: string | null;     // TIGER place name when matched, else EPA-supplied label
    city_slug: string | null;
    address: string;
    zip: string;
    lat: number | null;
    lng: number | null;
  };
  briefing_label: string;
  totals: {
    contaminants_count: number;
    primary_contaminant: string | null; // most-cited COC name
  };
  contaminants: SuperfundContaminant[];  // sorted by citation_count desc
  water_linkage?: SuperfundWaterLinkage;  // groundwater PWSes within the configured radius
  flags: Flag[];                          // empty in v1; flag detection deferred
  equity: EquityOverlay;
  source: {
    label: string;
    url: string;
    retrieved: string;
  };
  _published_at?: string;
}

// ---- Cross-link module: similar places within state --------------------
// Surfaced at the bottom of county and city pages. The pipeline picks 5
// pollution-profile peers + 1 deliberate contrast (similar scale, opposite
// EJ band) so the section teaches the wealth-pollution gap rather than just
// shuffling navigation. See pipeline/src/publish/site.py.

export interface RelatedPlace {
  kind: "county" | "city";
  state: string;
  slug: string;
  name: string;
  population: number;
  facilities_count: number;
  total_releases_pounds: number;
  dominant_medium: "air" | "water" | "land" | "none";
  ej_pct_avg: number | null;
  relation: "peer" | "contrast";
  reason: string;
}

// ---- Tier 2: City hub (place-anchored) ----------------------------------
// /state/[state]/city/[slug] — the "is the environment here OK?" page for
// a Census place. Aggregates TRI facilities in the place polygon, GHG
// (county-share), water utilities serving the place, and equity. Distinct
// from /state/[state]/water/[slug], which is the *entity* page for one
// public water system.

export interface CityHubPayload {
  place: {
    state: string;
    state_label: string;
    slug: string;
    name: string;
    fips: string;
    population: number;
    county_name: string | null;
    county_fips: string | null;
  };
  reporting_year: number;
  briefing_label: string;
  totals: {
    facilities_in_city: number;
    utilities_serving: number;
    total_releases_pounds: number;
    air_releases_pounds: number;
    water_releases_pounds: number;
    land_releases_pounds: number;
    yoy_pct_change: number | null;
    long_arc_pct_change: number | null;
    long_arc_baseline_year: number;
    history: AnnualPoint[];
  };
  pathways: PollutantSummary[];
  facilities: FacilitySummary[];
  water: {
    utilities_count: number;
    population_served_total: number;
    violations_5yr_total: number;
    health_based_5yr_total: number;
    unresolved_total: number;
    utilities_with_unresolved: number;
    utilities: UtilitySummary[];
  };
  superfund?: SuperfundSummary[]; // NPL sites in this place polygon
  flags: Flag[];
  equity: EquityOverlay;
  health_indicators?: HealthIndicator[];
  related_places?: RelatedPlace[];
  sources: { label: string; url: string; retrieved: string }[];
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
  lat: number | null;
  lng: number | null;
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
  superfund?: SuperfundSummary[]; // top NPL sites in this county (capped 10)
  superfund_total?: number;       // count of all NPL sites in county
  // Alphabetical directory of every city in this county that has its own
  // published page (≥1 facility OR ≥1 county-filtered utility). Mirrors
  // the state page's counties_directory pattern — surfaces internal links
  // to long-tail city hubs that don't otherwise appear on the page.
  cities_directory?: {
    slug: string;
    name: string;
    fips: string;
    facilities_count: number;
    utilities_count: number;
    population: number;
  }[];
  flags: Flag[];
  equity: EquityOverlay;
  health_indicators?: HealthIndicator[];
  related_places?: RelatedPlace[];
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
    npl_sites_tracked?: number;
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
  counties_directory: {
    slug: string;
    name: string;
    fips?: string;
    facilities_count: number;
    total_releases_pounds?: number;
  }[];
  top_facilities: FacilitySummary[];
  top_utilities: UtilitySummary[];
  superfund?: SuperfundSummary[]; // top NPL sites in this state (capped 10)
  flags: Flag[];
  equity: EquityOverlay;
  sources: { label: string; url: string; retrieved: string }[];
  _published_at?: string;
}

// ---- Home page ----------------------------------------------------------

export interface FeaturedEntity {
  kind: "facility" | "water" | "county" | "city" | "superfund";  // "water" = utility entity; "city" = place hub; "superfund" = NPL site entity
  state: string;
  slug: string;
  name: string;
  state_label: string;
  headline: string;        // one-line lede
  metric_label: string;
  metric_value: string;
  trend_24mo?: number[];
  flag_type?: FlagType | null;
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
