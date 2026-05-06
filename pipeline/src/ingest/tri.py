"""TRI ingest from EPA's Basic Data Files (bulk CSV downloads).

Replaces the earlier Envirofacts JSON-API approach. The bulk CSVs are EPA's
canonical TRI publication: ~100 columns per row, one row per
(facility, chemical, form), with all release media as columns. Pre-joined
and richer than the Envirofacts 3-table join.

URL pattern (one HTTP GET per state-year, no pagination):
    https://data.epa.gov/efservice/downloads/tri/mv_tri_basic_download/{year}_{state}/csv

The downloader caches the raw CSV at ``data/raw/tri_bulk/{state}_{year}.csv``
so re-runs are instant. ``cache_only=True`` returns an empty list rather
than hitting EPA — used by the multi-year history loop when we want to
re-aggregate from disk only.
"""

from __future__ import annotations

import csv
import io
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from ..config import RAW_ROOT
from ..spatial.county_fips import lookup_county_canonical, lookup_fips
from ..states import State

log = logging.getLogger(__name__)

USER_AGENT = "PollutionAnalystAi/0.1 (+contact: ops@pollutionanalyst.ai)"
BULK_BASE = "https://data.epa.gov/efservice/downloads/tri/mv_tri_basic_download"


@dataclass
class TriRow:
    """One release record per (facility, chemical, medium-bucket).

    Bulk CSV has each release medium in its own column; we expand back to
    one row per medium so the existing aggregate logic can sum naturally.
    """

    facility_id: str
    facility_name: str
    parent_company: str | None
    address: str
    city: str
    county_name: str
    state_county_fips: str        # 5-digit FIPS (e.g. '06037'); empty if unknown
    state_abbr: str
    lat: float | None
    lng: float | None
    naics_label: str | None        # NAICS code + sector label (now populated)
    cas_registry: str | None       # CAS RN (e.g. '71-43-2')
    chemical_name: str
    tri_chem_id: str
    is_carcinogen: bool
    is_pbt: bool
    is_caac: bool                   # Clean Air Act §112 HAP
    medium: str                    # 'AIR' | 'WATER' | 'LAND'
    pounds: float


# ---- Column groups -------------------------------------------------------
# Column names match the bulk CSV header verbatim (numeric prefix + label).

_AIR_COLS = ["51. 5.1 - FUGITIVE AIR", "52. 5.2 - STACK AIR"]
_WATER_COLS = ["53. 5.3 - WATER"]
# On-site land releases (5.4 underground sub-codes + 5.5 landfills /
# treatment / impoundment / other) plus off-site release total (col 88).
# Together with AIR and WATER this sums to TRI's canonical "Total Releases"
# metric (col 107). The bulk CSV's parent rollup columns (54, 57, 61) are
# always zero in practice — the data lives in their RCRA-specific child
# columns, so we sum the children directly. POTW transfers (col 68) are
# deliberately excluded; they're a separate wastewater-treatment category
# not counted in EPA's "Total Releases" framing.
_LAND_COLS = [
    "55. 5.4.1 - UNDERGROUND CL I",
    "56. 5.4.2 - UNDERGROUND C II-V",
    "58. 5.5.1A - RCRA C LANDFILL",
    "59. 5.5.1B - OTHER LANDFILLS",
    "60. 5.5.2 - LAND TREATMENT",
    "62. 5.5.3A - RCRA SURFACE IM",
    "63. 5.5.3B - OTHER SURFACE I",
    "64. 5.5.4 - OTHER DISPOSAL",
    "88. OFF-SITE RELEASE TOTAL",
]


# ---- Download / cache ----------------------------------------------------

def _cache_path(state_abbr: str, year: int) -> Path:
    return RAW_ROOT / "tri_bulk" / f"{state_abbr.upper()}_{year}.csv"


def _download(state_abbr: str, year: int) -> str:
    """Fetch the bulk CSV for a state-year. Caches on disk. Raises on HTTP error."""
    cache = _cache_path(state_abbr, year)
    if cache.exists():
        return cache.read_text()
    url = f"{BULK_BASE}/{year}_{state_abbr.upper()}/csv"
    cache.parent.mkdir(parents=True, exist_ok=True)
    log.info("TRI %s %d: downloading bulk CSV", state_abbr, year)
    with httpx.Client(timeout=300.0, headers={"User-Agent": USER_AGENT}) as client:
        r = client.get(url)
        r.raise_for_status()
    cache.write_text(r.text)
    return r.text


def _is_year_cached(state_abbr: str, year: int) -> bool:
    return _cache_path(state_abbr, year).exists()


# ---- Public API ----------------------------------------------------------

def fetch_state_year(state: State, year: int, cache_only: bool = False) -> list[TriRow]:
    """Return TriRow records for the state-year.

    ``cache_only=True`` returns [] for years not on disk rather than fetching.
    """
    if cache_only and not _is_year_cached(state.abbr, year):
        return []
    try:
        body = _download(state.abbr, year)
    except httpx.HTTPStatusError as exc:
        log.warning("TRI %s %d: bulk download failed: %s", state.abbr, year, exc)
        return []

    rows = list(_parse_csv(body, state))
    log.info("TRI %s %d: parsed %d release rows", state.abbr, year, len(rows))
    return rows


def chem_info_from_rows(rows: list[TriRow]) -> dict[str, dict[str, Any]]:
    """Build the chem_info dict shape expected by normalize/chemicals.py
    from already-parsed TriRow data. Replaces the prior fetch_chem_info()
    which pulled the TRI_CHEM_INFO table separately via Envirofacts.
    """
    out: dict[str, dict[str, Any]] = {}
    for r in rows:
        if not r.tri_chem_id or r.tri_chem_id in out:
            continue
        out[r.tri_chem_id] = {
            "tri_chem_id": r.tri_chem_id,
            "carc_ind": "1" if r.is_carcinogen else "0",
            "pbt_ind": "1" if r.is_pbt else "0",
            "caac_ind": "1" if r.is_caac else "0",
            "cas_registry_number": r.cas_registry,
        }
    return out


# Legacy compatibility shim — main.py used to call fetch_chem_info(chem_ids).
# Kept as a no-op that returns {} so an old-shape call doesn't crash;
# main.py should call chem_info_from_rows() instead.
def fetch_chem_info(_tri_chem_ids: set[str]) -> dict[str, dict[str, Any]]:
    return {}


# ---- CSV parsing ---------------------------------------------------------

def _parse_csv(body: str, state: State) -> list[TriRow]:
    """Parse the bulk CSV body into TriRow records, expanding media columns
    into one row per (facility, chemical, medium-bucket) with positive pounds.
    """
    reader = csv.DictReader(io.StringIO(body))
    out: list[TriRow] = []
    skipped_no_fips = 0

    for raw in reader:
        # Strip whitespace from keys (header has spaces around column names).
        row = {(k or "").strip(): v for k, v in raw.items()}

        facility_id = (row.get("3. FRS ID") or row.get("2. TRIFD") or "").strip()
        if not facility_id:
            continue
        raw_county = row.get("7. COUNTY") or ""
        fips = lookup_fips(state.abbr, raw_county) or ""
        if fips:
            # Use the canonical Census name (already suffix-stripped — no
            # " Parish" / " Borough" / " Census Area" — and matches the
            # canonical bare-county form used elsewhere in the pipeline).
            # Falls back to the raw upstream form if the cache disagrees,
            # which shouldn't happen since lookup_fips just succeeded.
            county_name = lookup_county_canonical(state.abbr, raw_county) or _title(raw_county)
        else:
            county_name = _title(raw_county)
            skipped_no_fips += 1

        air = _sum_cols(row, _AIR_COLS)
        water = _sum_cols(row, _WATER_COLS)
        land = _sum_cols(row, _LAND_COLS)
        if air <= 0 and water <= 0 and land <= 0:
            continue

        common = {
            "facility_id": facility_id,
            "facility_name": _title(row.get("4. FACILITY NAME")),
            "parent_company": _clean_parent(row),
            "address": (row.get("5. STREET ADDRESS") or "").strip(),
            "city": _title(row.get("6. CITY")),
            "county_name": county_name,
            "state_county_fips": fips,
            "state_abbr": state.abbr,
            "lat": _coerce(row.get("12. LATITUDE")),
            "lng": _coerce(row.get("13. LONGITUDE")),
            "naics_label": _naics_label(row),
            "cas_registry": _cas(row.get("40. CAS#")),
            "chemical_name": (row.get("37. CHEMICAL") or "").strip(),
            "tri_chem_id": (row.get("39. TRI CHEMICAL/COMPOUND ID") or "").strip(),
            "is_carcinogen": _yn(row.get("46. CARCINOGEN")),
            "is_pbt": _yn(row.get("47. PBT")),
            "is_caac": _yn(row.get("42. CLEAN AIR ACT CHEMICAL")),
        }
        for medium, pounds in (("AIR", air), ("WATER", water), ("LAND", land)):
            if pounds <= 0:
                continue
            out.append(TriRow(**common, medium=medium, pounds=pounds))

    if skipped_no_fips:
        log.info("TRI %s: %d rows had unmapped county names (FIPS empty)",
                 state.abbr, skipped_no_fips)
    return out


# ---- Field helpers -------------------------------------------------------

def _coerce(raw: Any) -> float | None:
    if raw is None or raw == "":
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _sum_cols(row: dict[str, str], cols: list[str]) -> float:
    total = 0.0
    for c in cols:
        v = row.get(c)
        if v in (None, ""):
            continue
        try:
            total += float(v)
        except (TypeError, ValueError):
            continue
    return total


def _yn(s: str | None) -> bool:
    return (s or "").strip().upper() == "YES"


def _cas(s: str | None) -> str | None:
    if not s:
        return None
    s = s.strip().lstrip("0")
    return s or None


def _naics_label(row: dict[str, str]) -> str | None:
    code = (row.get("30. PRIMARY NAICS") or "").strip()
    sector = (row.get("23. INDUSTRY SECTOR") or "").strip()
    if code and sector:
        return f"{code} · {sector}"
    if code:
        return code
    if sector:
        return sector
    return None


def _clean_parent(row: dict[str, str]) -> str | None:
    cand = (row.get("17. STANDARD PARENT CO NAME")
            or row.get("15. PARENT CO NAME")
            or "").strip()
    if cand in ("", "NA", "N/A", "0"):
        return None
    return _title(cand)


# ---- Title-case helper (carried over from prior implementation) ---------

_ACRONYMS = {
    "USA", "US", "INC", "LLC", "LP", "LTD", "CORP",
    "II", "III", "IV", "VI", "VII", "VIII", "IX", "PLC", "AG", "BV",
}


def _title(s: Any) -> str:
    if not s:
        return ""
    out: list[str] = []
    for w in str(s).strip().split():
        stripped = w.rstrip(".,")
        suffix = w[len(stripped):]
        if stripped.upper() in _ACRONYMS:
            out.append(stripped.upper() + suffix)
        else:
            out.append(w.title())
    return " ".join(out)
