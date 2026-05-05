"""CDC PLACES ingest — co-located health indicators at county and place level.

PLACES (Population Level Analysis and Community Estimates) publishes
modeled small-area prevalence estimates for ~40 chronic-disease and
health-behavior measures. The estimates are derived from BRFSS via a
multi-level small-area regression, not measured directly — that distinction
matters editorially and is reinforced on the methodology page.

Source: chronicdata.cdc.gov, Socrata Open Data API.
- County dataset: ``swc5-untb`` ("PLACES: Local Data for Better Health,
  County Data, 2025 release")
- Place dataset:  ``eav7-hnsx`` (same family, Census-place geography)

Both publish in long format — one row per (geography × measure ×
data_value_type), where ``data_value_type`` is either "Crude prevalence"
(local rate as-is) or "Age-adjusted prevalence" (re-weighted to the 2000
US standard population, the right value for cross-geography comparison).
We pull both: crude for the headline value on a tile, age-adjusted for
the "vs state mean" comparator.

This module is pre-staged — wire-up into publish/site.py and main.py is
intentionally deferred until the editorial templates settle. Calling
``fetch_state_counties`` / ``fetch_state_places`` populates the cache and
returns parsed records; downstream aggregation hooks are in place for the
day publish-layer wiring lands.

Editorial guardrails carried by callers:
1. Always render the source line + vintage on every tile. PLACES is
   modeled, not measured — readers must see this.
2. "Co-located, ecological — not causal." Section subtitle, methodology
   page, no exceptions. Pollution at the county level correlating with
   asthma at the county level is not a causal claim.
3. v1 ships five measures (CASTHMA, COPD, CHD, DIABETES, MHLTH) deemed
   most pollution-relevant. Adding more is a config change, not a
   pipeline change.
"""

from __future__ import annotations

import csv
import io
import logging
from dataclasses import dataclass, field
from pathlib import Path

import httpx

from ..config import RAW_ROOT
from ..states import State

log = logging.getLogger(__name__)

USER_AGENT = "PollutionAnalystAi/0.1 (+contact: ops@pollutionanalyst.ai)"
URL_COUNTY = "https://data.cdc.gov/resource/swc5-untb.csv"
URL_PLACE = "https://data.cdc.gov/resource/eav7-hnsx.csv"


# ---- v1 measure catalog -------------------------------------------------

@dataclass(frozen=True)
class PlacesMeasure:
    key: str            # internal slug — what the publish payload renders
    measure_id: str     # CDC PLACES MeasureId column value
    label: str          # editorial tile label
    short: str          # CDC's "Short_Question_Text" — used as fallback / cross-check


V1_MEASURES: tuple[PlacesMeasure, ...] = (
    PlacesMeasure("asthma",   "CASTHMA",  "Adult asthma (current)",   "Current Asthma"),
    PlacesMeasure("copd",     "COPD",     "COPD prevalence",          "COPD"),
    PlacesMeasure("chd",      "CHD",      "Coronary heart disease",   "Coronary Heart Disease"),
    PlacesMeasure("diabetes", "DIABETES", "Diabetes (diagnosed)",     "Diagnosed Diabetes"),
    PlacesMeasure("mental",   "MHLTH",    "Frequent mental distress", "Frequent Mental Distress"),
)

_KEY_BY_ID = {m.measure_id: m.key for m in V1_MEASURES}
_MEASURE_IDS_SOQL = ",".join(f"'{m.measure_id}'" for m in V1_MEASURES)


@dataclass
class PlacesReading:
    """One geography × measure observation. Carries both Crude (the local
    rate as-is, for the headline value) and Age-Adjusted (re-weighted to
    the 2000 US standard population, for cross-geography comparison)."""
    location_id: str         # 5-digit county FIPS or 7-digit place FIPS
    state_abbr: str
    location_name: str       # "Kern" / "Bakersfield"
    measure_key: str         # PlacesMeasure.key
    crude: float | None = None
    age_adjusted: float | None = None
    population_18plus: int = 0
    year: int = 0            # BRFSS data year (varies by measure within a release)


# ---- Download / cache ---------------------------------------------------

def _county_cache_path(state_abbr: str) -> Path:
    return RAW_ROOT / "cdc_places" / f"county_{state_abbr.upper()}.csv"


def _us_county_cache_path() -> Path:
    """Nationwide county subset, used to compute the national-mean comparator."""
    return RAW_ROOT / "cdc_places" / "county_US.csv"


def _place_cache_path(state_abbr: str) -> Path:
    return RAW_ROOT / "cdc_places" / f"place_{state_abbr.upper()}.csv"


def _fetch(url: str, params: dict[str, str], cache: Path) -> str:
    """Server-side filtered Socrata pull. Cached on disk per state."""
    if cache.exists() and cache.stat().st_size > 0:
        return cache.read_text()
    cache.parent.mkdir(parents=True, exist_ok=True)
    log.info("CDC PLACES: fetching %s (cache cold)", cache.name)
    with httpx.Client(timeout=120.0, headers={"User-Agent": USER_AGENT}) as client:
        r = client.get(url, params=params)
        r.raise_for_status()
    body = r.text
    cache.write_text(body)
    return body


def _is_county_year_cached(state_abbr: str) -> bool:
    p = _county_cache_path(state_abbr)
    return p.exists() and p.stat().st_size > 0


def _is_place_year_cached(state_abbr: str) -> bool:
    p = _place_cache_path(state_abbr)
    return p.exists() and p.stat().st_size > 0


def _is_us_county_cached() -> bool:
    p = _us_county_cache_path()
    return p.exists() and p.stat().st_size > 0


# ---- Public API ---------------------------------------------------------

def fetch_state_counties(state: State, cache_only: bool = False) -> list[PlacesReading]:
    """Return PLACES county-level readings for ``state``, v1 measures only.

    Pulls a server-side-filtered Socrata subset (~120 KB / state) so this
    is cheap to run on every pipeline cycle. Both crude and age-adjusted
    values come back on the same record.
    """
    if cache_only and not _is_county_year_cached(state.abbr):
        return []
    params = {
        "stateabbr": state.abbr.upper(),
        "$where": f"measureid in ({_MEASURE_IDS_SOQL})",
        "$select": (
            "year,stateabbr,locationname,locationid,measureid,"
            "data_value_type,data_value,totalpop18plus"
        ),
        "$limit": "5000",
    }
    body = _fetch(URL_COUNTY, params, _county_cache_path(state.abbr))
    readings = list(_collapse_rows(body))
    log.info(
        "CDC PLACES %s counties: %d readings across %d locations",
        state.abbr, len(readings), len({r.location_id for r in readings}),
    )
    return readings


def fetch_us_counties(cache_only: bool = False) -> list[PlacesReading]:
    """Return PLACES county-level readings for every US county, v1 measures
    only. Used to compute the national-mean comparator that pairs with the
    state-mean on each tile.

    ~3,200 counties × 5 measures × 2 strats ≈ 32k rows, ~6 MB CSV. Cached
    once per pipeline run — same file serves every state's publish loop.
    """
    if cache_only and not _is_us_county_cached():
        return []
    params = {
        "$where": f"measureid in ({_MEASURE_IDS_SOQL})",
        "$select": (
            "year,stateabbr,locationname,locationid,measureid,"
            "data_value_type,data_value,totalpop18plus"
        ),
        "$limit": "200000",
    }
    body = _fetch(URL_COUNTY, params, _us_county_cache_path())
    readings = list(_collapse_rows(body))
    log.info(
        "CDC PLACES US counties: %d readings across %d locations",
        len(readings), len({r.location_id for r in readings}),
    )
    return readings


def fetch_state_places(state: State, cache_only: bool = False) -> list[PlacesReading]:
    """Return PLACES place-level readings for ``state``, v1 measures only.

    Geography is Census place — the same key the city-hub pages use.
    Subset is larger than counties (~1,500 places in CA × 5 measures × 2
    strats ≈ 15k rows ≈ ~3 MB) but still small enough to fetch directly.
    """
    if cache_only and not _is_place_year_cached(state.abbr):
        return []
    params = {
        "stateabbr": state.abbr.upper(),
        "$where": f"measureid in ({_MEASURE_IDS_SOQL})",
        "$select": (
            "year,stateabbr,locationname,locationid,measureid,"
            "data_value_type,data_value,totalpop18plus"
        ),
        "$limit": "200000",
    }
    body = _fetch(URL_PLACE, params, _place_cache_path(state.abbr))
    readings = list(_collapse_rows(body))
    log.info(
        "CDC PLACES %s places: %d readings across %d locations",
        state.abbr, len(readings), len({r.location_id for r in readings}),
    )
    return readings


# ---- Parsing ------------------------------------------------------------

def _collapse_rows(body: str):
    """Collapse the long-format CSV (one row per geography × measure ×
    data_value_type) into one ``PlacesReading`` per (geography, measure)
    carrying both crude and age-adjusted values.
    """
    reader = csv.DictReader(io.StringIO(body))
    by_loc_measure: dict[tuple[str, str], PlacesReading] = {}
    for raw in reader:
        loc_id = (raw.get("locationid") or "").strip()
        measure_id = (raw.get("measureid") or "").strip()
        key = _KEY_BY_ID.get(measure_id)
        if not loc_id or not key:
            continue
        try:
            value = float(raw["data_value"]) if raw.get("data_value") else None
        except (TypeError, ValueError):
            value = None
        if value is None:
            continue
        bucket_key = (loc_id, key)
        rec = by_loc_measure.get(bucket_key)
        if rec is None:
            try:
                pop = int(float(raw.get("totalpop18plus") or "0"))
            except (TypeError, ValueError):
                pop = 0
            try:
                year = int(raw.get("year") or "0")
            except (TypeError, ValueError):
                year = 0
            rec = PlacesReading(
                location_id=loc_id,
                state_abbr=(raw.get("stateabbr") or "").strip().upper(),
                location_name=(raw.get("locationname") or "").strip(),
                measure_key=key,
                population_18plus=pop,
                year=year,
            )
            by_loc_measure[bucket_key] = rec
        dvt = (raw.get("data_value_type") or "").strip()
        if dvt == "Crude prevalence":
            rec.crude = value
        elif dvt == "Age-adjusted prevalence":
            rec.age_adjusted = value
    return by_loc_measure.values()


# ---- Aggregation --------------------------------------------------------

def by_location(readings: list[PlacesReading]) -> dict[str, dict[str, PlacesReading]]:
    """``{location_id: {measure_key: reading}}`` — the shape the publish
    layer will consume. Same fn for both county and place output."""
    out: dict[str, dict[str, PlacesReading]] = {}
    for r in readings:
        out.setdefault(r.location_id, {})[r.measure_key] = r
    return out


@dataclass
class StateMeans:
    """Population-weighted state mean per measure — used as the comparator
    on each tile ('+38% vs CA mean'). Built from county readings; place
    readings would over-weight metros if used for the same purpose."""
    by_measure: dict[str, float] = field(default_factory=dict)


def us_means_from_counties(readings: list[PlacesReading]) -> StateMeans:
    """Population-weighted mean across every US county (alias of
    ``state_means_from_counties`` — same population-weighted-of-age-adjusted
    methodology, just over the full national county roster). Returned in
    the same ``StateMeans`` shape so callers can use the two interchangeably."""
    return state_means_from_counties(readings)


def state_means_from_counties(readings: list[PlacesReading]) -> StateMeans:
    """Population-weighted mean across counties, using age-adjusted
    prevalence (the cross-geography-comparable metric).

    Intentionally NOT pulled from the dataset's own state-level row: this
    way the comparator is consistent with the values rendered on tiles —
    no risk of "Kern is +38% vs state" when state is computed under a
    different stratification.
    """
    sums: dict[str, float] = {}
    weights: dict[str, float] = {}
    for r in readings:
        v = r.age_adjusted if r.age_adjusted is not None else r.crude
        if v is None or r.population_18plus <= 0:
            continue
        w = float(r.population_18plus)
        sums[r.measure_key] = sums.get(r.measure_key, 0.0) + v * w
        weights[r.measure_key] = weights.get(r.measure_key, 0.0) + w
    return StateMeans(by_measure={
        k: round(sums[k] / weights[k], 2) for k in sums if weights.get(k, 0) > 0
    })


def measure_for_key(key: str) -> PlacesMeasure:
    """Reverse lookup. Raises KeyError on unknown."""
    for m in V1_MEASURES:
        if m.key == key:
            return m
    raise KeyError(key)
