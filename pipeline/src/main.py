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
from .flags import (
    Flag,
    calibrate as flags_calibrate,
    detect_ghg_step,
    detect_long_arc_facility,
    detect_long_arc_geo,
    detect_release_shifts,
    detect_violation_events,
    summarize as flags_summarize,
)
from .ingest import ejscreen, ghgrp, sdwis, tri
from .publish import site as publish_site
from .spatial.acs import (
    get_county_demographics,
    get_county_populations,
    get_place_demographics,
    get_state_demographics,
)
from .spatial.places import assign_facilities_to_places, build_bg_to_place, load_places


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
    no_flags: bool = False,
) -> tuple[StateAgg, dict, dict, dict[str, UtilityAgg], dict]:
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

    # --- EJScreen disparity scores (state + per-county + per-place) ---
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
    try:
        bg_to_place = build_bg_to_place(state.fips)
        place_disparity = ejscreen.aggregate_places(state.abbr, bg_to_place)
    except Exception as exc:  # noqa: BLE001
        logging.warning("EJScreen place aggregate failed for %s: %s", state.abbr, exc)
        place_disparity = {}
    try:
        place_demos = get_place_demographics(state.fips)
    except Exception as exc:  # noqa: BLE001
        logging.warning("ACS place demographics failed for %s: %s", state.abbr, exc)
        place_demos = {}
    try:
        place_pairs = load_places(state.fips)
        place_name_to_fips: dict[str, str] = {}
        place_fips_to_name: dict[str, str] = {}
        for p, _ in place_pairs:
            place_name_to_fips[p.name.upper()] = p.fips
            place_fips_to_name[p.fips] = p.name
    except Exception as exc:  # noqa: BLE001
        logging.warning("Place name index failed for %s: %s", state.abbr, exc)
        place_name_to_fips = {}
        place_fips_to_name = {}

    # --- Flags (anomaly engine) ---
    # Detected per-entity here, between aggregate and publish, so each
    # publish_* call writes the resulting Flag list into its JSON. Calibration
    # logging on the side records counts per geography to flag misconfigured
    # thresholds.
    state_flags: list[Flag] = []
    county_flags: dict[str, list[Flag]] = {}
    facility_flags_map: dict[str, list[Flag]] = {}
    utility_flags: dict[str, list[Flag]] = {}
    if not no_flags:
        # State long-arc on TRI total + per-medium + GHG.
        for label, hist, units in [
            ("Total TRI releases", history, "lb"),
            ("TRI air releases", medium_history.get("AIR"), "lb"),
            ("TRI water releases", medium_history.get("WATER"), "lb"),
            ("TRI land + off-site releases", medium_history.get("LAND"), "lb"),
            ("Greenhouse gas emissions", ghg_state_history, "mtCO2e"),
        ]:
            f = detect_long_arc_geo(
                hist, label=label, pathway_units=units,
                geography=state.name, recent_year=year,
            )
            if f is not None:
                state_flags.append(f)
        flags_summarize("state", state.slug, state_flags)
        # County long-arc on total + GHG, plus county-level ghg_step (the
        # only level v1 emits ghg_step at).
        for c in counties.values():
            cf: list[Flag] = []
            cname = c.name + " County" if not c.name.endswith("County") else c.name
            for label, hist, units in [
                ("Total TRI releases", county_history.get(c.fips), "lb"),
                ("Greenhouse gas emissions", ghg_county_history.get(c.fips), "mtCO2e"),
            ]:
                f = detect_long_arc_geo(
                    hist, label=label, pathway_units=units,
                    geography=cname, recent_year=year,
                )
                if f is not None:
                    cf.append(f)
            ghg = detect_ghg_step(
                ghg_history=ghg_county_history.get(c.fips),
                geography_label=cname, recent_year=year,
            )
            if ghg is not None:
                cf.append(ghg)
            if cf:
                county_flags[c.fips] = cf
                flags_summarize("county", f"{state.slug}/{c.fips}", cf)
        # Facility long-arc + release_shift.
        for f in facilities.values():
            fac_chem_hist = chem_history.get(f.facility_id, {})
            chem_names = {cid: ch.chemical for cid, ch in f.chemicals.items()}
            # Synthesise facility-total history from the per-chem histories.
            fac_total_hist: dict[int, float] = {}
            for cid_hist in fac_chem_hist.values():
                for y, v in cid_hist.items():
                    fac_total_hist[y] = fac_total_hist.get(y, 0.0) + v
            ff: list[Flag] = []
            ff.extend(detect_long_arc_facility(
                fac_history=fac_total_hist,
                chem_histories=fac_chem_hist,
                chem_names=chem_names,
                facility_label=f.name,
                recent_year=year,
            ))
            ff.extend(detect_release_shifts(
                chem_histories=fac_chem_hist,
                chem_names=chem_names,
                facility_label=f.name,
                recent_year=year,
            ))
            if ff:
                facility_flags_map[f.facility_id] = ff
                flags_summarize("facility", f"{state.slug}/{f.facility_id}", ff)
        # Utility violation events.
        for u in utilities.values():
            uf = detect_violation_events(
                pwsid=u.pwsid, utility_label=u.name, violations=u.violations,
            )
            if uf:
                utility_flags[u.pwsid] = uf
                flags_summarize("utility", f"{state.slug}/{u.pwsid}", uf)

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
        flags=state_flags,
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
            flags=county_flags.get(c.fips, []),
        )
    facility_paths: set = set()
    for f in facilities.values():
        facility_paths.add(publish_site.publish_facility(
            f, year,
            chem_history=chem_history.get(f.facility_id),
            county_demographics=county_demos.get(f.county_fips),
            county_disparity_scores=county_disparity.get(f.county_fips, []),
            county_population=county_pops.get(f.county_fips, 0),
            flags=facility_flags_map.get(f.facility_id, []),
        ))

    # ---- Tier 1 entity: water utility (/water/[slug]) ------------------
    # The PWS *as an entity* — compliance posture, MCL detail, EPA SDWIS
    # deep-link. One per active CWS. Renamed from /city/[slug] to reflect
    # what the page actually is.
    water_paths: set = set()
    for u in utilities.values():
        cfips = utility_county_map.get(u.pwsid)
        place_fips = place_name_to_fips.get((u.city_name or "").strip().upper())
        water_paths.add(publish_site.publish_water(
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
            place_fips=place_fips,
            place_demographics=place_demos.get(place_fips) if place_fips else None,
            place_disparity_scores=place_disparity.get(place_fips, []) if place_fips else None,
            place_name=place_fips_to_name.get(place_fips) if place_fips else None,
            flags=utility_flags.get(u.pwsid, []),
        ))

    # ---- Tier 2 place: city hub (/city/[slug]) -------------------------
    # True place-anchored aggregation. TRI facilities in the city polygon +
    # utilities serving the city + GHG county-share + equity. Each utility
    # row links to /water/[slug] for the entity-level deep dive.
    fac_points = [(f.facility_id, f.lat, f.lng) for f in facilities.values()]
    try:
        place_to_facility_ids = assign_facilities_to_places(fac_points, state.fips)
    except Exception as exc:  # noqa: BLE001
        logging.warning("Place point-in-polygon failed for %s: %s", state.abbr, exc)
        place_to_facility_ids = {}
    # First pass: candidate utilities per place by SDWIS city_name match.
    # SDWIS city_name is unreliable on its own — it often records the operator's
    # billing/HQ city, not the service area. We filter by county in the second
    # pass below to drop matches like CA37/CA28/CA49 mobile-home parks landing
    # under "Stockton" because their operator is HQ'd there.
    place_to_utility_candidates: dict[str, list] = {}
    for u in utilities.values():
        pf = place_name_to_fips.get((u.city_name or "").strip().upper())
        if pf:
            place_to_utility_candidates.setdefault(pf, []).append(u)

    # Second pass: derive each place's canonical county and filter utilities to
    # that county. Priority for the canonical county:
    #   (a) majority county of facilities inside the place polygon — authoritative,
    #       comes from centroid containment, not free-text fields.
    #   (b) majority SDWIS county across the city_name candidates — only used when
    #       the place has zero in-polygon facilities (bedroom communities).
    from collections import Counter
    place_to_utilities: dict[str, list] = {}
    for pf in set(place_to_facility_ids.keys()) | set(place_to_utility_candidates.keys()):
        counts: Counter[str] = Counter()
        for fid in place_to_facility_ids.get(pf, []):
            f = facilities.get(fid)
            if f and f.county_fips:
                counts[f.county_fips] += 1
        if not counts:
            for u in place_to_utility_candidates.get(pf, []):
                cf = utility_county_map.get(u.pwsid)
                if cf:
                    counts[cf] += 1
        canonical = counts.most_common(1)[0][0] if counts else None
        if canonical:
            kept = [
                u for u in place_to_utility_candidates.get(pf, [])
                if utility_county_map.get(u.pwsid) == canonical
            ]
            if kept:
                place_to_utilities[pf] = kept
        else:
            # No county signal anywhere — keep candidates rather than drop
            cands = place_to_utility_candidates.get(pf, [])
            if cands:
                place_to_utilities[pf] = cands

    city_paths: set = set()
    # Build a city hub for any place with ≥1 facility or ≥1 (filtered) utility — places
    # with neither aren't worth a programmatic page.
    eligible_places = set(place_to_facility_ids.keys()) | set(place_to_utilities.keys())
    for pf in eligible_places:
        place_name = place_fips_to_name.get(pf)
        if not place_name:
            continue
        ids_in_place = place_to_facility_ids.get(pf, [])
        facs_in_place = [facilities[fid] for fid in ids_in_place if fid in facilities]
        utils_serving = place_to_utilities.get(pf, [])
        # County for this place — pick the county-of-the-first-facility, or
        # the SDWIS-resolved county of the first utility, else None.
        county_fips_for_place = None
        if facs_in_place:
            county_fips_for_place = facs_in_place[0].county_fips
        elif utils_serving:
            county_fips_for_place = utility_county_map.get(utils_serving[0].pwsid)
        place_pop = (
            place_demos.get(pf).population
            if pf in place_demos and hasattr(place_demos.get(pf), "population")
            else 0
        )
        city_paths.add(publish_site.publish_city_hub(
            state_slug=state.slug,
            place_fips=pf,
            place_name=place_name,
            place_slug=publish_site.place_slug(place_name, pf),
            facilities=facs_in_place,
            utilities=utils_serving,
            facilities_chem_history=chem_history,
            year=year,
            place_demographics=place_demos.get(pf),
            place_disparity_scores=place_disparity.get(pf, []),
            place_population=place_pop,
            county_name=_county_name_from_fips(county_fips_for_place, state.abbr) if county_fips_for_place else None,
            county_fips=county_fips_for_place,
            county_ghg_history=ghg_county_history.get(county_fips_for_place) if county_fips_for_place else None,
            flags=[],  # city-level flag detection deferred — same data shape as county for v2
        ))

    removed_fac = publish_site.cleanup_stale("facility", state.slug, facility_paths)
    removed_water = publish_site.cleanup_stale("water", state.slug, water_paths)
    removed_city = publish_site.cleanup_stale("city", state.slug, city_paths)
    if removed_fac or removed_water or removed_city:
        logging.info("cleanup: %s — removed %d facility, %d water, %d city files",
                     state.slug, removed_fac, removed_water, removed_city)

    flag_maps = {
        "state": state_flags,
        "counties": county_flags,
        "facilities": facility_flags_map,
        "utilities": utility_flags,
    }
    return state_agg, counties, facilities, utilities, flag_maps


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
    runp.add_argument("--no-flags", action="store_true",
                      help="Skip the anomaly engine. Pages render without 'Notable signals' "
                           "sections — useful for ingest-only dev runs.")

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
    facility_flags_by_state: dict = {}
    county_flags_by_state: dict = {}
    utility_flags_by_state: dict = {}
    state_flags_by_slug: dict = {}
    for slug in targets:
        sa, counties, facilities, utilities, flag_maps = run_state(
            slug, args.year, args.history_from,
            sdwis_since_year=args.sdwis_since,
            skip_sdwis=args.skip_sdwis,
            history_cache_only=args.history_cache_only,
            no_flags=args.no_flags,
        )
        state_aggs[slug] = sa
        counties_by_state[slug] = counties
        facilities_by_state[slug] = facilities
        utilities_by_state[slug] = utilities
        state_flags_by_slug[slug] = flag_maps["state"]
        county_flags_by_state[slug] = flag_maps["counties"]
        facility_flags_by_state[slug] = flag_maps["facilities"]
        utility_flags_by_state[slug] = flag_maps["utilities"]

    publish_site.publish_home(
        states=[states_mod.get(s) for s in targets],
        state_aggs=state_aggs,
        facilities_by_state=facilities_by_state,
        counties_by_state=counties_by_state,
        year=args.year,
        utilities_by_state=utilities_by_state,
        facility_flags=facility_flags_by_state,
        county_flags=county_flags_by_state,
        utility_flags=utility_flags_by_state,
    )

    if not args.no_flags:
        # Cross-state calibration roll-up — surfaces over-cap entities so
        # thresholds in pipeline/src/flags/ can be tightened on the next run.
        all_counts = {
            "state": [len(v) for v in state_flags_by_slug.values()],
            "county": [
                len(v) for fmap in county_flags_by_state.values() for v in fmap.values()
            ],
            "facility": [
                len(v) for fmap in facility_flags_by_state.values() for v in fmap.values()
            ],
            "utility": [
                len(v) for fmap in utility_flags_by_state.values() for v in fmap.values()
            ],
        }
        flags_calibrate(all_counts)

    logging.info("done — published JSON under data/published/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
