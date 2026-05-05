"""US county FIPS lookup, sourced from Census Bureau's national county file.

Cached locally on first use; refreshed manually by deleting the cache file.
The TRI bulk CSV exposes county names but not FIPS codes — this module
maps (state_abbr, county_name) -> 5-digit FIPS for the publish layer.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx

from ..config import RAW_ROOT

# Census Bureau national county codes file (2020 vintage). Pipe-delimited.
# Format: STATE|STATEFP|COUNTYFP|COUNTYNS|COUNTYNAME|CLASSFP|FUNCSTAT
CENSUS_URL = "https://www2.census.gov/geo/docs/reference/codes2020/national_county2020.txt"

USER_AGENT = "PollutionAnalystAi/0.1 (+contact: ops@pollutionanalyst.ai)"

_cache: dict[tuple[str, str], str] = {}


def _cache_path() -> Path:
    return RAW_ROOT / "census_national_county2020.txt"


def _ensure_downloaded() -> Path:
    p = _cache_path()
    if p.exists():
        return p
    p.parent.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=60.0, headers={"User-Agent": USER_AGENT}) as client:
        r = client.get(CENSUS_URL)
        r.raise_for_status()
    p.write_text(r.text)
    return p


def _normalize_county(name: str) -> str:
    """Normalize TRI bulk county names to match Census's COUNTYNAME column.

    TRI uses bare uppercase ("LOS ANGELES"); Census uses title-case with
    "County" suffix ("Los Angeles County"). Some special names: City and
    Borough (AK), Parish (LA), Census Area (AK), Municipio (PR).
    """
    s = (name or "").strip().upper()
    # Strip common suffixes Census doesn't include in COUNTYNAME
    for suffix in (" COUNTY", " PARISH", " BOROUGH", " CENSUS AREA",
                   " CITY AND BOROUGH", " MUNICIPALITY", " MUNICIPIO"):
        if s.endswith(suffix):
            s = s[: -len(suffix)]
    return s.strip()


def _load_table() -> None:
    if _cache:
        return
    path = _ensure_downloaded()
    with path.open() as f:
        next(f)  # header
        for line in f:
            parts = line.rstrip("\n").split("|")
            if len(parts) < 5:
                continue
            state_abbr, statefp, countyfp, _, county_name = parts[:5]
            fips = f"{statefp}{countyfp}"
            normalized = _normalize_county(county_name)
            _cache[(state_abbr.upper(), normalized)] = fips


def lookup_fips(state_abbr: str, county_name: str) -> str | None:
    """Return the 5-digit FIPS for (state, county). None if unknown."""
    _load_table()
    return _cache.get((state_abbr.upper(), _normalize_county(county_name)))


def lookup_county_canonical(state_abbr: str, county_name: str) -> str | None:
    """Return the canonical Census county name (e.g. 'Los Angeles') for the
    raw TRI value. Useful when we want to display 'Los Angeles County'
    rather than the upstream 'LOS ANGELES'.
    """
    _load_table()
    state_abbr = state_abbr.upper()
    normalized = _normalize_county(county_name)
    if (state_abbr, normalized) not in _cache:
        return None
    return normalized.title()
