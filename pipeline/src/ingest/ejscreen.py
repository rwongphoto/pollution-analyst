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
