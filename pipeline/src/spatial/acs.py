"""Census ACS lookups (population + demographic shares).

Used by publish to fill the equity overlay's demographic tiles when EPA's
EJScreen is unavailable (deprecated 2025) — we go to the underlying ACS
source directly.

API key not required for the call volumes we need.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

import httpx

from ..config import RAW_ROOT

log = logging.getLogger(__name__)

# Most-recent ACS 5-year vintage. Census publishes this in early winter for
# the prior year. 2022 5-year covers 2018-2022.
ACS_YEAR = 2022
ACS_BASE = f"https://api.census.gov/data/{ACS_YEAR}/acs/acs5"
ACS_PROFILE = f"https://api.census.gov/data/{ACS_YEAR}/acs/acs5/profile"
USER_AGENT = "PollutionAnalystAi/0.1 (+contact: ops@pollutionanalyst.ai)"


@dataclass
class Demographics:
    """Population + demographic shares for a single geography."""
    population: int
    pct_low_income: float | None       # poverty rate (households < poverty)
    pct_people_of_color: float | None  # 100 - pct(white alone, non-hispanic)
    pct_under_5: float | None
    pct_over_64: float | None


def _cache_path(state_fips: str, kind: str) -> Path:
    return RAW_ROOT / "acs" / f"{kind}_{state_fips}_{ACS_YEAR}.json"


def get_county_populations(state_fips: str) -> dict[str, int]:
    """Return {5-digit FIPS: population} for every county in the state."""
    state_fips = state_fips.zfill(2)
    cache = _cache_path(state_fips, "county_pop")
    if cache.exists():
        return {k: int(v) for k, v in json.loads(cache.read_text()).items()}

    url = f"{ACS_BASE}?get=NAME,B01001_001E&for=county:*&in=state:{state_fips}"
    log.info("ACS: fetching county populations for state FIPS %s", state_fips)
    with httpx.Client(timeout=60.0, headers={"User-Agent": USER_AGENT}) as client:
        r = client.get(url)
        r.raise_for_status()
    rows = r.json()
    if not rows or len(rows) < 2:
        return {}
    out: dict[str, int] = {}
    for row in rows[1:]:
        try:
            _name, pop, state_code, county_code = row
            fips = f"{state_code}{county_code}"
            out[fips] = int(pop)
        except (ValueError, KeyError):
            continue
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(out))
    return out


# ---- Demographic profile (state + counties) -----------------------------
# DP05_0001E — Total population
# DP05_0006PE — Pct under 5
# DP05_0024PE — Pct 65 and over
# DP05_0079PE — Pct white alone, non-Hispanic (POC = 100 - this)
# DP03_0128PE — Pct of households below poverty (low-income proxy)

_PROFILE_VARS = "DP05_0001E,DP05_0006PE,DP05_0024PE,DP05_0079PE,DP03_0128PE"


def _parse_profile_row(row: list) -> Demographics:
    _name, pop, under5, over64, white_nh, low_income = row[:6]
    def _f(x):
        try:
            v = float(x)
            return v if v >= 0 else None  # Census uses negatives for "not applicable"
        except (TypeError, ValueError):
            return None
    pop_i = int(pop) if pop and pop != "null" else 0
    poc = (100 - _f(white_nh)) if _f(white_nh) is not None else None
    return Demographics(
        population=pop_i,
        pct_low_income=_f(low_income),
        pct_people_of_color=poc,
        pct_under_5=_f(under5),
        pct_over_64=_f(over64),
    )


def get_state_demographics(state_fips: str) -> Demographics | None:
    state_fips = state_fips.zfill(2)
    cache = _cache_path(state_fips, "state_demo")
    if cache.exists():
        d = json.loads(cache.read_text())
        return Demographics(**d)
    url = f"{ACS_PROFILE}?get=NAME,{_PROFILE_VARS}&for=state:{state_fips}"
    log.info("ACS: fetching state demographics for FIPS %s", state_fips)
    with httpx.Client(timeout=60.0, headers={"User-Agent": USER_AGENT}) as client:
        r = client.get(url)
        r.raise_for_status()
    rows = r.json()
    if not rows or len(rows) < 2:
        return None
    demo = _parse_profile_row(rows[1])
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(demo.__dict__))
    return demo


def get_county_demographics(state_fips: str) -> dict[str, Demographics]:
    state_fips = state_fips.zfill(2)
    cache = _cache_path(state_fips, "county_demo")
    if cache.exists():
        d = json.loads(cache.read_text())
        return {k: Demographics(**v) for k, v in d.items()}
    url = f"{ACS_PROFILE}?get=NAME,{_PROFILE_VARS}&for=county:*&in=state:{state_fips}"
    log.info("ACS: fetching county demographics for state FIPS %s", state_fips)
    with httpx.Client(timeout=60.0, headers={"User-Agent": USER_AGENT}) as client:
        r = client.get(url)
        r.raise_for_status()
    rows = r.json()
    if not rows or len(rows) < 2:
        return {}
    out: dict[str, Demographics] = {}
    # rows[0] is header. Trailing 2 cols are state + county codes.
    for row in rows[1:]:
        demo = _parse_profile_row(row)
        try:
            state_code, county_code = row[-2], row[-1]
            fips = f"{state_code}{county_code}"
            out[fips] = demo
        except (ValueError, IndexError):
            continue
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps({k: v.__dict__ for k, v in out.items()}))
    return out
