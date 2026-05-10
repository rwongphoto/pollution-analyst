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
from .aggregate.build import (
    CountyAgg,
    StateAgg,
    SuperfundSiteAgg,
    UtilityAgg,
    aggregate,
    aggregate_superfund,
    aggregate_utilities,
)
from .config import DEFAULT_TRI_YEAR
from .flags import (
    Flag,
    calibrate as flags_calibrate,
    detect_ghg_step,
    detect_long_arc_facility,
    detect_long_arc_geo,
    detect_naaqs_exceedance,
    detect_release_shifts,
    detect_violation_events,
    summarize as flags_summarize,
)
from .ingest import airtoxscreen, aqs, cdc_places, ejscreen, ghgrp, sdwis, superfund, tri
from .publish import rankings as publish_rankings_mod
from .publish import search_index as publish_search_index_mod
from .publish import site as publish_site
from .spatial.acs import (
    get_county_demographics,
    get_county_populations,
    get_place_demographics,
    get_state_demographics,
)
from .spatial.facility_buffer import compute_facility_buffer_demographics
from .spatial.places import (
    assign_facilities_to_places,
    build_bg_to_place,
    build_place_to_county,
    load_places,
)


def _county_name_from_fips(fips: str, state_abbr: str) -> str | None:
    """Reverse-lookup the full canonical Census name (with native suffix)
    for a (state, fips) pair. Returns 'Aleutians East Borough', 'Acadia
    Parish', 'Los Angeles County'. Returns None when fips doesn't actually
    belong to state_abbr — that guards against a stray cross-state FIPS
    leaking into the wrong state's bucket from a non-TRI source."""
    from .spatial.county_fips import lookup_canonical_full_by_fips  # noqa: PLC0415
    return lookup_canonical_full_by_fips(state_abbr, fips)


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
    skip_aqs: bool = False,
    skip_airtox: bool = False,
    skip_health: bool = False,
    skip_superfund: bool = False,
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
    # Per-facility per-medium history. Drives the in-city pathway tiles on
    # the city hub (sum within-place to get place-level air/water/land
    # multi-year). State + county already have this captured separately.
    facility_medium_history: dict[str, dict[str, dict[int, float]]] = {
        fid: {
            "AIR": {year: f.pounds_air},
            "WATER": {year: f.pounds_water},
            "LAND": {year: f.pounds_land},
        }
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
                fac_med = facility_medium_history.setdefault(
                    fid, {"AIR": {}, "WATER": {}, "LAND": {}},
                )
                fac_med["AIR"][y] = f_y.pounds_air
                fac_med["WATER"][y] = f_y.pounds_water
                fac_med["LAND"][y] = f_y.pounds_land

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

    # --- Superfund (NPL sites) ---
    superfund_sites_agg: dict[str, SuperfundSiteAgg] = {}
    if not skip_superfund:
        try:
            sf_sites = superfund.fetch_npl_sites(state)
            sf_site_ids = {s.site_id for s in sf_sites}
            sf_conts = superfund.fetch_contaminants(sf_site_ids)
            superfund_sites_agg = aggregate_superfund(
                sf_sites, sf_conts,
                state_slug=state.slug, state_fips=state.fips,
            )
        except Exception as exc:  # noqa: BLE001
            logging.warning("Superfund ingest failed for %s: %s", state.abbr, exc)

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
    # Facility-level GHG history keyed by FRS ID. Drives the facility-level
    # ghg_step flag for TRI facilities whose FRS matches a GHGRP facility.
    ghg_facility_history: dict[str, dict[int, float]] = {}
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
        for frs_id, co2e in ghgrp.aggregate_facility_totals(ghg_rows).items():
            ghg_facility_history.setdefault(frs_id, {})[y] = co2e

    # --- AQS (criteria-air monitor readings) ---
    # State-level: per-metric annual mean across all in-state monitors.
    # County-level: per-metric annual mean across in-county monitors only.
    # Both keyed by metric_key ("pm25_annual" / "pm25_24hr" / "ozone_8hr" /
    # "no2_annual"). Counties without a regulatory monitor for a given metric
    # simply lack that key — the publish layer skips them rather than render
    # zero/blank tiles.
    air_state_history: dict[str, dict[int, float]] = {}
    air_county_history: dict[str, dict[str, dict[int, float]]] = {}
    if not skip_aqs:
        aqs_years = [year] if history_from is None else list(range(history_from, year + 1))
        for y in aqs_years:
            try:
                readings = aqs.fetch_state_year(state, y, cache_only=history_cache_only)
            except Exception as exc:  # noqa: BLE001
                logging.warning("AQS fetch failed for %s %d: %s", state.abbr, y, exc)
                continue
            if not readings:
                continue
            for metric_key, val in aqs.aggregate_state_year(readings).items():
                air_state_history.setdefault(metric_key, {})[y] = val
            for cfips, metric_map in aqs.aggregate_county_year(readings).items():
                county_bucket = air_county_history.setdefault(cfips, {})
                for metric_key, val in metric_map.items():
                    county_bucket.setdefault(metric_key, {})[y] = val

    # --- AirToxScreen (hazardous-air HAP exposure) ---
    # Single-vintage snapshot (2020 published 2024-2025); EPA's cadence is
    # ~3-4 years, not annual, so no per-year history. We emit the metric
    # value at the vintage year and let publish layer render a single point.
    # State-level: per-metric pop-weighted statewide block mean.
    # County-level: per-metric pop-weighted block mean within the county.
    # Both keyed by metric_key ("cancer_risk_total" / "formaldehyde_ambconc"
    # / "benzene_ambconc"). Counties not covered by the source (no in-state
    # rows) simply lack the keys and skip the pathway tile.
    airtox_state: dict[str, dict[int, float]] = {}
    airtox_county: dict[str, dict[str, dict[int, float]]] = {}
    if not skip_airtox:
        try:
            atx_readings = airtoxscreen.fetch_state_year(
                state, year=airtoxscreen.VINTAGE, cache_only=history_cache_only,
            )
        except Exception as exc:  # noqa: BLE001
            logging.warning("AirToxScreen fetch failed for %s: %s", state.abbr, exc)
            atx_readings = []
        if atx_readings:
            vintage = airtoxscreen.VINTAGE
            for metric_key, val in airtoxscreen.aggregate_state_year(atx_readings).items():
                airtox_state.setdefault(metric_key, {})[vintage] = val
            for cfips, metric_map in airtoxscreen.aggregate_county_year(atx_readings).items():
                county_bucket = airtox_county.setdefault(cfips, {})
                for metric_key, val in metric_map.items():
                    county_bucket.setdefault(metric_key, {})[vintage] = val

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

    # --- National percentile rankings (raw EJScreen indicators ranked
    # against the national distribution of all US block groups). Reads
    # blockgroupstats.rda from USEPA-clone/EJAM-open. Same geography
    # rollups as the disparity scores, but a different upstream file. ---
    try:
        state_percentiles = ejscreen.aggregate_state_percentiles(state.abbr)
    except Exception as exc:  # noqa: BLE001
        logging.warning("EJScreen state percentiles failed for %s: %s", state.abbr, exc)
        state_percentiles = []
    try:
        county_percentiles = ejscreen.aggregate_county_percentiles(state.abbr)
    except Exception as exc:  # noqa: BLE001
        logging.warning("EJScreen county percentiles failed for %s: %s", state.abbr, exc)
        county_percentiles = {}
    try:
        place_percentiles = ejscreen.aggregate_places_percentiles(state.abbr, bg_to_place)
    except Exception as exc:  # noqa: BLE001
        logging.warning("EJScreen place percentiles failed for %s: %s", state.abbr, exc)
        place_percentiles = {}
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

    # --- Superfund ↔ groundwater PWS linkage (3-mile buffer) ---
    # Has to land after both aggregate_superfund and aggregate_utilities,
    # plus place_name_to_fips, since it joins them spatially. Mutates
    # SuperfundSiteAgg.water_linkage in place.
    if superfund_sites_agg and utilities and place_name_to_fips:
        try:
            from .aggregate.build import attach_water_linkage
            attach_water_linkage(
                superfund_sites_agg, utilities,
                state_fips=state.fips,
                place_name_to_fips=place_name_to_fips,
                radius_miles=3.0,
            )
        except Exception as exc:  # noqa: BLE001
            logging.warning("Superfund water linkage failed for %s: %s", state.abbr, exc)

    # --- CDC PLACES (co-located health indicators) ---
    # Modeled small-area prevalence per county and Census place. Pulled
    # via Socrata-filtered subsets — ~120 KB / state for in-state
    # counties, ~3 MB for in-state places, ~6 MB for the nationwide
    # county pull that backs the US-mean comparator. ``health_county`` /
    # ``health_place`` map location_id → measure_key → PlacesReading.
    health_release_label = "CDC PLACES · 2025 release · BRFSS 2022-2023"
    health_county_by_loc: dict = {}
    health_place_by_loc: dict = {}
    health_state_means: dict[str, float] = {}
    health_us_means: dict[str, float] = {}
    if not skip_health:
        try:
            county_readings = cdc_places.fetch_state_counties(
                state, cache_only=history_cache_only,
            )
            health_county_by_loc = cdc_places.by_location(county_readings)
            health_state_means = (
                cdc_places.state_means_from_counties(county_readings).by_measure
            )
        except Exception as exc:  # noqa: BLE001
            logging.warning("CDC PLACES county fetch failed for %s: %s", state.abbr, exc)
        try:
            place_readings = cdc_places.fetch_state_places(
                state, cache_only=history_cache_only,
            )
            health_place_by_loc = cdc_places.by_location(place_readings)
        except Exception as exc:  # noqa: BLE001
            logging.warning("CDC PLACES place fetch failed for %s: %s", state.abbr, exc)
        try:
            us_readings = cdc_places.fetch_us_counties(cache_only=history_cache_only)
            health_us_means = (
                cdc_places.us_means_from_counties(us_readings).by_measure
            )
        except Exception as exc:  # noqa: BLE001
            logging.warning("CDC PLACES US fetch failed: %s", exc)

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
        # State long-arc on TRI total + per-medium + GHG, plus statewide
        # NAAQS exceedance (rare but happens — e.g. statewide ozone).
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
        state_flags.extend(detect_naaqs_exceedance(
            air_history=air_state_history,
            geography_label=f"{state.name} statewide",
            recent_year=year,
        ))
        flags_summarize("state", state.slug, state_flags)
        # County long-arc on total + GHG + AQS, county-level ghg_step, and
        # NAAQS exceedance per criteria-air metric. ghg_step is the only
        # level v1 emits ghg_step at.
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
            cf.extend(detect_naaqs_exceedance(
                air_history=air_county_history.get(c.fips),
                geography_label=cname,
                recent_year=year,
            ))
            if cf:
                county_flags[c.fips] = cf
                flags_summarize("county", f"{state.slug}/{c.fips}", cf)
        # NAAQS exceedance for counties with AQS data but no TRI footprint
        # (rural / monitor-only counties). Without this loop they never enter
        # the per-county flag detection above and lose their exceedance flag.
        for cfips, hist in air_county_history.items():
            if cfips in county_flags or cfips in counties:
                continue
            cname = _county_name_from_fips(cfips, state.abbr)
            if not cname:
                continue
            label_full = cname + " County" if not cname.endswith("County") else cname
            naaqs = detect_naaqs_exceedance(
                air_history=hist, geography_label=label_full, recent_year=year,
            )
            if naaqs:
                county_flags[cfips] = naaqs
                flags_summarize("county", f"{state.slug}/{cfips}", naaqs)
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
            # Facility-level ghg_step fires when this TRI facility's FRS ID
            # matches a GHGRP facility's FRS — the ~14% TRI/GHGRP overlap
            # (refineries, large chemical plants, steel, cement, paper).
            # f.facility_id is FRS-or-TRIFD per ingest/tri.py; only the FRS
            # case can possibly match the GHGRP-keyed history.
            fac_ghg_history = ghg_facility_history.get(f.facility_id)
            if fac_ghg_history:
                ghg_flag = detect_ghg_step(
                    ghg_history=fac_ghg_history,
                    geography_label=f.name,
                    recent_year=year,
                    at_facility=True,
                )
                if ghg_flag is not None:
                    ff.append(ghg_flag)
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

    # --- Superfund rollups (per-county, per-place) ----------------------
    # Pre-compute groupings off `superfund_sites_agg` so each publish loop
    # below can read them without re-grouping.
    superfund_by_county: dict[str, list[SuperfundSiteAgg]] = {}
    superfund_by_place: dict[str, list[SuperfundSiteAgg]] = {}
    for sf in superfund_sites_agg.values():
        if sf.county_fips:
            superfund_by_county.setdefault(sf.county_fips, []).append(sf)
        if sf.place_fips:
            superfund_by_place.setdefault(sf.place_fips, []).append(sf)

    # --- Publish ---
    publish_site.publish_state(
        state, state_agg, counties, facilities, year,
        history=history, utilities=utilities,
        county_history=county_history, chem_history=chem_history,
        medium_history=medium_history,
        county_populations=county_pops,
        demographics=state_demo,
        disparity_scores=state_disparity,
        percentiles=state_percentiles,
        ghg_history=ghg_state_history,
        air_history=air_state_history,
        airtox_history=airtox_state,
        flags=state_flags,
        superfund_sites=superfund_sites_agg,
    )

    # Place → facility / utility mappings, computed once and reused: the
    # county-publish loop needs a "cities in this county" directory; the
    # city-publish loop further down also consumes these. Lifted above
    # publish_county so its directory has the same canonical-county logic
    # the city-hub publish uses.
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
    #   (a) TIGER place polygon → county via majority block-group containment.
    #       Authoritative spatial answer; doesn't depend on observed
    #       facilities or utilities. Catches cases like South Pasadena (LA)
    #       where the only utility candidate is HQ'd in Kern.
    #   (b) Majority county of facilities inside the place polygon.
    #   (c) Majority SDWIS county across the city_name candidates — only
    #       used when (a) and (b) yield nothing.
    try:
        place_to_county_canonical = build_place_to_county(state.fips)
    except Exception as exc:  # noqa: BLE001
        logging.warning("Place→county build failed for %s: %s", state.abbr, exc)
        place_to_county_canonical = {}
    from collections import Counter
    place_to_utilities: dict[str, list] = {}
    place_to_canonical_county: dict[str, str] = {}
    for pf in set(place_to_facility_ids.keys()) | set(place_to_utility_candidates.keys()):
        canonical = place_to_county_canonical.get(pf)
        if not canonical:
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
            place_to_canonical_county[pf] = canonical
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

    # Build "cities in this county" directory entries. Eligibility mirrors
    # the city-hub publish criteria below: a place gets a programmatic page
    # iff it has ≥1 facility OR ≥1 (county-filtered) utility.
    cities_by_county_fips: dict[str, list[dict]] = {}
    eligible_places_for_dir = set(place_to_facility_ids.keys()) | set(place_to_utilities.keys())
    for pf in eligible_places_for_dir:
        place_name = place_fips_to_name.get(pf)
        if not place_name:
            continue
        cfips = place_to_canonical_county.get(pf)
        if cfips is None:
            ids = place_to_facility_ids.get(pf, [])
            if ids:
                first = facilities.get(ids[0])
                if first:
                    cfips = first.county_fips
            if cfips is None:
                utils = place_to_utilities.get(pf, [])
                if utils:
                    cfips = utility_county_map.get(utils[0].pwsid)
        if not cfips:
            continue
        place_pop = (
            place_demos.get(pf).population
            if pf in place_demos and hasattr(place_demos.get(pf), "population")
            else 0
        )
        cities_by_county_fips.setdefault(cfips, []).append({
            "slug": publish_site.place_slug(place_name, pf),
            "name": place_name,
            "fips": pf,
            "facilities_count": len(place_to_facility_ids.get(pf, [])),
            "utilities_count": len(place_to_utilities.get(pf, [])),
            "population": place_pop,
        })
    # Sort each county's directory alphabetically by city name.
    for cfips in cities_by_county_fips:
        cities_by_county_fips[cfips].sort(key=lambda e: e["name"].lower())

    # Publish every county with data from ANY upstream source — TRI, GHG,
    # EJ, ACS — not just counties with 2024 TRI rows. Without this, quiet
    # counties (Marin, Sierra, etc.) only get a stale page from an earlier
    # run or no page at all, even though they have legitimate EJ + GHG +
    # demographic context to surface.
    all_county_fips = set(counties.keys())
    all_county_fips.update(county_disparity.keys())
    all_county_fips.update(county_percentiles.keys())
    all_county_fips.update(ghg_county_history.keys())
    all_county_fips.update(air_county_history.keys())
    all_county_fips.update(airtox_county.keys())
    all_county_fips.update(county_demos.keys())
    all_county_fips.update(county_pops.keys())
    # First pass: synthesise empty CountyAgg entries for counties with no
    # current-year TRI rows so the publish loop and the related-counties
    # similarity pass see the same set of geographies.
    counties_for_publish: dict[str, CountyAgg] = {}
    for cfips in all_county_fips:
        c = counties.get(cfips)
        if c is None:
            cname = _county_name_from_fips(cfips, state.abbr)
            if not cname:
                continue  # FIPS doesn't resolve to a county name — skip rather than write nonsense
            c = CountyAgg(
                fips=cfips,
                name=cname,
                state_abbr=state.abbr,
                state_slug=state.slug,
            )
        counties_for_publish[cfips] = c
    # Peer facts for the related-counties cross-link module — computed once
    # over the full state's counties, consumed by every per-county publish.
    county_peer_facts = publish_site.build_county_peer_facts(
        state_slug=state.slug,
        counties=counties_for_publish,
        facilities=facilities,
        county_pops=county_pops,
        county_percentiles=county_percentiles,
        year=year,
    )
    county_paths: set = set()
    for cfips, c in counties_for_publish.items():
        in_county = [f for f in facilities.values() if f.county_fips == cfips]
        county_paths.add(publish_site.publish_county(
            c, in_county, year,
            history=county_history.get(cfips),
            facilities_chem_history=chem_history,
            medium_history=county_medium_history.get(cfips),
            population=county_pops.get(cfips, 0),
            demographics=county_demos.get(cfips),
            disparity_scores=county_disparity.get(cfips, []),
            percentiles=county_percentiles.get(cfips, []),
            ghg_history=ghg_county_history.get(cfips),
            air_history=air_county_history.get(cfips),
            airtox_history=airtox_county.get(cfips),
            health_indicators=publish_site._health_indicators(
                measures=list(health_county_by_loc.get(cfips, {}).values()),
                state_means=health_state_means,
                us_means=health_us_means,
                release_label=health_release_label,
            ),
            flags=county_flags.get(cfips, []),
            cities_directory=cities_by_county_fips.get(cfips, []),
            related_places=publish_site.pick_related_counties(cfips, county_peer_facts),
            superfund_in_county=superfund_by_county.get(cfips, []),
        ))
    # 3-mile buffer demographics per facility — block-group-level pop-weighted
    # aggregation so the equity overlay describes who lives *near* the facility,
    # not the entire containing county. Falls back to county demographics when
    # the buffer is empty (rural facilities, missing lat/lng).
    fac_points_for_buffer = [(f.facility_id, f.lat, f.lng) for f in facilities.values()]
    try:
        buffer_demographics = compute_facility_buffer_demographics(
            fac_points_for_buffer, state.fips, radius_miles=3.0,
        )
    except Exception as exc:  # noqa: BLE001
        logging.warning("facility buffer demographics failed for %s: %s", state.abbr, exc)
        buffer_demographics = {}

    facility_paths: set = set()
    for f in facilities.values():
        facility_paths.add(publish_site.publish_facility(
            f, year,
            chem_history=chem_history.get(f.facility_id),
            buffer_demographics=buffer_demographics.get(f.facility_id),
            county_demographics=county_demos.get(f.county_fips),
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
            state_percentiles=state_percentiles,
            state_population=state.population,
            state_label=state.name,
            county_fips=cfips,
            county_demographics=county_demos.get(cfips) if cfips else None,
            county_disparity_scores=county_disparity.get(cfips, []) if cfips else None,
            county_percentiles=county_percentiles.get(cfips, []) if cfips else None,
            county_population=county_pops.get(cfips, 0) if cfips else 0,
            county_name=_county_name_from_fips(cfips, state.abbr) if cfips else None,
            place_fips=place_fips,
            place_demographics=place_demos.get(place_fips) if place_fips else None,
            place_disparity_scores=place_disparity.get(place_fips, []) if place_fips else None,
            place_percentiles=place_percentiles.get(place_fips, []) if place_fips else None,
            place_name=place_fips_to_name.get(place_fips) if place_fips else None,
            place_slug_value=(
                publish_site.place_slug(place_fips_to_name[place_fips], place_fips)
                if place_fips and place_fips in place_fips_to_name
                else None
            ),
            flags=utility_flags.get(u.pwsid, []),
        ))

    # ---- Tier 1 entity: Superfund / NPL site (/superfund/[slug]) -------
    # One per NPL-relevant site. Equity overlay falls through Buffer →
    # Place → County → State. The 1-mile buffer is the standard EPA
    # EJScreen "Define an Area" radius for site-specific overlays — it
    # describes the population *immediately exposed* to the contaminated
    # site rather than borrowing the host city's demographics.
    sf_points_for_buffer = [
        (sf.epa_id, sf.lat, sf.lng) for sf in superfund_sites_agg.values()
    ]
    try:
        sf_buffer_demographics = compute_facility_buffer_demographics(
            sf_points_for_buffer, state.fips, radius_miles=1.0,
        )
    except Exception as exc:  # noqa: BLE001
        logging.warning("superfund buffer demographics failed for %s: %s", state.abbr, exc)
        sf_buffer_demographics = {}

    superfund_paths: set = set()
    for sf in superfund_sites_agg.values():
        pf = sf.place_fips
        place_demo = place_demos.get(pf) if pf else None
        place_pop = (
            place_demo.population
            if place_demo is not None and hasattr(place_demo, "population")
            else 0
        )
        superfund_paths.add(publish_site.publish_superfund(
            sf,
            state_label=state.name,
            buffer_demographics=sf_buffer_demographics.get(sf.epa_id),
            buffer_radius_miles=1.0,
            county_demographics=county_demos.get(sf.county_fips),
            county_disparity_scores=county_disparity.get(sf.county_fips, []),
            county_percentiles=county_percentiles.get(sf.county_fips, []),
            county_population=county_pops.get(sf.county_fips, 0),
            place_demographics=place_demo,
            place_disparity_scores=place_disparity.get(pf, []) if pf else None,
            place_percentiles=place_percentiles.get(pf, []) if pf else None,
            place_population=place_pop,
            flags=None,  # v1: Superfund flag detection deferred
        ))

    # ---- Tier 2 place: city hub (/city/[slug]) -------------------------
    # True place-anchored aggregation. TRI facilities in the city polygon +
    # utilities serving the city + GHG county-share + equity. Each utility
    # row links to /water/[slug] for the entity-level deep dive.
    # Place mappings (place_to_facility_ids / place_to_utilities /
    # place_to_canonical_county) were computed above the county-publish
    # loop so the cities_directory could share the same canonical-county
    # resolution.
    # Peer facts for the related-cities cross-link module — same approach as
    # counties but with same-county weighting so e.g. Stockton surfaces Lodi
    # rather than Fontana. Computed once over every eligible place.
    city_peer_facts = publish_site.build_city_peer_facts(
        state_slug=state.slug,
        place_to_facility_ids=place_to_facility_ids,
        place_to_utilities=place_to_utilities,
        place_to_canonical_county=place_to_canonical_county,
        place_fips_to_name=place_fips_to_name,
        place_demos=place_demos,
        place_percentiles=place_percentiles,
        facilities=facilities,
    )
    city_paths: set = set()
    # Build a city hub for any place with ≥1 facility, ≥1 (filtered) utility,
    # or ≥1 NPL site — places with none of these aren't worth a programmatic
    # page. The Superfund condition catches places like Alameda or Oroville
    # whose programmatic surface is anchored on legacy contamination rather
    # than on active TRI / SDWIS records.
    eligible_places = (
        set(place_to_facility_ids.keys())
        | set(place_to_utilities.keys())
        | set(superfund_by_place.keys())
    )
    for pf in eligible_places:
        place_name = place_fips_to_name.get(pf)
        if not place_name:
            continue
        ids_in_place = place_to_facility_ids.get(pf, [])
        facs_in_place = [facilities[fid] for fid in ids_in_place if fid in facilities]
        utils_serving = place_to_utilities.get(pf, [])
        # County for this place — prefer the spatial canonical (TIGER place
        # polygon → county), falling back to facility/utility heuristics for
        # places the spatial pass didn't resolve.
        county_fips_for_place = place_to_canonical_county.get(pf)
        if not county_fips_for_place:
            if facs_in_place:
                county_fips_for_place = facs_in_place[0].county_fips
            elif utils_serving:
                county_fips_for_place = utility_county_map.get(utils_serving[0].pwsid)
            elif superfund_by_place.get(pf):
                county_fips_for_place = superfund_by_place[pf][0].county_fips
        place_pop = (
            place_demos.get(pf).population
            if pf in place_demos and hasattr(place_demos.get(pf), "population")
            else 0
        )
        # Sum facility per-medium histories for the in-place facility set —
        # gives the city its own multi-year air/water/land pathway tiles.
        in_place_medium_history: dict[str, dict[int, float]] = {"AIR": {}, "WATER": {}, "LAND": {}}
        for fid in ids_in_place:
            fac_med = facility_medium_history.get(fid, {})
            for medium, year_map in fac_med.items():
                for y, v in year_map.items():
                    in_place_medium_history[medium][y] = (
                        in_place_medium_history[medium].get(y, 0.0) + v
                    )
        # City-level flags: long-arc on in-place TRI total + SDWIS violation
        # events for utilities serving this place. ghg_step is county-share
        # (same county GHG history the city renders on its pathway tile).
        city_flags: list[Flag] = []
        if not no_flags:
            in_place_history: dict[int, float] = {}
            for f in facs_in_place:
                per_chem = chem_history.get(f.facility_id, {})
                for cid_hist in per_chem.values():
                    for y, v in cid_hist.items():
                        in_place_history[y] = in_place_history.get(y, 0.0) + v
            la = detect_long_arc_geo(
                in_place_history, label="Total TRI releases",
                pathway_units="lb", geography=place_name, recent_year=year,
            )
            if la is not None:
                city_flags.append(la)
            # Pull violation_event flags from each utility serving the place
            # so the city hub surfaces every active SDWIS issue without the
            # reader having to drill into each /water/[slug] page.
            for u in utils_serving:
                evts = detect_violation_events(
                    pwsid=u.pwsid, utility_label=u.name, violations=u.violations,
                    cap=2,  # tighter cap at city aggregation
                )
                city_flags.extend(evts)
            if city_flags:
                flags_summarize("city", f"{state.slug}/{pf}", city_flags)
        city_paths.add(publish_site.publish_city_hub(
            state_slug=state.slug,
            place_fips=pf,
            place_name=place_name,
            place_slug=publish_site.place_slug(place_name, pf),
            facilities=facs_in_place,
            utilities=utils_serving,
            facilities_chem_history=chem_history,
            in_place_medium_history=in_place_medium_history,
            year=year,
            place_demographics=place_demos.get(pf),
            place_disparity_scores=place_disparity.get(pf, []),
            place_percentiles=place_percentiles.get(pf, []),
            place_population=place_pop,
            county_name=_county_name_from_fips(county_fips_for_place, state.abbr) if county_fips_for_place else None,
            county_fips=county_fips_for_place,
            county_ghg_history=ghg_county_history.get(county_fips_for_place) if county_fips_for_place else None,
            county_air_history=air_county_history.get(county_fips_for_place) if county_fips_for_place else None,
            county_airtox_history=airtox_county.get(county_fips_for_place) if county_fips_for_place else None,
            health_indicators=publish_site._health_indicators(
                measures=list(health_place_by_loc.get(pf, {}).values()),
                state_means=health_state_means,
                us_means=health_us_means,
                release_label=health_release_label,
            ),
            flags=city_flags,
            related_places=publish_site.pick_related_cities(pf, city_peer_facts),
            superfund_in_place=superfund_by_place.get(pf, []),
        ))

    removed_fac = publish_site.cleanup_stale("facility", state.slug, facility_paths)
    removed_water = publish_site.cleanup_stale("water", state.slug, water_paths)
    removed_superfund = publish_site.cleanup_stale("superfund", state.slug, superfund_paths)
    removed_city = publish_site.cleanup_stale("city", state.slug, city_paths)
    removed_county = publish_site.cleanup_stale("county", state.slug, county_paths)
    if removed_fac or removed_water or removed_superfund or removed_city or removed_county:
        logging.info(
            "cleanup: %s — removed %d facility, %d water, %d superfund, %d city, %d county files",
            state.slug, removed_fac, removed_water, removed_superfund, removed_city, removed_county,
        )

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
    runp.add_argument("--skip-aqs", action="store_true",
                      help="Skip AQS air-monitor ingest. Pages render without "
                           "criteria_air pathway tiles or naaqs_exceedance flags.")
    runp.add_argument("--skip-airtox", action="store_true",
                      help="Skip AirToxScreen ingest. Pages render without "
                           "hazardous_air pathway tiles. The 346 MB regional "
                           "XLSX cache is one-time per vintage; this flag is "
                           "useful for dev runs before the cache is warm.")
    runp.add_argument("--skip-health", action="store_true",
                      help="Skip CDC PLACES ingest. County and city pages render "
                           "without the co-located health-indicators section.")
    runp.add_argument("--skip-superfund", action="store_true",
                      help="Skip Superfund / NPL site ingest. Entity pages "
                           "and city/county/state Superfund roll-ups won't be "
                           "written.")
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
            skip_aqs=args.skip_aqs,
            skip_airtox=args.skip_airtox,
            skip_health=args.skip_health,
            skip_superfund=args.skip_superfund,
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

    publish_rankings_mod.publish_rankings(year=args.year)

    publish_search_index_mod.build_search_index()

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
