"""AQS annual-summary ingest from EPA AirData bulk downloads.

Source: ``https://aqs.epa.gov/aqsweb/airdata/annual_conc_by_monitor_YYYY.zip``.
One row per (monitor × parameter × pollutant-standard × year). We cache the
nationwide zip per-year (~4 MB compressed) and filter to the requested state
at parse time — different states sharing the same cached file makes
multi-state runs essentially free.

v1 surfaces four NAAQS-relevant metrics that drive the ``criteria_air``
pathway tile and the ``naaqs_exceedance`` anomaly flag:

- ``pm25_annual`` — PM2.5 arithmetic mean (NAAQS 9 µg/m³, finalized Feb 2024)
- ``pm25_24hr``   — PM2.5 24-hour 98th percentile (NAAQS 35 µg/m³)
- ``ozone_8hr``   — Ozone 8-hour 4th-highest daily max (NAAQS 70 ppb)
- ``no2_annual``  — NO₂ arithmetic mean (NAAQS 53 ppb)

SO₂, CO, Lead, and PM10 are excluded from v1 — they're rarely the editorial
story outside of specific industrial contexts and can be added in a follow-up
without changing the aggregate / publish surface.
"""

from __future__ import annotations

import csv
import io
import logging
import zipfile
from dataclasses import dataclass
from pathlib import Path

import httpx

from ..config import RAW_ROOT
from ..states import State

log = logging.getLogger(__name__)

USER_AGENT = "PollutionAnalystAi/0.1 (+contact: ops@pollutionanalyst.ai)"
URL_TEMPLATE = "https://aqs.epa.gov/aqsweb/airdata/annual_conc_by_monitor_{year}.zip"


# ---- Metric catalog ------------------------------------------------------
# Each metric pulls from one parameter code and one preferred pollutant-standard
# label, falling back through earlier-vintage standards so the time series
# stays continuous across NAAQS-revision years. The statistic column we read
# is fixed per metric (never depends on year).

@dataclass(frozen=True)
class MetricSpec:
    key: str                    # "pm25_annual" / "ozone_8hr" / ...
    pollutant: str              # short editorial label, e.g. "PM2.5"
    parameter_code: str         # AQS parameter code
    standard_preferences: tuple[str, ...]  # try in order; first present wins
    statistic_column: str       # CSV header to read for the value
    units: str                  # canonical render units, e.g. "µg/m³"
    naaqs: float                # threshold for exceedance flag
    naaqs_label: str            # human-readable threshold ("9 µg/m³ (annual)")


METRICS: tuple[MetricSpec, ...] = (
    MetricSpec(
        key="pm25_annual",
        pollutant="PM2.5",
        parameter_code="88101",
        standard_preferences=(
            "PM25 Annual 2024",
            "PM25 Annual 2012",
            "PM25 Annual 2006",
            "PM25 Annual 1997",
        ),
        statistic_column="Arithmetic Mean",
        units="µg/m³",
        naaqs=9.0,
        naaqs_label="9 µg/m³ (annual)",
    ),
    MetricSpec(
        key="pm25_24hr",
        pollutant="PM2.5",
        parameter_code="88101",
        standard_preferences=(
            "PM25 24-hour 2024",
            "PM25 24-hour 2012",
            "PM25 24-hour 2006",
            "PM25 24-hour 1997",
        ),
        statistic_column="98th Percentile",
        units="µg/m³",
        naaqs=35.0,
        naaqs_label="35 µg/m³ (24-hour)",
    ),
    MetricSpec(
        key="ozone_8hr",
        pollutant="Ozone",
        parameter_code="44201",
        standard_preferences=(
            "Ozone 8-hour 2015",
            "Ozone 8-Hour 2008",
            "Ozone 8-Hour 1997",
        ),
        statistic_column="4th Max Value",
        units="ppm",          # raw AQS units; render layer multiplies × 1000 if ppb desired
        naaqs=0.070,
        naaqs_label="0.070 ppm (8-hour)",
    ),
    MetricSpec(
        key="no2_annual",
        pollutant="NO₂",
        parameter_code="42602",
        standard_preferences=("NO2 Annual 1971",),
        statistic_column="Arithmetic Mean",
        units="ppb",
        naaqs=53.0,
        naaqs_label="53 ppb (annual)",
    ),
)

# Index for fast lookup during parsing.
_METRICS_BY_PARAM: dict[str, list[MetricSpec]] = {}
for _m in METRICS:
    _METRICS_BY_PARAM.setdefault(_m.parameter_code, []).append(_m)


@dataclass
class AnnualMonitorReading:
    """One (site, metric, year) annual reading. Multiple POCs at the same
    site collapse to a per-site mean at aggregation time."""
    state_fips: str          # 2-digit
    county_fips: str         # 5-digit (state + county)
    site_id: str             # state-county-site composite (9-digit)
    lat: float | None
    lng: float | None
    metric_key: str          # MetricSpec.key
    year: int
    value: float
    completeness_ok: bool    # CSV "Completeness Indicator" == "Y"
    observation_pct: int     # 0-100


# ---- Download / cache ----------------------------------------------------

def _cache_path(year: int) -> Path:
    return RAW_ROOT / "aqs" / f"annual_conc_by_monitor_{year}.zip"


def _download(year: int) -> Path:
    """Fetch the nationwide annual_conc_by_monitor zip for ``year``. Cached."""
    cache = _cache_path(year)
    if cache.exists() and cache.stat().st_size > 1_000_000:
        return cache
    cache.parent.mkdir(parents=True, exist_ok=True)
    url = URL_TEMPLATE.format(year=year)
    log.info("AQS %d: downloading annual_conc_by_monitor (~4MB)", year)
    with httpx.Client(timeout=300.0, headers={"User-Agent": USER_AGENT}) as client:
        r = client.get(url)
        r.raise_for_status()
    cache.write_bytes(r.content)
    return cache


def _is_year_cached(year: int) -> bool:
    p = _cache_path(year)
    return p.exists() and p.stat().st_size > 1_000_000


# ---- Public API ----------------------------------------------------------

def fetch_state_year(
    state: State, year: int, cache_only: bool = False,
) -> list[AnnualMonitorReading]:
    """Return AQS readings for ``state`` × ``year`` across the v1 metric set.

    Picks the best-available pollutant-standard row per (site, POC, metric)
    using ``MetricSpec.standard_preferences`` in declared order.
    """
    if cache_only and not _is_year_cached(year):
        return []
    try:
        path = _download(year)
    except httpx.HTTPStatusError as exc:
        log.warning("AQS %d: bulk download failed: %s", year, exc)
        return []

    readings = list(_parse_zip(path, state.fips, year))
    log.info(
        "AQS %s %d: parsed %d monitor readings across %d metrics",
        state.abbr, year, len(readings), len({r.metric_key for r in readings}),
    )
    return readings


# ---- Parsing -------------------------------------------------------------

def _parse_zip(path: Path, state_fips: str, year: int):
    """Yield AnnualMonitorReading rows for the given state and year.

    Per (site, POC, metric) we pick exactly one row by walking the metric's
    ``standard_preferences`` in order and yielding the first match. This
    keeps the time series continuous across NAAQS revisions while still
    preferring the most-current standard label when multiple are present.
    """
    with zipfile.ZipFile(path) as zf:
        name = next(n for n in zf.namelist() if n.endswith(".csv"))
        body = zf.read(name).decode("utf-8", errors="replace")

    reader = csv.DictReader(io.StringIO(body))
    # First pass: bucket candidate rows by (site, POC, metric).
    # Value = list of (preference_index, parsed_reading).
    buckets: dict[tuple[str, str, str], list[tuple[int, AnnualMonitorReading]]] = {}
    for raw in reader:
        if (raw.get("State Code") or "").strip() != state_fips:
            continue
        param = (raw.get("Parameter Code") or "").strip()
        if param not in _METRICS_BY_PARAM:
            continue
        std = (raw.get("Pollutant Standard") or "").strip()
        for m in _METRICS_BY_PARAM[param]:
            try:
                pref_idx = m.standard_preferences.index(std)
            except ValueError:
                continue
            reading = _to_reading(raw, m, year)
            if reading is None:
                continue
            poc = (raw.get("POC") or "").strip()
            site = reading.site_id
            buckets.setdefault((site, poc, m.key), []).append((pref_idx, reading))
            break

    # Second pass: pick the top-preference reading per bucket.
    for candidates in buckets.values():
        candidates.sort(key=lambda x: x[0])
        yield candidates[0][1]


def _to_reading(row: dict[str, str], m: MetricSpec, year: int) -> AnnualMonitorReading | None:
    raw_val = row.get(m.statistic_column)
    if raw_val is None or raw_val == "":
        return None
    try:
        value = float(raw_val)
    except (TypeError, ValueError):
        return None
    state_fips = (row.get("State Code") or "").strip()
    county_code = (row.get("County Code") or "").strip()
    site_num = (row.get("Site Num") or "").strip()
    if not state_fips or not county_code or not site_num:
        return None
    try:
        obs_pct = int(float(row.get("Observation Percent") or "0"))
    except (TypeError, ValueError):
        obs_pct = 0
    completeness = (row.get("Completeness Indicator") or "").strip().upper() == "Y"
    return AnnualMonitorReading(
        state_fips=state_fips,
        county_fips=state_fips + county_code,
        site_id=f"{state_fips}{county_code}{site_num}",
        lat=_coerce(row.get("Latitude")),
        lng=_coerce(row.get("Longitude")),
        metric_key=m.key,
        year=year,
        value=value,
        completeness_ok=completeness,
        observation_pct=obs_pct,
    )


def _coerce(s: str | None) -> float | None:
    if s is None or s == "":
        return None
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


# ---- Aggregation ---------------------------------------------------------

def aggregate_county_year(readings: list[AnnualMonitorReading]) -> dict[str, dict[str, float]]:
    """{county_fips: {metric_key: monitor-mean for that year}}.

    Multiple POCs at the same site collapse to a site mean first; multiple
    sites in a county then average. This keeps a multi-POC site from dominating
    a sparsely-monitored county.
    """
    # site -> metric -> [values]
    per_site: dict[tuple[str, str], list[float]] = {}
    site_to_county: dict[str, str] = {}
    for r in readings:
        per_site.setdefault((r.site_id, r.metric_key), []).append(r.value)
        site_to_county[r.site_id] = r.county_fips
    # site -> metric -> site-mean
    site_means: dict[str, dict[str, float]] = {}
    for (site, metric), vals in per_site.items():
        site_means.setdefault(site, {})[metric] = sum(vals) / len(vals)
    # county -> metric -> [site-means]
    county_means: dict[str, dict[str, list[float]]] = {}
    for site, metric_map in site_means.items():
        cf = site_to_county[site]
        for metric, val in metric_map.items():
            county_means.setdefault(cf, {}).setdefault(metric, []).append(val)
    out: dict[str, dict[str, float]] = {}
    for cf, metric_map in county_means.items():
        for metric, vals in metric_map.items():
            out.setdefault(cf, {})[metric] = sum(vals) / len(vals)
    return out


def aggregate_state_year(readings: list[AnnualMonitorReading]) -> dict[str, float]:
    """{metric_key: state-monitor-mean for that year}.

    Statewide mean across all monitors (collapsed to site-mean first, like
    the county aggregator). For state-page pathway tiles only — county pages
    use the per-county mean and ignore state-level rollups.
    """
    per_site: dict[tuple[str, str], list[float]] = {}
    for r in readings:
        per_site.setdefault((r.site_id, r.metric_key), []).append(r.value)
    site_means: dict[str, list[float]] = {}
    for (_site, metric), vals in per_site.items():
        site_means.setdefault(metric, []).append(sum(vals) / len(vals))
    return {metric: sum(vals) / len(vals) for metric, vals in site_means.items()}


def metric_for_key(key: str) -> MetricSpec:
    """Reverse-lookup. Raises KeyError on unknown key."""
    for m in METRICS:
        if m.key == key:
            return m
    raise KeyError(key)
