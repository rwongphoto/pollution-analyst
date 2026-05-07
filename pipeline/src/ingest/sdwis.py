"""SDWIS ingest from EPA Envirofacts.

Pulls Community Water Systems (CWS) and their violation records for a given
state. CWS are the residential-population utilities that drive "is the water
safe in [city]" search intent — TNCWS (transient: gas stations, rest stops)
and NTNCWS (non-transient non-community: schools, factories) are excluded.

Two tables joined client-side after pulling:
- WATER_SYSTEM:    metadata per pwsid (~3,000 active CWS in CA)
- VIOLATION:       compliance records (~76,000 historical for CA)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from ..states import State
from ._envirofacts import fetch_all_paginated, get_count

log = logging.getLogger(__name__)


@dataclass
class WaterSystem:
    pwsid: str
    name: str
    state: str
    population_served: int
    primary_source_code: str   # 'GW', 'SW', 'GWP', 'SWP', 'GU', etc.
    pws_type_code: str         # filtered to 'CWS' upstream
    owner_type_code: str       # 'L' local govt, 'M' mixed, 'N' tribal, 'P' private, 'S' state, 'F' federal
    city_name: str
    is_active: bool
    is_wholesaler: bool


@dataclass
class Violation:
    pwsid: str
    violation_id: str
    contaminant_code: str
    is_health_based: bool
    violation_category_code: str   # 'MCL', 'TT', 'MR', 'MON', 'RPT', etc.
    rule_code: str | None
    compl_per_begin_date: str | None  # ISO timestamp
    rtc_date: str | None
    public_notification_tier: int | None


# ---- Water-system fetch -------------------------------------------------

def fetch_active_cws(state: State) -> list[WaterSystem]:
    """Active Community Water Systems for the state."""
    base_segs = [
        "WATER_SYSTEM",
        "STATE_CODE", state.abbr,
        "PWS_TYPE_CODE", "CWS",
        "PWS_ACTIVITY_CODE", "A",
    ]
    cache_key = f"sdwis_water_system_{state.abbr.lower()}_active_cws"
    expected = get_count(base_segs, cache_key=cache_key + "_count")
    log.info("SDWIS %s: fetching %d active CWS", state.abbr, expected)
    raw = fetch_all_paginated(base_segs, cache_key=cache_key, expected_total=expected)

    out: list[WaterSystem] = []
    for r in raw:
        pwsid = str(r.get("pwsid") or "").strip()
        if not pwsid:
            continue
        try:
            pop = int(r.get("population_served_count") or 0)
        except (TypeError, ValueError):
            pop = 0
        out.append(
            WaterSystem(
                pwsid=pwsid,
                name=_clean(r.get("pws_name")),
                state=state.abbr,
                population_served=pop,
                primary_source_code=str(r.get("primary_source_code") or "").strip().upper(),
                pws_type_code=str(r.get("pws_type_code") or "").strip().upper(),
                owner_type_code=str(r.get("owner_type_code") or "").strip().upper(),
                city_name=_clean(r.get("city_name")),
                is_active=str(r.get("pws_activity_code") or "").upper() == "A",
                is_wholesaler=str(r.get("is_wholesaler_ind") or "").upper() == "Y",
            )
        )
    log.info("SDWIS %s: kept %d active CWS records", state.abbr, len(out))
    return out


# ---- Violation fetch ----------------------------------------------------

def fetch_utility_counties(state: State) -> dict[str, str]:
    """For each PWSID in the state, return its primary served county name.

    SDWIS GEOGRAPHIC_AREA table has a ``county_served`` field per PWSID;
    one record per PWS for active CWS. When multiple counties are listed
    we keep the first match.
    """
    base_segs = [
        "GEOGRAPHIC_AREA",
        "PRIMACY_AGENCY_CODE", state.abbr,
        "PWS_ACTIVITY_CODE", "A",
        "PWS_TYPE_CODE", "CWS",
    ]
    cache_key = f"sdwis_geo_area_{state.abbr.lower()}"
    expected = get_count(base_segs, cache_key=cache_key + "_count")
    log.info("SDWIS %s: fetching %d GEOGRAPHIC_AREA records", state.abbr, expected)
    raw = fetch_all_paginated(base_segs, cache_key=cache_key, expected_total=expected)
    out: dict[str, str] = {}
    for r in raw:
        pwsid = str(r.get("pwsid") or "").strip()
        county = (r.get("county_served") or "").strip()
        if pwsid and county and pwsid not in out:
            out[pwsid] = county
    log.info("SDWIS %s: %d utilities mapped to counties", state.abbr, len(out))
    return out


def fetch_violations(state: State, since_year: int | None = None) -> list[Violation]:
    """Pull all VIOLATION records for the state's primacy. Optionally filter
    in-memory to violations whose compliance period begins on/after
    ``since_year`` to keep page payloads bounded.
    """
    base_segs = ["VIOLATION", "PRIMACY_AGENCY_CODE", state.abbr]
    cache_key = f"sdwis_violation_{state.abbr.lower()}"
    expected = get_count(base_segs, cache_key=cache_key + "_count")
    log.info("SDWIS %s: fetching %d violation rows", state.abbr, expected)
    raw = fetch_all_paginated(base_segs, cache_key=cache_key, expected_total=expected)

    out: list[Violation] = []
    cutoff = datetime(since_year, 1, 1) if since_year else None
    for r in raw:
        begin = r.get("compl_per_begin_date")
        if cutoff and begin:
            try:
                if datetime.fromisoformat(str(begin)[:10]) < cutoff:
                    continue
            except ValueError:
                pass
        pn_tier = r.get("public_notification_tier")
        try:
            pn_int = int(pn_tier) if pn_tier is not None else None
        except (TypeError, ValueError):
            pn_int = None
        out.append(
            Violation(
                pwsid=str(r.get("pwsid") or "").strip(),
                violation_id=str(r.get("violation_id") or "").strip(),
                contaminant_code=str(r.get("contaminant_code") or "").strip(),
                is_health_based=str(r.get("is_health_based_ind") or "").upper() == "Y",
                violation_category_code=str(r.get("violation_category_code") or "").strip().upper(),
                rule_code=str(r.get("rule_code") or "").strip() or None,
                compl_per_begin_date=str(begin) if begin else None,
                rtc_date=str(r.get("rtc_date")) if r.get("rtc_date") else None,
                public_notification_tier=pn_int,
            )
        )
    log.info("SDWIS %s: kept %d violations after %s filter", state.abbr, len(out), since_year)
    return out


def _clean(s: Any) -> str:
    if not s:
        return ""
    return str(s).strip().title().replace("'S ", "'s ")
