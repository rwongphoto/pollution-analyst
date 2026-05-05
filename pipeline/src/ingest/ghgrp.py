"""GHGRP ingest from EPA Envirofacts.

Pulls greenhouse-gas emissions reported under the Greenhouse Gas Reporting
Program (Subpart A facilities and below). Each row is one
(facility, year, sector, subsector, gas) combination with a CO2e emission
in metric tons.

Aggregates to state and county levels for the pathway tiles. Facility-level
GHG isn't surfaced yet (TRI is the facility-level emission story for now).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from ..states import State
from ._envirofacts import fetch_all_paginated, get_count, is_year_cached

log = logging.getLogger(__name__)


@dataclass
class GhgRow:
    facility_id: int
    facility_name: str
    state_county_fips: str
    year: int
    co2e_emission: float


def fetch_state_year(state: State, year: int, cache_only: bool = False) -> list[GhgRow]:
    """Pull CA + year joined rows. Each row = one (facility × sector × subsector × gas).
    We sum at aggregate time."""
    base_segs = [
        "PUB_DIM_FACILITY", "STATE", "=", state.abbr,
        "PUB_FACTS_SECTOR_GHG_EMISSION", "year", "=", str(year),
    ]
    cache_key = f"ghgrp_join_{state.abbr.lower()}_{year}"
    if cache_only and not is_year_cached(cache_key):
        return []
    expected = (
        get_count(base_segs, cache_key=cache_key + "_count") if not cache_only else None
    )
    log.info("GHGRP %s %d: fetching %d joined rows%s",
             state.abbr, year, expected or -1, " (cache-only)" if cache_only else "")
    raw = fetch_all_paginated(
        base_segs, cache_key=cache_key,
        expected_total=expected, cache_only=cache_only,
    )
    out: list[GhgRow] = []
    for r in raw:
        co2e = r.get("co2e_emission")
        if co2e is None:
            continue
        try:
            co2e_v = float(co2e)
        except (TypeError, ValueError):
            continue
        if co2e_v <= 0:
            continue
        try:
            fid = int(r.get("facility_id"))
        except (TypeError, ValueError):
            continue
        out.append(
            GhgRow(
                facility_id=fid,
                facility_name=str(r.get("facility_name") or "").strip(),
                state_county_fips=str(r.get("county_fips") or "").strip(),
                year=int(r.get("year") or 0),
                co2e_emission=co2e_v,
            )
        )
    log.info("GHGRP %s %d: kept %d rows with positive emissions", state.abbr, year, len(rows := out))
    return rows


def aggregate_state_total(rows: list[GhgRow]) -> float:
    return sum(r.co2e_emission for r in rows)


def aggregate_county_totals(rows: list[GhgRow]) -> dict[str, float]:
    out: dict[str, float] = {}
    for r in rows:
        if not r.state_county_fips:
            continue
        out[r.state_county_fips] = out.get(r.state_county_fips, 0.0) + r.co2e_emission
    return out
