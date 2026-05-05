"""EJScreen disparity-score ingest from the USEPA-clone GitHub mirror.

EPA deprecated their public-facing EJScreen tool in 2025. The underlying
data tables that powered it are still available via the USEPA-clone GitHub
organization, specifically the ``ejamdata`` repository which the open-source
EJAM package (also EPA-authored) consumes.

We pull ``data/bgej.arrow`` — block-group disparity scores per environmental
indicator (PM2.5, ozone, NO2, diesel particulate, RSEI toxic releases,
traffic, lead-paint pre-1960, NPL/RMP/TSDF/NPDES proximity, USTs, drinking
water non-compliance). Aggregated to state and county levels by population-
weighted mean.

Note: these are EPA's newer "EJ disparity score" metric, not the original
EJScreen national-percentile rankings. Higher score = greater disparity in
exposure burden. We surface them with that framing on the equity overlay.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import httpx

from ..config import RAW_ROOT

log = logging.getLogger(__name__)

BGEJ_URL = "https://media.githubusercontent.com/media/USEPA-clone/ejamdata/main/data/bgej.arrow"
USER_AGENT = "PollutionAnalystAi/0.1 (+contact: ops@pollutionanalyst.ai)"

# Indicators worth surfacing on equity overlays. Maps the underlying column
# stem (used as ``EJ.DISPARITY.{stem}.eo``) to a friendly label.
INDICATORS: dict[str, str] = {
    "pm": "PM2.5 (fine particulate)",
    "o3": "Ozone",
    "no2": "Nitrogen dioxide (NO₂)",
    "dpm": "Diesel particulate",
    "rsei": "Toxic releases (RSEI)",
    "traffic.score": "Traffic proximity",
    "pctpre1960": "Lead-paint risk (pre-1960 housing)",
    "proximity.npl": "Superfund site proximity",
    "proximity.rmp": "RMP-facility proximity",
    "proximity.tsdf": "Hazardous-waste site proximity",
    "ust": "Underground storage tanks",
    "proximity.npdes": "NPDES wastewater proximity",
    "drinking": "Drinking-water non-compliance",
}


@dataclass
class EJDisparity:
    """Population-weighted disparity scores for one geography."""
    label: str       # indicator label
    score: float     # weighted mean (units: EPA disparity score)


@dataclass
class EJPercentile:
    """National percentile rank for one geography × indicator.

    Indicates where this geography's population-weighted mean indicator value
    sits in the population-weighted national distribution of all US
    block-group means. 95 = "lives in the highest 5% nationally." Mirrors
    the framing EPA's original EJScreen tool used; rank computed in-pipeline
    since EJScreen retired the prebuilt percentile columns.
    """
    label: str
    pct_us: float    # 0-100


def _bgej_path() -> Path:
    return RAW_ROOT / "ejscreen" / "bgej.arrow"


def _ensure_downloaded() -> Path:
    p = _bgej_path()
    if p.exists() and p.stat().st_size > 1_000_000:
        return p
    p.parent.mkdir(parents=True, exist_ok=True)
    log.info("EJScreen: downloading bgej.arrow (~85MB) from USEPA-clone mirror")
    with httpx.Client(timeout=300.0, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as client:
        r = client.get(BGEJ_URL)
        r.raise_for_status()
    p.write_bytes(r.content)
    return p


def _load_table():
    """Load the Arrow table once. Importing pyarrow lazily so non-EJScreen
    pipeline runs don't have to pay for it.
    """
    import pyarrow.feather as feather
    return feather.read_table(_ensure_downloaded())


def aggregate_state(state_abbr: str) -> list[EJDisparity]:
    """Return population-weighted disparity scores for the state."""
    import pyarrow.compute as pc
    t = _load_table()
    mask = pc.equal(t.column("ST"), state_abbr.upper())
    sub = t.filter(mask)
    return _aggregate_rows(sub)


def aggregate_counties(state_abbr: str) -> dict[str, list[EJDisparity]]:
    """Return per-county scores keyed by 5-digit county FIPS."""
    import pyarrow.compute as pc
    t = _load_table()
    mask = pc.equal(t.column("ST"), state_abbr.upper())
    sub = t.filter(mask)
    bgfips = sub.column("bgfips").to_pylist()
    pops = sub.column("pop").to_pylist()
    by_county: dict[str, list[int]] = {}
    for i, bg in enumerate(bgfips):
        if not bg or len(bg) < 5:
            continue
        county_fips = bg[:5]
        by_county.setdefault(county_fips, []).append(i)
    out: dict[str, list[EJDisparity]] = {}
    for cfips, idxs in by_county.items():
        county_sub = sub.take(idxs)
        out[cfips] = _aggregate_rows(county_sub)
    return out


def aggregate_places(
    state_abbr: str,
    bg_to_place: dict[str, str],
) -> dict[str, list[EJDisparity]]:
    """Return per-place EJ disparity scores keyed by 7-digit place FIPS.

    bg_to_place: {12-digit bgfips: 7-digit place_fips}, built by
    spatial.places.build_bg_to_place().
    """
    import pyarrow.compute as pc
    t = _load_table()
    mask = pc.equal(t.column("ST"), state_abbr.upper())
    sub = t.filter(mask)
    bgfips = sub.column("bgfips").to_pylist()
    by_place: dict[str, list[int]] = {}
    for i, bg in enumerate(bgfips):
        if not bg:
            continue
        place_fips = bg_to_place.get(bg)
        if not place_fips:
            continue
        by_place.setdefault(place_fips, []).append(i)
    out: dict[str, list[EJDisparity]] = {}
    for place_fips, idxs in by_place.items():
        # Skip places with too few block groups for meaningful aggregation
        if len(idxs) == 0:
            continue
        place_sub = sub.take(idxs)
        out[place_fips] = _aggregate_rows(place_sub)
    return out


def _aggregate_rows(sub) -> list[EJDisparity]:
    """Population-weighted mean of each disparity-score column."""
    import pyarrow.compute as pc
    pop_col = sub.column("pop")
    pop_arr = pop_col.to_pylist()
    out: list[EJDisparity] = []
    for stem, label in INDICATORS.items():
        col_name = f"EJ.DISPARITY.{stem}.eo"
        if col_name not in sub.column_names:
            continue
        vals = sub.column(col_name).to_pylist()
        # Pop-weighted mean across non-null values
        num = 0.0
        den = 0.0
        for v, p in zip(vals, pop_arr):
            if v is None or p is None or p <= 0:
                continue
            num += float(v) * float(p)
            den += float(p)
        if den > 0:
            out.append(EJDisparity(label=label, score=round(num / den, 1)))
    return out


# ---- National-percentile layer (raw indicators from blockgroupstats.rda) -

# Maps the column-stem in blockgroupstats.rda to the friendly label. Same
# label set as the disparity stems above so the two layers align row-for-row
# in the equity overlay UI. Note traffic.score and proximity.* use period-
# delimited names in the raw file matching the disparity column suffixes.
RAW_INDICATORS: dict[str, str] = {
    "pm": "PM2.5 (fine particulate)",
    "o3": "Ozone",
    "no2": "Nitrogen dioxide (NO₂)",
    "dpm": "Diesel particulate",
    "rsei": "Toxic releases (RSEI)",
    "traffic.score": "Traffic proximity",
    "pctpre1960": "Lead-paint risk (pre-1960 housing)",
    "proximity.npl": "Superfund site proximity",
    "proximity.rmp": "RMP-facility proximity",
    "proximity.tsdf": "Hazardous-waste site proximity",
    "ust": "Underground storage tanks",
    "proximity.npdes": "NPDES wastewater proximity",
    "drinking": "Drinking-water non-compliance",
}

BLOCKGROUPSTATS_URL = (
    "https://raw.githubusercontent.com/USEPA-clone/EJAM-open/main/data/blockgroupstats.rda"
)


def _blockgroupstats_path() -> Path:
    return RAW_ROOT / "ejscreen" / "blockgroupstats.rda"


def _ensure_blockgroupstats_downloaded() -> Path:
    p = _blockgroupstats_path()
    if p.exists() and p.stat().st_size > 50_000_000:
        return p
    p.parent.mkdir(parents=True, exist_ok=True)
    log.info("EJScreen: downloading blockgroupstats.rda (~72MB) from USEPA-clone/EJAM-open")
    with httpx.Client(timeout=300.0, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as client:
        r = client.get(BLOCKGROUPSTATS_URL)
        r.raise_for_status()
    p.write_bytes(r.content)
    return p


# Cache the loaded DataFrame + the precomputed national CDFs across calls.
_bgs_df = None
_national_cdf_cache: dict[str, list[tuple[float, float]]] = {}


def _load_blockgroupstats():
    global _bgs_df
    if _bgs_df is not None:
        return _bgs_df
    import pyreadr  # noqa: PLC0415
    result = pyreadr.read_r(str(_ensure_blockgroupstats_downloaded()))
    _bgs_df = result["blockgroupstats"]
    return _bgs_df


def _build_national_cdf(stem: str) -> list[tuple[float, float]]:
    """Return [(value, cumulative_pop_share), ...] sorted by value asc.

    For a given indicator stem, this is the population-weighted national CDF.
    Each block group contributes its raw indicator value weighted by population.
    Cached per-stem since the national distribution doesn't change between
    geographies in the same publish run.
    """
    if stem in _national_cdf_cache:
        return _national_cdf_cache[stem]
    df = _load_blockgroupstats()
    if stem not in df.columns:
        _national_cdf_cache[stem] = []
        return []
    vals = df[stem].to_numpy()
    pops = df["pop"].to_numpy()
    # Filter out NaN / non-positive pop
    import math
    pairs = [
        (float(v), float(p))
        for v, p in zip(vals, pops)
        if v is not None and not (isinstance(v, float) and math.isnan(v))
        and p is not None and not (isinstance(p, float) and math.isnan(p)) and p > 0
    ]
    if not pairs:
        _national_cdf_cache[stem] = []
        return []
    pairs.sort(key=lambda x: x[0])
    total_pop = sum(p for _, p in pairs)
    cdf: list[tuple[float, float]] = []
    cumulative = 0.0
    for v, p in pairs:
        cumulative += p
        cdf.append((v, cumulative / total_pop))
    _national_cdf_cache[stem] = cdf
    return cdf


def _percentile_in_cdf(value: float, cdf: list[tuple[float, float]]) -> float:
    """Bisect ``value`` into the precomputed CDF; return percentile (0-100)."""
    if not cdf:
        return 0.0
    import bisect
    keys = [x[0] for x in cdf]
    idx = bisect.bisect_right(keys, value)
    if idx <= 0:
        return 0.0
    if idx >= len(cdf):
        return 100.0
    return round(cdf[idx - 1][1] * 100, 1)


def _aggregate_percentile_rows(sub_df) -> list[EJPercentile]:
    """Compute pop-weighted mean of each raw indicator across the rows in
    ``sub_df`` (a pandas DataFrame slice), then look up the national percentile
    for that mean.
    """
    import math
    out: list[EJPercentile] = []
    if len(sub_df) == 0:
        return out
    pops = sub_df["pop"].to_numpy()
    pop_total = sum(float(p) for p in pops if p and not (isinstance(p, float) and math.isnan(p)) and p > 0)
    if pop_total <= 0:
        return out
    for stem, label in RAW_INDICATORS.items():
        if stem not in sub_df.columns:
            continue
        vals = sub_df[stem].to_numpy()
        num = 0.0
        den = 0.0
        for v, p in zip(vals, pops):
            if v is None or (isinstance(v, float) and math.isnan(v)):
                continue
            if p is None or (isinstance(p, float) and math.isnan(p)) or p <= 0:
                continue
            num += float(v) * float(p)
            den += float(p)
        if den <= 0:
            continue
        weighted_mean = num / den
        cdf = _build_national_cdf(stem)
        pct = _percentile_in_cdf(weighted_mean, cdf)
        out.append(EJPercentile(label=label, pct_us=pct))
    return out


def aggregate_state_percentiles(state_abbr: str) -> list[EJPercentile]:
    df = _load_blockgroupstats()
    sub = df[df["ST"] == state_abbr.upper()]
    return _aggregate_percentile_rows(sub)


def aggregate_county_percentiles(state_abbr: str) -> dict[str, list[EJPercentile]]:
    """Return per-county percentile lists keyed by 5-digit county FIPS."""
    df = _load_blockgroupstats()
    sub = df[df["ST"] == state_abbr.upper()].copy()
    if len(sub) == 0:
        return {}
    sub["_cfips"] = sub["bgfips"].astype(str).str[:5]
    out: dict[str, list[EJPercentile]] = {}
    for cfips, group in sub.groupby("_cfips"):
        if not cfips or len(cfips) < 5:
            continue
        out[cfips] = _aggregate_percentile_rows(group)
    return out


def aggregate_places_percentiles(
    state_abbr: str,
    bg_to_place: dict[str, str],
) -> dict[str, list[EJPercentile]]:
    """Return per-place percentile lists keyed by 7-digit place FIPS.

    bg_to_place: same {bgfips: place_fips} map used for disparity scores —
    built once by spatial.places.build_bg_to_place().
    """
    df = _load_blockgroupstats()
    sub = df[df["ST"] == state_abbr.upper()].copy()
    if len(sub) == 0:
        return {}
    sub["_pf"] = sub["bgfips"].astype(str).map(bg_to_place)
    sub = sub[sub["_pf"].notna()]
    out: dict[str, list[EJPercentile]] = {}
    for pf, group in sub.groupby("_pf"):
        if not pf:
            continue
        out[pf] = _aggregate_percentile_rows(group)
    return out
