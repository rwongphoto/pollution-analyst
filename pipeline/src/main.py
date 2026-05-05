"""Pipeline CLI entrypoint.

Usage:
    python -m pipeline.src.main run --state ca --year 2023 [--history-from 2010]
    python -m pipeline.src.main run --all-states --year 2023

The first iteration only knows about TRI; SDWIS / EJScreen ingest hooks land
later. Run from the repo root with the venv active so config.DATA_ROOT
resolves correctly.
"""

from __future__ import annotations

import argparse
import logging
import sys

from . import states as states_mod
from .aggregate.build import StateAgg, UtilityAgg, aggregate, aggregate_utilities
from .config import DEFAULT_TRI_YEAR
from .ingest import ejscreen, ghgrp, sdwis, tri
from .publish import site as publish_site
from .spatial.acs import (
    get_county_demographics,
    get_county_populations,
    get_state_demographics,
)


def _county_name_from_fips(fips: str, state_abbr: str) -> str | None:
    """Reverse-lookup a county name from its FIPS via the cached Census table."""
    from .spatial.county_fips import _load_table, _cache  # noqa: SLF001
    _load_table()
    state_abbr = state_abbr.upper()
    for (st, name_norm), f in _cache.items():
        if st == state_abbr and f == fips:
            return name_norm.title()
    return None


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def run_state(
    state_slug: str,
    year: int,
    history_from: int | None = None,
    sdwis_since_year: int | None = 2020,
    skip_sdwis: bool = False,
    history_cache_only: bool = False,
) -> tuple[StateAgg, dict, dict, dict[str, UtilityAgg]]:
    state = states_mod.get(state_slug)

    # --- TRI ---
    rows = tri.fetch_state_year(state, year)
    if not rows:
        raise RuntimeError(f"No TRI rows for {state.abbr} {year}")
    chem_info = tri.chem_info_from_rows(rows)
    state_agg, counties, facilities = aggregate(rows, chem_info, state.slug, year)

    history: dict[int, float] = {year: state_agg.pounds_total}
    # Per-medium state totals across years. Drives the AIR / WATER / LAND
    # pathway tiles on the state and county pages.
    medium_history: dict[str, dict[int, float]] = {
        "AIR": {year: state_agg.pounds_air},
        "WATER": {year: state_agg.pounds_water},
        "LAND": {year: state_agg.pounds_land},
    }
    # Per-county histories — total + per-medium.
    county_history: dict[str, dict[int, float]] = {
        fips: {year: c.pounds_total} for fips, c in counties.items()
    }
    county_medium_history: dict[str, dict[str, dict[int, float]]] = {
        fips: {
            "AIR": {year: c.pounds_air},
            "WATER": {year: c.pounds_water},
            "LAND": {year: c.pounds_land},
        }
        for fips, c in counties.items()
    }
    # Per-facility-chemical history (total only — medium split happens at
    # the facility-level totals via aggregate.FacilityAgg already).
    chem_history: dict[str, dict[str, dict[int, float]]] = {
        fid: {cid: dict(chem.history) for cid, chem in f.chemicals.items()}
        for fid, f in facilities.items()
    }

    if history_from is not None:
        for y in range(history_from, year):
            try:
                rows_y = tri.fetch_state_year(state, y, cache_only=history_cache_only)
            except Exception as exc:  # noqa: BLE001
                logging.warning("history pull failed for %d: %s", y, exc)
                continue
            if not rows_y:
                if history_cache_only:
                    logging.info("history year %d not cached — skipped", y)
                continue
            # Aggregate the year's rows so we can extract county + facility-chem totals
            try:
                state_y, counties_y, facilities_y = aggregate(rows_y, {}, state.slug, y)
            except Exception as exc:  # noqa: BLE001
                logging.warning("history aggregate failed for %d: %s", y, exc)
                continue
            history[y] = state_y.pounds_total
            medium_history["AIR"][y] = state_y.pounds_air
            medium_history["WATER"][y] = state_y.pounds_water
            medium_history["LAND"][y] = state_y.pounds_land
            for fips, c_y in counties_y.items():
                county_history.setdefault(fips, {})[y] = c_y.pounds_total
                cm = county_medium_history.setdefault(fips, {"AIR": {}, "WATER": {}, "LAND": {}})
                cm["AIR"][y] = c_y.pounds_air
                cm["WATER"][y] = c_y.pounds_water
                cm["LAND"][y] = c_y.pounds_land
            for fid, f_y in facilities_y.items():
                fac_chems = chem_history.setdefault(fid, {})
                for cid, chem_y in f_y.chemicals.items():
                    fac_chems.setdefault(cid, {})[y] = chem_y.pounds_total

    # --- SDWIS ---
    utilities: dict[str, UtilityAgg] = {}
    utility_county_map: dict[str, str] = {}  # pwsid -> county_fips
    if not skip_sdwis:
        try:
            systems = sdwis.fetch_active_cws(state)
            violations = sdwis.fetch_violations(state, since_year=sdwis_since_year)
            utilities = aggregate_utilities(systems, violations, state.slug)
        except Exception as exc:  # noqa: BLE001
            logging.warning("SDWIS ingest failed for %s: %s", state.abbr, exc)
        try:
            from .spatial.county_fips import lookup_fips
            county_names = sdwis.fetch_utility_counties(state)
            for pwsid, county_name in county_names.items():
                fips = lookup_fips(state.abbr, county_name)
                if fips:
                    utility_county_map[pwsid] = fips
            logging.info("SDWIS %s: resolved %d/%d utility counties to FIPS",
                         state.abbr, len(utility_county_map), len(county_names))
        except Exception as exc:  # noqa: BLE001
            logging.warning("SDWIS county lookup failed for %s: %s", state.abbr, exc)

    # --- Census ACS (populations + demographic shares) ---
    try:
        county_pops = get_county_populations(state.fips)
    except Exception as exc:  # noqa: BLE001
        logging.warning("ACS population fetch failed for %s: %s", state.abbr, exc)
        county_pops = {}
    try:
        state_demo = get_state_demographics(state.fips)
    except Exception as exc:  # noqa: BLE001
        logging.warning("ACS state demographics failed for %s: %s", state.abbr, exc)
        state_demo = None
    try:
        county_demos = get_county_demographics(state.fips)
    except Exception as exc:  # noqa: BLE001
        logging.warning("ACS county demographics failed for %s: %s", state.abbr, exc)
        county_demos = {}

    # --- GHGRP (greenhouse gas emissions) ---
    ghg_state_history: dict[int, float] = {}
    ghg_county_history: dict[str, dict[int, float]] = {}
    ghg_years = [year]
    if history_from is not None:
        ghg_years = list(range(history_from, year + 1))
    for y in ghg_years:
        try:
            ghg_rows = ghgrp.fetch_state_year(state, y, cache_only=history_cache_only)
        except Exception as exc:  # noqa: BLE001
            logging.warning("GHGRP fetch failed for %s %d: %s", state.abbr, y, exc)
            continue
        if not ghg_rows:
            continue
        ghg_state_history[y] = ghgrp.aggregate_state_total(ghg_rows)
        for fips, co2e in ghgrp.aggregate_county_totals(ghg_rows).items():
            ghg_county_history.setdefault(fips, {})[y] = co2e

    # --- EJScreen disparity scores (state + per-county) ---
    try:
        state_disparity = ejscreen.aggregate_state(state.abbr)
    except Exception as exc:  # noqa: BLE001
        logging.warning("EJScreen state aggregate failed for %s: %s", state.abbr, exc)
        state_disparity = []
    try:
        county_disparity = ejscreen.aggregate_counties(state.abbr)
    except Exception as exc:  # noqa: BLE001
        logging.warning("EJScreen county aggregate failed for %s: %s", state.abbr, exc)
        county_disparity = {}

    # --- Publish ---
    publish_site.publish_state(
        state, state_agg, counties, facilities, year,
        history=history, utilities=utilities,
        county_history=county_history, chem_history=chem_history,
        medium_history=medium_history,
        county_populations=county_pops,
        demographics=state_demo,
        disparity_scores=state_disparity,
        ghg_history=ghg_state_history,
    )
    for c in counties.values():
        in_county = [f for f in facilities.values() if f.county_fips == c.fips]
        publish_site.publish_county(
            c, in_county, year,
            history=county_history.get(c.fips),
            facilities_chem_history=chem_history,
            medium_history=county_medium_history.get(c.fips),
            population=county_pops.get(c.fips, 0),
            demographics=county_demos.get(c.fips),
            disparity_scores=county_disparity.get(c.fips, []),
            ghg_history=ghg_county_history.get(c.fips),
        )
    for f in facilities.values():
        publish_site.publish_facility(
            f, year,
            chem_history=chem_history.get(f.facility_id),
            county_demographics=county_demos.get(f.county_fips),
            county_disparity_scores=county_disparity.get(f.county_fips, []),
            county_population=county_pops.get(f.county_fips, 0),
        )
    for u in utilities.values():
        cfips = utility_county_map.get(u.pwsid)
        publish_site.publish_city(
            u,
            state_demographics=state_demo,
            state_disparity_scores=state_disparity,
            state_population=state.population,
            state_label=state.name,
            county_fips=cfips,
            county_demographics=county_demos.get(cfips) if cfips else None,
            county_disparity_scores=county_disparity.get(cfips, []) if cfips else None,
            county_population=county_pops.get(cfips, 0) if cfips else 0,
            county_name=_county_name_from_fips(cfips, state.abbr) if cfips else None,
        )

    return state_agg, counties, facilities, utilities


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    p = argparse.ArgumentParser(prog="pollution-pipeline")
    sub = p.add_subparsers(dest="cmd", required=True)
    runp = sub.add_parser("run", help="Run TRI ingest + publish for a state-year")
    runp.add_argument("--state", required=False, help="state slug (e.g. ca)")
    runp.add_argument("--all-states", action="store_true")
    runp.add_argument("--year", type=int, default=DEFAULT_TRI_YEAR)
    runp.add_argument("--history-from", type=int, default=None,
                      help="Pull state-level totals back to this year for the long-arc chart.")
    runp.add_argument("--skip-sdwis", action="store_true",
                      help="Skip SDWIS ingest (TRI only).")
    runp.add_argument("--sdwis-since", type=int, default=2020,
                      help="Earliest year of SDWIS violations to keep.")
    runp.add_argument("--history-cache-only", action="store_true",
                      help="For --history-from, skip any year not already in data/raw/envirofacts/. "
                           "Useful when EPA is slow.")

    args = p.parse_args(argv)
    if args.cmd != "run":
        p.print_help()
        return 1

    targets = states_mod.all_slugs() if args.all_states else [args.state]
    if not all(targets):
        p.error("--state SLUG or --all-states required")

    state_aggs: dict = {}
    counties_by_state: dict = {}
    facilities_by_state: dict = {}
    utilities_by_state: dict = {}
    for slug in targets:
        sa, counties, facilities, utilities = run_state(
            slug, args.year, args.history_from,
            sdwis_since_year=args.sdwis_since,
            skip_sdwis=args.skip_sdwis,
            history_cache_only=args.history_cache_only,
        )
        state_aggs[slug] = sa
        counties_by_state[slug] = counties
        facilities_by_state[slug] = facilities
        utilities_by_state[slug] = utilities

    publish_site.publish_home(
        states=[states_mod.get(s) for s in targets],
        state_aggs=state_aggs,
        facilities_by_state=facilities_by_state,
        counties_by_state=counties_by_state,
        year=args.year,
        utilities_by_state=utilities_by_state,
    )
    logging.info("done — published JSON under data/published/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
