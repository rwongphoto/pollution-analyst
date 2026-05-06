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
# fips → full Census COUNTYNAME (e.g. "Aleutians East Borough", "Acadia
# Parish", "Los Angeles County"). Lets callers display the native suffix
# instead of the auto-appended " County" we used to glue on.
_canonical_full_by_fips: dict[str, str] = {}


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


_CANONICAL_SUFFIXES = (
    " COUNTY",
    " PARISH",
    " CITY AND BOROUGH",  # checked before " BOROUGH" so "JUNEAU CITY AND BOROUGH"
    " BOROUGH",           # fully strips instead of leaving "JUNEAU CITY AND".
    " CENSUS AREA",
    " MUNICIPALITY",
    " MUNICIPIO",
)


def _normalize_county(name: str) -> str:
    """Normalize TRI bulk county names to match Census's COUNTYNAME column.

    TRI uses bare uppercase ("LOS ANGELES"); Census uses title-case with
    "County" suffix ("Los Angeles County"). Some special names: City and
    Borough (AK), Parish (LA), Census Area (AK), Municipio (PR).

    EPA's TRI bulk CSV historically capped the county column at 25 chars,
    producing truncated forms like "ALEUTIANS WEST CENSUS ARE" or
    "FAIRBANKS NORTH STAR BORO". Those still need to map to the canonical
    Census name, so we have a 25-char fallback that strips a truncated
    prefix of any canonical suffix.
    """
    s = (name or "").strip().upper()
    for suffix in _CANONICAL_SUFFIXES:
        if s.endswith(suffix):
            return s[: -len(suffix)].strip()
    # 25-char-truncation fallback (EPA TRI bulk historical export quirk).
    # Only apply when the input is exactly 25 chars to avoid false positives
    # on shorter names that happen to end with a substring like " BORO".
    if len(s) == 25:
        for suffix in _CANONICAL_SUFFIXES:
            # Try every prefix of the suffix, longest first, length >=3 to
            # avoid matching e.g. trailing " C" or " B" from unrelated names.
            for cut in range(len(suffix) - 1, 2, -1):
                partial = suffix[:cut]
                if s.endswith(partial):
                    return s[: -len(partial)].strip()
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
            _canonical_full_by_fips[fips] = county_name.strip()


def lookup_fips(state_abbr: str, county_name: str) -> str | None:
    """Return the 5-digit FIPS for (state, county). None if unknown."""
    _load_table()
    return _cache.get((state_abbr.upper(), _normalize_county(county_name)))


def lookup_county_canonical(state_abbr: str, county_name: str) -> str | None:
    """Return the canonical Census county name *without its suffix* (e.g.
    'Los Angeles' for 'LOS ANGELES COUNTY'). Used by callers that want to
    re-attach " County" themselves. Most callers want lookup_canonical_full
    instead — that returns the native suffix (Borough / Parish / etc.).
    """
    _load_table()
    state_abbr = state_abbr.upper()
    normalized = _normalize_county(county_name)
    if (state_abbr, normalized) not in _cache:
        return None
    return normalized.title()


def lookup_canonical_full(state_abbr: str, county_name: str) -> str | None:
    """Return the full Census COUNTYNAME with its native suffix
    ('Aleutians East Borough', 'Acadia Parish', 'Los Angeles County').
    Resolves the (state, raw) input through the same normalization as
    lookup_fips, so EPA-style truncations and casing variants all map to
    the canonical Census form.
    """
    fips = lookup_fips(state_abbr, county_name)
    if not fips:
        return None
    return _canonical_full_by_fips.get(fips)


def lookup_canonical_full_by_fips(fips: str) -> str | None:
    """Like lookup_canonical_full but keyed on FIPS directly. Used by the
    GHGRP/AQS/AirToxScreen-only path where TRI didn't supply a name."""
    _load_table()
    return _canonical_full_by_fips.get(fips)
