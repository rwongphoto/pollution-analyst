"""Write JSON files matching the frontend's payload schemas.

Source of truth for shapes: frontend/src/lib/types.ts. Keep in sync when the
frontend types change. Equity overlay (EJScreen) and water utility (SDWIS)
are not yet ingested — those sections use a clearly-tagged stub block so the
visual doesn't go missing on the page.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from ..config import (
    COUNTY_TOP_FACILITIES,
    FACILITY_HISTORY_YEARS,
    FACILITY_TOP_CHEMICALS,
    PUBLISHED_ROOT,
    STATE_TOP_COUNTIES,
    STATE_TOP_FACILITIES,
)
from ..states import State
from .._slug import slugify
from ..aggregate.build import (
    CountyAgg,
    FacilityAgg,
    FacilityChemical,
    StateAgg,
    SuperfundSiteAgg,
    UtilityAgg,
)


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str))


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _round_pounds(v: float) -> float | int:
    """Round pounds for display. Keeps 2-decimal precision when 0 < v < 1
    so PBT releases under a pound (dioxin, mercury) don't render as 0.
    """
    if v >= 1:
        return int(round(v))
    if v <= 0:
        return 0
    return round(v, 2)


def _pick_material_baseline(
    history: dict[int, float],
    current_year: int,
    min_floor: float = 1.0,
) -> int | None:
    """Return the earliest year with 'material' releases (>= max(min_floor,
    5% of current_year)), excluding the current year itself. Used to anchor
    long-arc framing on operationally-meaningful data — without this,
    facilities like Golden Queen Mining (0.1 lb 2016-2021, then 124k lb
    2022 onward) get nonsense '+123,000,000% since 2016' copy, and small
    cities with tiny TRI volumes throughout history get '+1,666% since
    2010' off a 70-lb baseline.

    Returns None when:
      - history has fewer than 2 entries, OR
      - the current year's value is below min_floor (geography is below the
        operationally-relevant volume on this pathway — long-arc framing
        misrepresents noise as trend), OR
      - no other year clears max(min_floor, 5% of current).

    Caller should suppress long-arc copy when this returns None.

    min_floor varies by pathway: TRI tiles pass 5,000 lb; GHG tiles pass
    10,000 mtCO2e (matches the ghg_step flag's MIN_RECENT_MTCO2E threshold).
    """
    if not history or len(history) < 2:
        return None
    current = history.get(current_year, 0.0) or 0.0
    if current < min_floor:
        return None
    threshold = max(min_floor, current * 0.05)
    material = sorted(y for y, v in history.items() if v >= threshold and y != current_year)
    return material[0] if material else None


def cleanup_stale(subdir: str, state_slug: str, kept: set[Path]) -> int:
    """Remove published JSONs in subdir/state_slug/ that weren't written
    this run. Prevents stale entities (facilities/utilities that dropped
    out of the latest reporting year) from lingering with old totals —
    real bug we hit when POTW-transfer-counting Envirofacts ingest got
    replaced by bulk-CSV ingest.
    """
    target_dir = PUBLISHED_ROOT / subdir / state_slug
    if not target_dir.exists():
        return 0
    kept_resolved = {p.resolve() for p in kept}
    removed = 0
    for f in target_dir.glob("*.json"):
        if f.resolve() not in kept_resolved:
            f.unlink()
            removed += 1
    return removed


_COUNTY_SUFFIXES_LOWER = (
    " city and borough",  # checked before " borough" so Juneau strips fully
    " borough",
    " parish",
    " census area",
    " municipality",
    " municipio",
    " county",
)


def _strip_county_suffix(name: str) -> str:
    """Strip the canonical Census subdivision suffix from a county-equivalent
    name. AK/LA/PR keep their native suffixes in display strings now, so the
    slugifier needs to handle every form, not just ' county'.
    """
    s = name.strip()
    low = s.lower()
    for suffix in _COUNTY_SUFFIXES_LOWER:
        if low.endswith(suffix):
            return s[: -len(suffix)].rstrip()
    return s


def _county_slug(county_name: str, fips: str) -> str:
    base = slugify(_strip_county_suffix(county_name).lower())
    return base or f"fips-{fips}"


def _facility_slug(name: str, facility_id: str) -> str:
    base = slugify(name.lower())
    return base or f"tri-{facility_id.lower()}"


def _superfund_slug(name: str, epa_id: str) -> str:
    """URL slug for an NPL site. Mirrors `_facility_slug` shape — slugify
    the EPA-published name; fall back to lowercased EPA Site ID on
    pathologically short results.
    """
    base = slugify(name.lower())
    if not base or len(base) < 3:
        return epa_id.lower() or "unknown"
    return base


def utility_city_slug(name: str, pwsid: str) -> str:
    """Derive the URL slug for a utility's city page. Strip 'City of'/'Town of'
    prefixes when present so /state/ca/city/sacramento beats
    /state/ca/city/city-of-sacramento. Falls back to PWSID on collision-prone
    short names.
    """
    s = name.strip()
    for prefix in ("City Of ", "Town Of ", "Village Of ", "City of ", "Town of "):
        if s.startswith(prefix):
            s = s[len(prefix):]
            break
    base = slugify(s.lower())
    if not base or len(base) < 3:
        return pwsid.lower()
    return base


def _tri_pathways(
    *,
    current_air: float,
    current_water: float,
    current_land: float,
    medium_history: dict[str, dict[int, float]] | None,
    year: int,
    ghg_history: dict[int, float] | None = None,
) -> list[dict]:
    """Build the TRI pathway cards (air, water, land+off-site) plus an
    optional GHGRP CO2e card if ghg_history is provided.

    Uses ``_pick_material_baseline`` so the long-arc "since YYYY" framing
    anchors on the first operationally-meaningful year, not the absolute
    earliest year (which can be 0 lb or negligible). Without this, places
    with sparse early-year reporting render nonsense like "+1,666% since
    2010" off a 200-lb baseline.
    """
    specs = [
        ("tri_air",   "TRI air releases (5.1 fugitive + 5.2 stack)", current_air,   "AIR",  "lb"),
        ("tri_water", "TRI water releases (5.3)",                    current_water, "WATER","lb"),
        ("tri_land",  "TRI land + off-site releases",                current_land,  "LAND", "lb"),
    ]
    out: list[dict] = []
    for slug, label, current, key, units in specs:
        hist_map = (medium_history or {}).get(key) or {year: current}
        history_pts = [{"year": y, "value": round(v)} for y, v in sorted(hist_map.items())]
        # Long-arc anchored on the first MATERIAL year, not the absolute earliest.
        # 5,000 lb is the "operationally relevant" volume floor for a TRI pathway
        # — below this, long-arc framing misrepresents noise as trend.
        material = _pick_material_baseline(hist_map, year, min_floor=5000.0)
        if material is not None:
            baseline_year = material
            long_arc = _yoy_pct_change(hist_map.get(year), hist_map.get(material))
        else:
            baseline_year = min(hist_map.keys()) if hist_map else year
            long_arc = None  # not enough material-year data to anchor
        out.append({
            "pathway": slug,
            "label": label,
            "current": round(current),
            "units": units,
            "yoy_pct_change": _yoy_pct_change(hist_map.get(year), hist_map.get(year - 1)),
            "long_arc_pct_change": long_arc,
            "baseline_year": baseline_year,
            "history": history_pts,
        })
    if ghg_history:
        # GHGRP lags TRI by a reporting year. Use the latest year actually
        # present rather than the TRI ``year`` arg, so a missing 2024 GHGRP
        # row doesn't produce a fake -100% YoY for the displayed tile.
        history_pts = [{"year": y, "value": round(v)} for y, v in sorted(ghg_history.items())]
        latest_year = max(ghg_history.keys())
        current_ghg = ghg_history[latest_year]
        # Same material-baseline picker as TRI tiles. Without this, geographies
        # whose first GHGRP-reporting year happened to be a small number (a
        # plant that came online mid-decade) render misleading long-arc deltas.
        # 10,000 mtCO2e matches the ghg_step flag's MIN_RECENT_MTCO2E threshold.
        material = _pick_material_baseline(ghg_history, latest_year, min_floor=10000.0)
        if material is not None:
            baseline_year = material
            long_arc = _yoy_pct_change(current_ghg, ghg_history.get(material))
        else:
            baseline_year = min(ghg_history.keys())
            long_arc = None
        out.append({
            "pathway": "ghg",
            "label": f"Greenhouse gases (GHGRP large emitters, through {latest_year})",
            "current": round(current_ghg),
            "units": "metric tons CO₂e",
            "yoy_pct_change": _yoy_pct_change(current_ghg, ghg_history.get(latest_year - 1)),
            "long_arc_pct_change": long_arc,
            "baseline_year": baseline_year,
            "history": history_pts,
        })
    return out


_AQS_METRIC_ORDER = ("pm25_annual", "pm25_24hr", "ozone_8hr", "no2_annual")


def _criteria_air_descriptor(metric_key: str, naaqs_label: str) -> str:
    """Short tile subtitle for a criteria-air pathway."""
    descriptor = {
        "pm25_annual": "annual mean",
        "pm25_24hr":   "24-hour 98th percentile",
        "ozone_8hr":   "8-hour 4th-highest daily max",
        "no2_annual":  "annual mean",
    }.get(metric_key, "")
    return f"{descriptor} (NAAQS {naaqs_label})" if descriptor else f"NAAQS {naaqs_label}"


def _criteria_air_pathways(
    *,
    air_history: dict[str, dict[int, float]] | None,
    year: int,
) -> list[dict]:
    """Build PollutantSummary dicts for the AQS criteria-air metrics.

    ``air_history``: ``{metric_key: {year: monitor-mean}}``. Empty / absent
    metrics are skipped — counties without a regulatory monitor for a given
    pollutant get no tile rather than a fake "no data" placeholder.

    Unlike TRI tiles, no material-baseline trim: AQS monitor readings are
    continuous (~µg/m³ scale) so the early-year-noise problem that motivates
    ``_pick_material_baseline`` doesn't apply.
    """
    if not air_history:
        return []
    from ..ingest.aqs import metric_for_key  # local import — pipeline-only dependency
    out: list[dict] = []
    for metric_key in _AQS_METRIC_ORDER:
        hist_map = air_history.get(metric_key) or {}
        if not hist_map:
            continue
        m = metric_for_key(metric_key)
        latest_year = max(hist_map.keys())
        current_year = year if year in hist_map else latest_year
        current = hist_map[current_year]
        history_pts = [{"year": y, "value": round(v, 3)} for y, v in sorted(hist_map.items())]
        baseline_year = min(hist_map.keys())
        long_arc = (
            _yoy_pct_change(current, hist_map.get(baseline_year))
            if len(hist_map) > 1 and baseline_year != current_year else None
        )
        yoy = _yoy_pct_change(current, hist_map.get(current_year - 1))
        out.append({
            "pathway": "criteria_air",
            "label": f"{m.pollutant} {_criteria_air_descriptor(metric_key, m.naaqs_label)}",
            "current": round(current, 3),
            "units": m.units,
            "yoy_pct_change": yoy,
            "long_arc_pct_change": long_arc,
            "baseline_year": baseline_year,
            "history": history_pts,
        })
    return out


_AIRTOX_METRIC_ORDER = ("cancer_risk_total", "formaldehyde_ambconc", "benzene_ambconc")


def _hazardous_air_descriptor(metric_key: str) -> str:
    """Short tile subtitle for a hazardous-air pathway. Mirrors the
    criteria-air descriptor pattern; threshold label comes from MetricSpec."""
    return {
        "cancer_risk_total":     "all pollutants",
        "formaldehyde_ambconc":  "ambient mean",
        "benzene_ambconc":       "ambient mean",
    }.get(metric_key, "")


def _hazardous_air_pathways(
    *,
    airtox_history: dict[str, dict[int, float]] | None,
    year: int,
) -> list[dict]:
    """Build PollutantSummary dicts for the AirToxScreen hazardous-air metrics.

    ``airtox_history``: ``{metric_key: {vintage_year: pop-weighted mean}}``.
    AirToxScreen is single-snapshot per vintage (EPA cadence ~3-4 years), so
    the history map typically has one entry. We surface that as ``current``
    with no YoY / long-arc trend lines — empty ``history`` array signals the
    frontend to render the tile without the spark trail.
    """
    if not airtox_history:
        return []
    from ..ingest.airtoxscreen import metric_for_key  # noqa: PLC0415 — pipeline-only
    out: list[dict] = []
    for metric_key in _AIRTOX_METRIC_ORDER:
        hist_map = airtox_history.get(metric_key) or {}
        if not hist_map:
            continue
        m = metric_for_key(metric_key)
        latest_year = max(hist_map.keys())
        current = hist_map[latest_year]
        precision = 1 if metric_key == "cancer_risk_total" else 4
        history_pts = [
            {"year": y, "value": round(v, precision)} for y, v in sorted(hist_map.items())
        ]
        descriptor = _hazardous_air_descriptor(metric_key)
        head = f"{m.pollutant} {descriptor}".strip()
        label = f"{head} ({m.threshold_label})"
        out.append({
            "pathway": "hazardous_air",
            "label": label,
            "current": round(current, precision),
            "units": m.units,
            "yoy_pct_change": None,
            "long_arc_pct_change": None,
            "baseline_year": latest_year,
            "history": history_pts,
        })
    return out


def _vs_state_class(pct: float | None) -> str:
    """Editorial color bucket for the 'vs state mean' comparison pill.

    Tighter bands than the equity-percentile classifier — chronic-disease
    prevalence rates move on a narrower scale than EJ percentiles, so a
    +15% gap is genuinely 'worse' rather than 'modestly above'."""
    if pct is None:
        return "neutral"
    if pct >= 15:
        return "worse"
    if pct >= 5:
        return "elevated"
    if pct <= -5:
        return "better"
    return "neutral"


def _compare_to_baseline(
    cmp_basis: float | None, baseline: float | None,
) -> tuple[float | None, float | None, str]:
    """Return ``(pp, pct, class)`` deltas vs a baseline rate.

    Both inputs are age-adjusted prevalence (so the comparison is
    apples-to-apples regardless of local age structure). Returns ``(None,
    None, "neutral")`` when either side is missing or the baseline is
    zero — the tile renders without a comparator pill in that case."""
    if cmp_basis is None or baseline is None or baseline <= 0:
        return None, None, "neutral"
    pp = round(cmp_basis - baseline, 2)
    pct = round((cmp_basis - baseline) / baseline * 100, 1)
    return pp, pct, _vs_state_class(pct)


def _health_indicators(
    *,
    measures: list,                                # list[cdc_places.PlacesReading]
    state_means: dict[str, float],                 # measure_key -> state pop-weighted mean (age-adjusted)
    us_means: dict[str, float] | None = None,      # measure_key -> US pop-weighted mean (age-adjusted)
    release_label: str,
) -> list[dict]:
    """Render PLACES readings as ``HealthIndicator`` payload entries.

    Tile order is deterministic (mirrors ``cdc_places.V1_MEASURES``) so
    readers comparing two pages see the same column order. ``measures``
    is one geography's worth of readings — county or place — keyed by
    ``measure_key``. Each tile carries TWO comparators: state mean (the
    immediate same-state context — answers 'how does this place compare
    to others in the same state?') and US mean (the broader national
    context — answers 'is this place's profile typical of America, or
    an outlier in either direction?').
    """
    if not measures:
        return []
    from ..ingest.cdc_places import V1_MEASURES, measure_for_key  # local import — pipeline-only

    by_key = {r.measure_key: r for r in measures}
    us_means = us_means or {}
    out: list[dict] = []
    for spec in V1_MEASURES:
        r = by_key.get(spec.key)
        if r is None or r.crude is None:
            continue
        m = measure_for_key(spec.key)
        cmp_basis = r.age_adjusted if r.age_adjusted is not None else r.crude
        sm = state_means.get(spec.key)
        um = us_means.get(spec.key)
        s_pp, s_pct, s_cls = _compare_to_baseline(cmp_basis, sm)
        u_pp, u_pct, u_cls = _compare_to_baseline(cmp_basis, um)
        out.append({
            "measure_key": spec.key,
            "label": m.label,
            "crude": round(r.crude, 1),
            "age_adjusted": round(r.age_adjusted, 1) if r.age_adjusted is not None else None,
            "state_mean": round(sm, 1) if sm is not None else None,
            "us_mean": round(um, 1) if um is not None else None,
            "vs_state_pp": s_pp,
            "vs_state_pct": s_pct,
            "vs_state_class": s_cls,
            "vs_us_pp": u_pp,
            "vs_us_pct": u_pct,
            "vs_us_class": u_cls,
            "source": release_label,
            "vintage_year": r.year,
        })
    return out


def _stub_equity(geography_label: str, population: int) -> dict:
    """Placeholder EJScreen overlay — flagged so the frontend can render
    the section but the reader (and any downstream auditor) can see it's
    not real.
    """
    return {
        "population": population,
        "pct_low_income": None,
        "pct_people_of_color": None,
        "pct_under_5": None,
        "pct_over_64": None,
        "ej_indexes": [],
        "disparity_scores": [],
        "source": "EJScreen ingest pending — placeholder",
        "geography_label": geography_label,
    }


def _build_equity(
    population: int,
    geography_label: str,
    demographics: object | None,
    disparity_scores: list | None,
    percentiles: list | None = None,
    source: str = "Census ACS 2018-2022 (5-year) + USEPA-clone EJ blockgroup stats (raw indicators + EJ disparity mirror)",
) -> dict:
    """Three-layer equity overlay — Census ACS demographics (lead) + national
    percentiles per environmental indicator (mid) + USEPA-clone EJ disparity
    scores (tail). Falls back to stub-shaped fields when demographics is None
    (e.g. ACS endpoint failed) and both percentile + disparity layers are
    empty.
    """
    if demographics is None and not disparity_scores and not percentiles:
        return _stub_equity(geography_label, population)
    return {
        "population": population,
        "pct_low_income": getattr(demographics, "pct_low_income", None),
        "pct_people_of_color": getattr(demographics, "pct_people_of_color", None),
        "pct_under_5": getattr(demographics, "pct_under_5", None),
        "pct_over_64": getattr(demographics, "pct_over_64", None),
        "ej_indexes": [
            {"label": p.label, "pct_us": p.pct_us, "pct_state": None}
            for p in (percentiles or [])
        ],
        "disparity_scores": [
            {"label": d.label, "score": d.score} for d in (disparity_scores or [])
        ],
        "source": source,
        "geography_label": geography_label,
    }


# ---- Cross-link module: similar places within state --------------------
# Picks 5 pollution-profile peers + 1 deliberate contrast (similar scale,
# opposite EJ band). Surfaced at the bottom of county and city pages. The
# contrast slot is the editorial point — it puts the wealth-pollution gap on
# the page rather than just shuffling navigation between similar geographies.

RELATED_TARGET_COUNT = 6
RELATED_PEER_COUNT = 5  # remaining slot is the contrast


@dataclass
class _PeerFacts:
    fips: str
    state: str
    name: str
    slug: str
    population: int
    facilities_count: int
    total_releases_pounds: float
    dominant_medium: str  # "air" | "water" | "land" | "none"
    ej_pct_avg: float | None
    # City-only — None on county facts.
    county_fips: str | None = None


def _dominant_medium(pounds_air: float, pounds_water: float, pounds_land: float) -> str:
    biggest = max(pounds_air, pounds_water, pounds_land)
    if biggest <= 0:
        return "none"
    if biggest == pounds_air:
        return "air"
    if biggest == pounds_water:
        return "water"
    return "land"


def _avg_ej_pct(percentiles: list | None) -> float | None:
    if not percentiles:
        return None
    vals = [getattr(p, "pct_us", None) for p in percentiles]
    vals = [v for v in vals if v is not None]
    if not vals:
        return None
    return sum(vals) / len(vals)


def _peer_distance(a: _PeerFacts, b: _PeerFacts) -> float:
    """Lower = more similar. Weighted across dominant medium, release
    magnitude, facility count, and population. Each component is clamped to
    roughly [0, 1] before weighting so no single dimension can dominate
    when one place is an extreme outlier (e.g. Kern's billion-lb totals).
    """
    medium_d = 0.0 if a.dominant_medium == b.dominant_medium else 1.0
    a_mag = math.log10(max(a.total_releases_pounds, 1))
    b_mag = math.log10(max(b.total_releases_pounds, 1))
    mag_d = min(abs(a_mag - b_mag) / 4.0, 1.0)
    a_fac = math.log10(max(a.facilities_count, 1))
    b_fac = math.log10(max(b.facilities_count, 1))
    fac_d = min(abs(a_fac - b_fac) / 2.0, 1.0)
    a_pop = math.log10(max(a.population, 1))
    b_pop = math.log10(max(b.population, 1))
    pop_d = min(abs(a_pop - b_pop) / 3.0, 1.0)
    return medium_d * 1.5 + mag_d * 1.0 + fac_d * 0.7 + pop_d * 0.5


def _peer_reason(target: _PeerFacts, peer: _PeerFacts) -> str:
    """Strongest similarity dimension between target and peer. Drives the
    one-line hook on each card."""
    fac_word = "facility" if peer.facilities_count == 1 else "facilities"
    if target.dominant_medium == peer.dominant_medium and peer.dominant_medium != "none":
        medium_label = {"air": "air", "water": "water", "land": "land"}[peer.dominant_medium]
        return f"Similar TRI {medium_label} profile · {peer.facilities_count} {fac_word}"
    target_mag = math.log10(max(target.total_releases_pounds, 1))
    peer_mag = math.log10(max(peer.total_releases_pounds, 1))
    if abs(target_mag - peer_mag) <= 0.5 and peer.total_releases_pounds > 0:
        return f"Comparable release scale · {peer.facilities_count} {fac_word}"
    target_pop = math.log10(max(target.population, 1))
    peer_pop = math.log10(max(peer.population, 1))
    if abs(target_pop - peer_pop) <= 0.3:
        return "Comparable population"
    return "Statewide pollution-profile peer"


def _contrast_reason(target: _PeerFacts, peer: _PeerFacts) -> str:
    """Frame the contrast around scale + EJ-band gap so the wealth-pollution
    angle is on the surface."""
    if target.ej_pct_avg is None or peer.ej_pct_avg is None:
        return "Same scale, contrasting profile"
    delta = peer.ej_pct_avg - target.ej_pct_avg
    if delta < 0:
        return f"Same scale, lighter equity burden ({abs(delta):.0f} pct-pt EJ gap)"
    return f"Same scale, heavier equity burden (+{delta:.0f} pct-pt EJ gap)"


def _pick_contrast(target: _PeerFacts, candidates: list[_PeerFacts]) -> _PeerFacts | None:
    """Find a place with similar population scale but the largest EJ
    percentile gap from the target. Returns None when neither side has EJ
    data or no candidate falls inside the population window.
    """
    if target.ej_pct_avg is None:
        return None
    target_pop_log = math.log10(max(target.population, 1))
    similar_scale = [
        c for c in candidates
        if c.ej_pct_avg is not None
        and abs(math.log10(max(c.population, 1)) - target_pop_log) <= 0.6
    ]
    if not similar_scale:
        return None
    if target.ej_pct_avg >= 50:
        # Target is on the burdened end; surface a less-burdened peer.
        best = min(similar_scale, key=lambda c: c.ej_pct_avg)
        if target.ej_pct_avg - best.ej_pct_avg < 10:
            return None  # not a real contrast
        return best
    # Target is on the lighter end; surface a more-burdened peer.
    best = max(similar_scale, key=lambda c: c.ej_pct_avg)
    if best.ej_pct_avg - target.ej_pct_avg < 10:
        return None
    return best


def _to_related_payload(
    f: _PeerFacts, kind: str, relation: str, reason: str,
) -> dict:
    return {
        "kind": kind,
        "state": f.state,
        "slug": f.slug,
        "name": f.name,
        "population": f.population,
        "facilities_count": f.facilities_count,
        "total_releases_pounds": _round_pounds(f.total_releases_pounds),
        "dominant_medium": f.dominant_medium,
        "ej_pct_avg": round(f.ej_pct_avg, 1) if f.ej_pct_avg is not None else None,
        "relation": relation,
        "reason": reason,
    }


def pick_related_counties(
    target_fips: str, facts: dict[str, _PeerFacts],
) -> list[dict]:
    """5 closest peers + 1 contrast within the same state. Skips when the
    state has too few peers — empty list renders as a hidden module on the
    page rather than a stub.
    """
    target = facts.get(target_fips)
    if target is None:
        return []
    candidates = [f for fips, f in facts.items() if fips != target_fips]
    if len(candidates) < 2:
        return []
    ranked = sorted(candidates, key=lambda c: _peer_distance(target, c))
    contrast = _pick_contrast(target, candidates)
    out: list[dict] = []
    used: set[str] = set()
    for peer in ranked[:RELATED_PEER_COUNT]:
        out.append(_to_related_payload(peer, "county", "peer", _peer_reason(target, peer)))
        used.add(peer.fips)
    if contrast and contrast.fips not in used:
        out.append(_to_related_payload(contrast, "county", "contrast", _contrast_reason(target, contrast)))
    elif len(ranked) > RELATED_PEER_COUNT:
        # No usable contrast — fill the slot with the next closest peer
        # rather than render only 5 cards (asymmetric grid).
        extra = ranked[RELATED_PEER_COUNT]
        out.append(_to_related_payload(extra, "county", "peer", _peer_reason(target, extra)))
    return out[:RELATED_TARGET_COUNT]


def pick_related_cities(
    target_fips: str, facts: dict[str, _PeerFacts],
) -> list[dict]:
    """City strategy: prioritize same-county siblings (Lodi from Stockton)
    over statewide profile-peers (Fontana from Stockton is too random).
    Up to 4 same-county slots + 1 statewide peer + 1 statewide contrast.
    Falls back to all-statewide when the county has too few siblings.
    """
    target = facts.get(target_fips)
    if target is None:
        return []
    same_county = [
        f for fips, f in facts.items()
        if fips != target_fips
        and target.county_fips
        and f.county_fips == target.county_fips
    ]
    statewide = [f for fips, f in facts.items() if fips != target_fips]
    if not statewide:
        return []
    same_county_ranked = sorted(same_county, key=lambda c: _peer_distance(target, c))
    statewide_ranked = sorted(statewide, key=lambda c: _peer_distance(target, c))

    out: list[dict] = []
    used: set[str] = set()
    SAME_COUNTY_SLOTS = 4
    for peer in same_county_ranked[:SAME_COUNTY_SLOTS]:
        out.append(_to_related_payload(peer, "city", "peer", _peer_reason(target, peer)))
        used.add(peer.fips)
    # One statewide profile-peer beyond the same-county set.
    for peer in statewide_ranked:
        if peer.fips in used:
            continue
        out.append(_to_related_payload(peer, "city", "peer", _peer_reason(target, peer)))
        used.add(peer.fips)
        break
    # Contrast pulled from statewide candidates so the contrast can actually
    # differ from the target's own neighbourhood (Lodi-vs-Stockton is too
    # close on EJ to teach anything).
    contrast = _pick_contrast(target, [f for f in statewide if f.fips not in used])
    if contrast:
        out.append(_to_related_payload(contrast, "city", "contrast", _contrast_reason(target, contrast)))
    # Fill remaining slots with next-closest statewide peers when same-county
    # was thin and no contrast was available.
    if len(out) < RELATED_TARGET_COUNT:
        for peer in statewide_ranked:
            if len(out) >= RELATED_TARGET_COUNT:
                break
            if peer.fips in used:
                continue
            out.append(_to_related_payload(peer, "city", "peer", _peer_reason(target, peer)))
            used.add(peer.fips)
    return out[:RELATED_TARGET_COUNT]


def build_county_peer_facts(
    *,
    state_slug: str,
    counties: dict,
    facilities: dict,
    county_pops: dict[str, int],
    county_percentiles: dict[str, list],
    county_medium_history: dict[str, dict[str, dict[int, float]]] | None = None,
    year: int = 0,
) -> dict[str, _PeerFacts]:
    """Build peer facts for every county that resolves to a valid name.

    Counties absent from `counties` (no current-year TRI rows) but present in
    other ingest dicts get a synthesised entry with zero pounds — they still
    deserve to appear in someone else's contrast slot if their EJ profile
    differs sharply.
    """
    out: dict[str, _PeerFacts] = {}
    for cfips, c in counties.items():
        in_county = [f for f in facilities.values() if f.county_fips == cfips]
        out[cfips] = _PeerFacts(
            fips=cfips,
            state=state_slug,
            name=c.name,
            slug=_county_slug(c.name, cfips),
            population=county_pops.get(cfips, 0),
            facilities_count=len(in_county),
            total_releases_pounds=c.pounds_total,
            dominant_medium=_dominant_medium(c.pounds_air, c.pounds_water, c.pounds_land),
            ej_pct_avg=_avg_ej_pct(county_percentiles.get(cfips)),
        )
    return out


def build_city_peer_facts(
    *,
    state_slug: str,
    place_to_facility_ids: dict[str, list],
    place_to_utilities: dict[str, list],
    place_to_canonical_county: dict[str, str],
    place_fips_to_name: dict[str, str],
    place_demos: dict,
    place_percentiles: dict[str, list],
    facilities: dict,
) -> dict[str, _PeerFacts]:
    """Per-place peer facts. Only places that get a programmatic page (≥1
    facility OR ≥1 county-filtered utility) participate.
    """
    out: dict[str, _PeerFacts] = {}
    eligible = set(place_to_facility_ids.keys()) | set(place_to_utilities.keys())
    for pf in eligible:
        place_name = place_fips_to_name.get(pf)
        if not place_name:
            continue
        ids = place_to_facility_ids.get(pf, [])
        facs = [facilities[fid] for fid in ids if fid in facilities]
        pounds_air = sum(f.pounds_air for f in facs)
        pounds_water = sum(f.pounds_water for f in facs)
        pounds_land = sum(f.pounds_land for f in facs)
        pounds_total = sum(f.pounds_total for f in facs)
        place_pop = (
            place_demos.get(pf).population
            if pf in place_demos and hasattr(place_demos.get(pf), "population")
            else 0
        )
        out[pf] = _PeerFacts(
            fips=pf,
            state=state_slug,
            name=place_name,
            slug=place_slug(place_name, pf),
            population=place_pop,
            facilities_count=len(facs),
            total_releases_pounds=pounds_total,
            dominant_medium=_dominant_medium(pounds_air, pounds_water, pounds_land),
            ej_pct_avg=_avg_ej_pct(place_percentiles.get(pf)),
            county_fips=place_to_canonical_county.get(pf),
        )
    return out


# ---- Facility ------------------------------------------------------------

def publish_facility(
    fac: FacilityAgg,
    year: int,
    chem_history: dict[str, dict[int, float]] | None = None,
    buffer_demographics: object | None = None,
    county_demographics: object | None = None,
    county_population: int = 0,
    flags: list | None = None,
) -> Path:
    """Write one facility JSON. chem_history (optional): per-chemical
    multi-year totals keyed by tri_chem_id, for the long-arc framing.

    Equity overlay uses the facility's containing-county data when provided
    — proper 3-mile-buffer aggregation is a future improvement.
    """
    chems = sorted(fac.chemicals.values(), key=lambda c: c.pounds_total, reverse=True)
    top = chems[:FACILITY_TOP_CHEMICALS]
    out_chemicals = [_facility_chemical_payload(c, chem_history, year) for c in top]

    # Sum chem_history across all chemicals to get the facility's total
    # multi-year history. Drives the hero chart + YoY + long-arc framing.
    fac_history: dict[int, float] = {}
    if chem_history:
        for chem_year_map in chem_history.values():
            for y, v in chem_year_map.items():
                fac_history[y] = fac_history.get(y, 0.0) + v
    if not fac_history:
        fac_history = {year: fac.pounds_total}
    material_baseline = _pick_material_baseline(fac_history, year)
    if material_baseline is not None:
        # Trim pre-operational years so the chart x-axis matches the long-arc copy.
        fac_history = {y: v for y, v in fac_history.items() if y >= material_baseline}
        baseline_year = material_baseline
        long_arc = _yoy_pct_change(fac_history.get(year), fac_history.get(material_baseline))
    else:
        baseline_year = min(fac_history.keys()) if fac_history else year
        long_arc = None
    history_pts = [{"year": y, "value": _round_pounds(v)} for y, v in sorted(fac_history.items())]
    yoy = _yoy_pct_change(fac_history.get(year), fac_history.get(year - 1))

    payload = {
        "facility": {
            "state": fac.state_slug,
            "state_label": _state_label(fac.state_slug),
            "slug": _facility_slug(fac.name, fac.facility_id),
            "name": fac.name,
            "parent_company": fac.parent_company,
            "address": fac.address,
            "city": fac.city,
            "county": fac.county_name,
            "county_slug": _county_slug(fac.county_name, fac.county_fips),
            "naics_label": fac.naics_label or "NAICS code not in joined response",
            "lat": fac.lat,
            "lng": fac.lng,
        },
        "reporting_year": year,
        "briefing_label": f"TRI {year} reporting year",
        "totals": {
            "total_releases_pounds": _round_pounds(fac.pounds_total),
            "air_releases_pounds": _round_pounds(fac.pounds_air),
            "water_releases_pounds": _round_pounds(fac.pounds_water),
            "land_releases_pounds": _round_pounds(fac.pounds_land),
            "chemicals_reported": len(fac.chemicals),
            "yoy_pct_change": yoy,
            "long_arc_pct_change": long_arc,
            "long_arc_baseline_year": baseline_year,
            "history": history_pts,
        },
        "chemicals": out_chemicals,
        "flags": [f.to_payload() for f in (flags or [])],
        # Facility equity overlay deliberately scopes to "who lives next to the
        # facility" — 3-mile buffer of pop-weighted block-group demographics.
        # National-percentile and EJ-disparity layers are intentionally NOT
        # rendered on facility pages: they're county-wide indicator levels and
        # implying the facility is responsible for them would over-claim.
        # Falls back to county-level demographics if the buffer is empty
        # (rural facility, missing lat/lng).
        "equity": _build_equity(
            population=(
                buffer_demographics.population if buffer_demographics is not None else county_population
            ),
            geography_label=(
                f"Within 3 miles of this facility "
                f"({buffer_demographics.block_groups_in_buffer} Census block groups, "
                "population-weighted demographics)"
                if buffer_demographics is not None
                else f"{fac.county_name} County, {fac.state_abbr} "
                "(no Census block groups within 3 miles — falling back to containing county)"
            ),
            demographics=buffer_demographics if buffer_demographics is not None else county_demographics,
            disparity_scores=None,
            percentiles=None,
            source=(
                "Census ACS 2018-2022 block-group demographics, population-weighted "
                "across the 3-mile buffer around this facility (from USEPA-clone/EJAM-open blockgroupstats)"
                if buffer_demographics is not None
                else "Census ACS 2018-2022 (5-year), county-level fallback"
            ),
        ),
        "source": {
            "label": "EPA Toxics Release Inventory",
            "url": "https://www.epa.gov/toxics-release-inventory-tri-program",
            "retrieved": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        },
        "_published_at": _now_iso(),
    }

    out = PUBLISHED_ROOT / "facility" / fac.state_slug / f"{payload['facility']['slug']}.json"
    write_json(out, payload)
    return out


def _facility_chemical_payload(
    c: FacilityChemical,
    chem_history: dict[str, dict[int, float]] | None,
    year: int,
) -> dict:
    history_map = (chem_history or {}).get(c.tri_chem_id, c.history)
    yoy = _yoy_pct_change(history_map.get(year), history_map.get(year - 1))
    material_baseline = _pick_material_baseline(history_map, year)
    if material_baseline is not None:
        trimmed = {y: v for y, v in history_map.items() if y >= material_baseline}
        baseline_year = material_baseline
        long_arc = _yoy_pct_change(trimmed.get(year), trimmed.get(material_baseline))
        history = sorted(trimmed.items())[-FACILITY_HISTORY_YEARS:]
    else:
        history = sorted(history_map.items())[-FACILITY_HISTORY_YEARS:]
        baseline_year = history[0][0] if history else year
        long_arc = None
    return {
        "chemical": c.chemical,
        "cas": c.cas or "",
        "category": c.category,
        "total_pounds_recent": _round_pounds(c.pounds_total),
        "history": [{"year": y, "value": _round_pounds(v)} for y, v in history],
        "yoy_pct_change": yoy,
        "long_arc_pct_change": long_arc,
        "long_arc_baseline_year": baseline_year,
    }


def _total_year(chemicals: dict[str, FacilityChemical], year: int) -> float:
    return sum(c.history.get(year, 0.0) for c in chemicals.values())


# ---- Water utility (Tier 1 entity, /water/[slug]) -----------------------

def publish_water(
    util: UtilityAgg,
    state_demographics: object | None = None,
    state_disparity_scores: list | None = None,
    state_percentiles: list | None = None,
    state_population: int = 0,
    state_label: str = "",
    county_fips: str | None = None,
    county_demographics: object | None = None,
    county_disparity_scores: list | None = None,
    county_percentiles: list | None = None,
    county_population: int = 0,
    county_name: str | None = None,
    place_fips: str | None = None,
    place_demographics: object | None = None,
    place_disparity_scores: list | None = None,
    place_percentiles: list | None = None,
    place_name: str | None = None,
    place_slug_value: str | None = None,
    flags: list | None = None,
) -> Path:
    """Write one city/water-utility JSON.

    Equity overlay geography preference:
        1. Census Place (city) — if utility city_name matches a place
        2. SDWIS county_served — when no place match
        3. State-level — when neither
    """
    earliest_year = min((v.year for v in util.violations), default=datetime.now(timezone.utc).year - 5)
    period_start = f"{earliest_year}-01-01"
    period_end = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # ---- Compute violation history per year + per severity bucket ----
    current_year = datetime.now(timezone.utc).year
    span_start = max(earliest_year, current_year - 9)  # 10-year cap
    years_in_range = list(range(span_start, current_year + 1))
    by_year_total = {y: 0 for y in years_in_range}
    by_year_health = {y: 0 for y in years_in_range}
    by_contaminant: dict[str, int] = {}
    last_violation_year = None
    for v in util.violations:
        if v.year in by_year_total:
            by_year_total[v.year] += 1
            if v.severity == "health_based":
                by_year_health[v.year] += 1
        by_contaminant[v.contaminant] = by_contaminant.get(v.contaminant, 0) + 1
        if last_violation_year is None or v.year > last_violation_year:
            last_violation_year = v.year
    history_total = [{"year": y, "value": by_year_total[y]} for y in years_in_range]
    history_health = [{"year": y, "value": by_year_health[y]} for y in years_in_range]
    top_contaminants = sorted(by_contaminant.items(), key=lambda kv: kv[1], reverse=True)[:6]
    years_since_last = (current_year - last_violation_year) if last_violation_year else None

    county_label = county_name  # arrives with its native Census suffix
    county_slug_value = (
        _county_slug(county_name, county_fips)
        if county_name and county_fips
        else None
    )
    payload = {
        "utility": {
            "state": util.state_slug,
            "state_label": state_label or _state_label(util.state_slug),
            "slug": utility_city_slug(util.name, util.pwsid),
            "name": util.name,
            "pwsid": util.pwsid,
            "population_served": util.population_served,
            "primary_source": util.primary_source,
            "owner_type": util.owner_type,
            "cities_served": [util.city_name] if util.city_name else [],
            "county": county_label,
            "county_slug": county_slug_value,
            "place_slug": place_slug_value,
        },
        "reporting_period": {"start": period_start, "end": period_end},
        "briefing_label": "SDWIS through latest publish",
        "totals": {
            "violations_5yr": util.violations_5yr,
            "health_based_violations_5yr": util.health_based_5yr,
            "unresolved_violations": util.unresolved,
            "contaminants_with_violations": util.contaminants_count,
            "years_since_last_violation": years_since_last,
        },
        "violations": [
            {
                "year": v.year,
                "contaminant": v.contaminant,
                "contaminant_code": v.contaminant_code,
                "severity": v.severity,
                "rule": v.rule,
                "is_unresolved": v.is_unresolved,
                "description": v.description,
            }
            for v in util.violations
        ],
        "metrics": {
            "violations_history": history_total,
            "health_based_history": history_health,
            "top_contaminants": [
                {"contaminant": k, "count": v} for k, v in top_contaminants
            ],
        },
        "flags": [f.to_payload() for f in (flags or [])],
        "equity": (
            _build_equity(
                population=place_demographics.population if place_demographics else 0,
                geography_label=(
                    f"{place_name or 'City'}, {_state_label(util.state_slug)} "
                    "(Census place; block-group disparity scores aggregated by centroid containment)"
                ),
                demographics=place_demographics,
                disparity_scores=place_disparity_scores,
                percentiles=place_percentiles,
            )
            if place_fips and place_demographics and place_disparity_scores
            else _build_equity(
                population=county_population,
                geography_label=(
                    f"{county_name or 'County'}, {_state_label(util.state_slug)} "
                    "(utility's served county per SDWIS GEOGRAPHIC_AREA — city-level not yet matched)"
                ),
                demographics=county_demographics,
                disparity_scores=county_disparity_scores,
                percentiles=county_percentiles,
            )
            if county_fips and county_demographics
            else _build_equity(
                population=state_population or util.population_served,
                geography_label=(
                    f"{_state_label(util.state_slug)} state-level "
                    "(neither place nor county matched for this utility)"
                ),
                demographics=state_demographics,
                disparity_scores=state_disparity_scores,
                percentiles=state_percentiles,
            )
        ),
        "source": {
            "label": "EPA Safe Drinking Water Information System",
            "url": "https://www.epa.gov/ground-water-and-drinking-water/safe-drinking-water-information-system-sdwis-federal-reporting",
            "retrieved": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        },
        "_published_at": _now_iso(),
    }
    out = PUBLISHED_ROOT / "water" / util.state_slug / f"{payload['utility']['slug']}.json"
    write_json(out, payload)
    return out


# ---- Superfund / NPL site (Tier 1 entity, /superfund/[slug]) ------------
#
# One per NPL-relevant site (Final / Proposed / Deleted / Withdrawn). The
# v1 hero is degraded relative to the §8 design — listing-date enrichment
# is Phase 1.5 work; until that lands the hero leads with status + city/
# county + federal-facility flag rather than "Listed YYYY — N years."
# WaterLinkageSection / OperatorSection / RelatedSites / PhaseTimeline
# are deliberately deferred.

def publish_superfund(
    site: SuperfundSiteAgg,
    state_label: str = "",
    buffer_demographics: object | None = None,
    buffer_radius_miles: float = 1.0,
    county_demographics: object | None = None,
    county_disparity_scores: list | None = None,
    county_percentiles: list | None = None,
    county_population: int = 0,
    place_demographics: object | None = None,
    place_disparity_scores: list | None = None,
    place_percentiles: list | None = None,
    place_population: int = 0,
    flags: list | None = None,
) -> Path:
    """Write one NPL-site entity JSON.

    Equity overlay falls through Buffer → Place (TIGER) → County → State.
    When the 1-mile buffer hits, demographics are population-weighted
    across the block groups whose centroid sits inside the buffer; this
    is the EPA EJScreen "Define an Area" approach. Disparity-score and
    national-percentile layers are dropped when buffer is the source —
    those layers are aggregated at place/county scope today and pairing
    them with buffer demographics would be inconsistent.
    """
    slug = _superfund_slug(site.name, site.epa_id)
    county_slug_value = (
        _county_slug(site.county_name, site.county_fips)
        if site.county_name and site.county_fips
        else None
    )
    city_slug_value = (
        place_slug(site.place_name, site.place_fips)
        if site.place_fips and site.place_name
        else None
    )
    county_label = site.county_name or None  # native Census suffix already attached

    payload = {
        "site": {
            "state": site.state_slug,
            "state_label": state_label or _state_label(site.state_slug),
            "slug": slug,
            "name": site.name,
            "epa_id": site.epa_id,
            "npl_status": site.npl_status,
            "is_active_npl": site.is_active_npl,
            "is_deleted": site.is_deleted,
            "is_federal_facility": site.is_federal_facility,
            "county": county_label,
            "county_slug": county_slug_value,
            "city": site.place_name or site.city_name or None,
            "city_slug": city_slug_value,
            "address": site.street_address,
            "zip": site.zip_code,
            "lat": site.lat,
            "lng": site.lng,
        },
        "briefing_label": "EPA Superfund SEMS through latest publish",
        "totals": {
            "contaminants_count": len(site.contaminants),
            "primary_contaminant": site.primary_contaminant,
        },
        "contaminants": [
            {
                "name": c.name,
                "media": c.media,
                "operable_units": c.operable_units,
                "citation_count": c.citation_count,
            }
            for c in site.contaminants
        ],
        "water_linkage": {
            "radius_miles": 3.0,
            "utilities": [
                {
                    "pwsid": u.pwsid,
                    "name": u.name,
                    "slug": utility_city_slug(u.name, u.pwsid),
                    "state": u.state_slug,
                    "distance_miles": u.distance_miles,
                    "place_name": u.place_name,
                    "primary_source": u.primary_source,
                    "owner_type": u.owner_type,
                    "population_served": u.population_served,
                    "health_based_5yr": u.health_based_5yr,
                    "unresolved": u.unresolved,
                }
                for u in site.water_linkage
            ],
        },
        "flags": [f.to_payload() for f in (flags or [])],
        "equity": (
            _build_equity(
                population=(
                    buffer_demographics.population
                    if buffer_demographics is not None
                    else 0
                ),
                geography_label=(
                    f"Within {buffer_radius_miles:.0f} mile"
                    f"{'s' if buffer_radius_miles != 1 else ''} of this site "
                    f"({buffer_demographics.block_groups_in_buffer} Census block groups, "
                    "population-weighted demographics)"
                ),
                demographics=buffer_demographics,
                disparity_scores=None,
                percentiles=None,
                source=(
                    f"Census ACS 2018-2022 block-group demographics, population-weighted "
                    f"across the {buffer_radius_miles:.0f}-mile buffer around this site "
                    "(from USEPA-clone/EJAM-open blockgroupstats)"
                ),
            )
            if buffer_demographics is not None
            else _build_equity(
                population=place_population,
                geography_label=(
                    f"{site.place_name}, {_state_label(site.state_slug)} "
                    f"(no Census block groups within {buffer_radius_miles:.0f} mile — "
                    "falling back to host city; disparity scores aggregated by centroid containment)"
                ),
                demographics=place_demographics,
                disparity_scores=place_disparity_scores,
                percentiles=place_percentiles,
            )
            if site.place_fips and place_demographics and place_disparity_scores
            else _build_equity(
                population=county_population,
                geography_label=(
                    f"{site.county_name} County, {_state_label(site.state_slug)} "
                    f"(no Census block groups within {buffer_radius_miles:.0f} mile and no host city — "
                    "falling back to containing county)"
                ),
                demographics=county_demographics,
                disparity_scores=county_disparity_scores,
                percentiles=county_percentiles,
            )
            if site.county_fips and county_demographics
            else _stub_equity(
                geography_label=f"{_state_label(site.state_slug)} state-level (no place or county match)",
                population=0,
            )
        ),
        "source": {
            "label": "EPA Superfund Enterprise Management System (SEMS)",
            "url": "https://www.epa.gov/superfund/superfund-data-and-reports",
            "retrieved": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        },
        "_published_at": _now_iso(),
    }
    out = PUBLISHED_ROOT / "superfund" / site.state_slug / f"{slug}.json"
    write_json(out, payload)
    return out


# ---- City hub (Tier 2 place, /city/[slug]) ------------------------------
#
# True place-aggregation: TRI in-city + GHG (county-share) + utilities
# serving the place + equity. Each utility surfaces as a row linking to its
# /water/[slug] entity page. This is the "is the environment here OK?" page
# anchored on the city, not on a single PWS.

def publish_city_hub(
    *,
    state_slug: str,
    place_fips: str,
    place_name: str,
    place_slug: str,
    facilities: list[FacilityAgg],
    utilities: list[UtilityAgg],
    facilities_chem_history: dict[str, dict[str, dict[int, float]]] | None,
    in_place_medium_history: dict[str, dict[int, float]] | None = None,
    year: int = 0,
    place_demographics: object | None,
    place_disparity_scores: list | None,
    place_percentiles: list | None,
    place_population: int,
    county_name: str | None,
    county_fips: str | None,
    county_ghg_history: dict[int, float] | None,
    county_air_history: dict[str, dict[int, float]] | None = None,
    county_airtox_history: dict[str, dict[int, float]] | None = None,
    health_indicators: list | None = None,
    flags: list | None = None,
    related_places: list[dict] | None = None,
    superfund_in_place: list[SuperfundSiteAgg] | None = None,
) -> Path:
    """Build the place-anchored city hub payload."""
    # In-city totals (TRI). Sum facility-level pounds; identical to county
    # rollup math, just over a different facility set.
    pounds_total = sum(f.pounds_total for f in facilities)
    pounds_air = sum(f.pounds_air for f in facilities)
    pounds_water = sum(f.pounds_water for f in facilities)
    pounds_land = sum(f.pounds_land for f in facilities)

    # In-city medium history — sum each year across all facilities × chemicals.
    # We have per-(facility × chem) history but not per-medium history at chem
    # level, so we use facility-current-year medium splits as a proxy for
    # mix-stable facilities and reconstruct year-totals from chem histories.
    in_city_history: dict[int, float] = {}
    for f in facilities:
        per_chem = (facilities_chem_history or {}).get(f.facility_id, {})
        for chem_year_map in per_chem.values():
            for y, v in chem_year_map.items():
                in_city_history[y] = in_city_history.get(y, 0.0) + v
    if not in_city_history:
        in_city_history = {year: pounds_total}

    history_pts = [{"year": y, "value": _round_pounds(v)} for y, v in sorted(in_city_history.items())]
    yoy = _yoy_pct_change(in_city_history.get(year), in_city_history.get(year - 1))
    baseline_year = min(in_city_history.keys()) if in_city_history else year
    long_arc = (
        _yoy_pct_change(in_city_history.get(year), in_city_history.get(baseline_year))
        if len(in_city_history) > 1 else None
    )

    # Pathways: criteria_air (county-as-proxy for air monitors — places are
    # too small to host their own AQS sites) followed by TRI air/water/land
    # and optional GHG county-share. Per-medium per-place history is summed
    # in main.py from each in-place facility's per-medium-per-year totals.
    pathways = (
        _criteria_air_pathways(air_history=county_air_history, year=year)
        + _hazardous_air_pathways(airtox_history=county_airtox_history, year=year)
        + _tri_pathways(
            current_air=pounds_air,
            current_water=pounds_water,
            current_land=pounds_land,
            medium_history=in_place_medium_history,
            year=year,
            ghg_history=county_ghg_history,
        )
    )

    # Top facilities in the city.
    top_facilities = sorted(facilities, key=lambda f: f.pounds_total, reverse=True)[:COUNTY_TOP_FACILITIES]

    # Utilities serving the place — full list, sorted to surface unresolved
    # health-based first then by population_served.
    sorted_utilities = sorted(
        utilities,
        key=lambda u: (
            u.unresolved > 0 and u.health_based_5yr > 0,
            u.health_based_5yr,
            u.population_served,
        ),
        reverse=True,
    )

    # Aggregate water-quality summary across all utilities in the city.
    water_summary = {
        "utilities_count": len(utilities),
        "population_served_total": sum(u.population_served for u in utilities),
        "violations_5yr_total": sum(u.violations_5yr for u in utilities),
        "health_based_5yr_total": sum(u.health_based_5yr for u in utilities),
        "unresolved_total": sum(u.unresolved for u in utilities),
        "utilities_with_unresolved": sum(1 for u in utilities if u.unresolved > 0),
    }

    payload = {
        "place": {
            "state": state_slug,
            "state_label": _state_label(state_slug),
            "slug": place_slug,
            "name": place_name,
            "fips": place_fips,
            "population": place_population,
            "county_name": county_name,
            "county_fips": county_fips,
        },
        "reporting_year": year,
        "briefing_label": f"TRI {year}",
        "totals": {
            "facilities_in_city": len(facilities),
            "utilities_serving": len(utilities),
            "total_releases_pounds": _round_pounds(pounds_total),
            "air_releases_pounds": _round_pounds(pounds_air),
            "water_releases_pounds": _round_pounds(pounds_water),
            "land_releases_pounds": _round_pounds(pounds_land),
            "yoy_pct_change": yoy,
            "long_arc_pct_change": long_arc,
            "long_arc_baseline_year": baseline_year,
            "history": history_pts,
        },
        "pathways": pathways,
        "facilities": [
            _facility_summary(f, chem_history=facilities_chem_history, year=year)
            for f in top_facilities
        ],
        "water": {
            **water_summary,
            "utilities": [_utility_summary(u) for u in sorted_utilities],
        },
        "superfund": [
            _superfund_summary(s)
            for s in sorted(
                superfund_in_place or [],
                key=lambda s: (_superfund_status_rank(s), s.name),
            )
        ],
        "flags": [f.to_payload() for f in (flags or [])],
        "equity": _build_equity(
            population=place_population,
            geography_label=f"{place_name}, {_state_label(state_slug)} (Census place block groups)",
            demographics=place_demographics,
            disparity_scores=place_disparity_scores,
            percentiles=place_percentiles,
        ),
        "health_indicators": health_indicators or [],
        "related_places": related_places or [],
        "sources": [
            {
                "label": "EPA Toxics Release Inventory",
                "url": "https://www.epa.gov/toxics-release-inventory-tri-program",
                "retrieved": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            },
            {
                "label": "EPA Safe Drinking Water Information System",
                "url": "https://www.epa.gov/ground-water-and-drinking-water/safe-drinking-water-information-system-sdwis-federal-reporting",
                "retrieved": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            },
        ],
        "_published_at": _now_iso(),
    }
    out = PUBLISHED_ROOT / "city" / state_slug / f"{place_slug}.json"
    write_json(out, payload)
    return out


def place_slug(name: str, fips: str) -> str:
    """URL slug for a Census Place. Strip 'city'/'town'/'CDP' suffixes for
    cleaner URLs (NAMELSAD has these baked in) — falls back to FIPS on
    pathological short names.
    """
    s = name.strip()
    base = slugify(s.lower())
    if not base or len(base) < 3:
        return f"place-{fips}"
    return base


# ---- County --------------------------------------------------------------

def publish_county(
    county: CountyAgg,
    facilities_in_county: list[FacilityAgg],
    year: int,
    population: int = 0,
    history: dict[int, float] | None = None,
    facilities_chem_history: dict[str, dict[str, dict[int, float]]] | None = None,
    medium_history: dict[str, dict[int, float]] | None = None,
    demographics: object | None = None,
    disparity_scores: list | None = None,
    percentiles: list | None = None,
    ghg_history: dict[int, float] | None = None,
    air_history: dict[str, dict[int, float]] | None = None,
    airtox_history: dict[str, dict[int, float]] | None = None,
    health_indicators: list | None = None,
    flags: list | None = None,
    cities_directory: list[dict] | None = None,
    related_places: list[dict] | None = None,
    superfund_in_county: list[SuperfundSiteAgg] | None = None,
) -> Path:
    top = sorted(facilities_in_county, key=lambda f: f.pounds_total, reverse=True)[:COUNTY_TOP_FACILITIES]
    sf_top = sorted(
        superfund_in_county or [],
        key=lambda s: (_superfund_status_rank(s), s.name),
    )[:10]
    history_map = history or {year: county.pounds_total}
    pathways = (
        _criteria_air_pathways(air_history=air_history, year=year)
        + _hazardous_air_pathways(airtox_history=airtox_history, year=year)
        + _tri_pathways(
            current_air=county.pounds_air,
            current_water=county.pounds_water,
            current_land=county.pounds_land,
            medium_history=medium_history,
            year=year,
            ghg_history=ghg_history,
        )
    )
    payload = {
        "county": {
            "state": county.state_slug,
            "state_label": _state_label(county.state_slug),
            "slug": _county_slug(county.name, county.fips),
            "name": county.name,
            "fips": county.fips,
            "population": population,
        },
        "reporting_year": year,
        "briefing_label": f"TRI {year}",
        "pathways": pathways,
        "facilities": [
            _facility_summary(f, chem_history=facilities_chem_history, year=year)
            for f in top
        ],
        "utilities": [],  # SDWIS ingest pending
        "superfund": [_superfund_summary(s) for s in sf_top],
        "superfund_total": len(superfund_in_county or []),
        "cities_directory": cities_directory or [],
        "flags": [f.to_payload() for f in (flags or [])],
        "equity": _build_equity(
            population=population,
            geography_label=f"All block groups in {county.name} County, {county.state_abbr}",
            demographics=demographics,
            disparity_scores=disparity_scores,
            percentiles=percentiles,
        ),
        "health_indicators": health_indicators or [],
        "related_places": related_places or [],
        "sources": [
            {
                "label": "EPA Toxics Release Inventory",
                "url": "https://www.epa.gov/toxics-release-inventory-tri-program",
                "retrieved": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            }
        ],
        "_published_at": _now_iso(),
    }
    out = PUBLISHED_ROOT / "county" / county.state_slug / f"{payload['county']['slug']}.json"
    write_json(out, payload)
    return out


def _utility_summary(u: UtilityAgg) -> dict:
    return {
        "slug": utility_city_slug(u.name, u.pwsid),
        "state": u.state_slug,
        "state_label": _state_label(u.state_slug),
        "name": u.name,
        "pwsid": u.pwsid,
        "population_served": u.population_served,
        "owner_type": u.owner_type,
        "health_based_violations_5yr": u.health_based_5yr,
        "unresolved": u.unresolved > 0,
    }


def _superfund_summary(agg: SuperfundSiteAgg) -> dict:
    """Summary card used in state/county/city Superfund-section tables.
    Mirrors the FacilitySummary / UtilitySummary shape — pre-computed slug,
    enough metadata for the table row, no contaminant detail (lives on the
    entity page).

    ``city_slug`` only populates when the site landed inside a TIGER place
    polygon (``place_fips``); otherwise the city cell renders unlinked.
    """
    return {
        "slug": _superfund_slug(agg.name, agg.epa_id),
        "state": agg.state_slug,
        "name": agg.name,
        "epa_id": agg.epa_id,
        "npl_status": agg.npl_status,
        "is_active_npl": agg.is_active_npl,
        "is_deleted": agg.is_deleted,
        "is_federal_facility": agg.is_federal_facility,
        "city": agg.place_name or agg.city_name or None,
        "city_slug": (
            place_slug(agg.place_name, agg.place_fips)
            if agg.place_fips and agg.place_name
            else None
        ),
        "primary_contaminant": agg.primary_contaminant,
    }


def _superfund_status_rank(agg: SuperfundSiteAgg) -> int:
    """Sort key: active NPL → Proposed → everything else (Deleted /
    Withdrawn). Federal-facility status doesn't enter — it's a chip, not a
    severity score.
    """
    if agg.is_active_npl:
        return 0
    if agg.npl_status == "Proposed for NPL":
        return 1
    return 2


def _facility_summary(
    f: FacilityAgg,
    chem_history: dict[str, dict[str, dict[int, float]]] | None = None,
    year: int = 0,
) -> dict:
    """Summary card used in state/county top-facilities tables. Computes YoY
    by summing the facility's per-chemical histories for ``year`` and
    ``year - 1``; returns None when prior-year data is missing.
    """
    top_chem = max(f.chemicals.values(), key=lambda c: c.pounds_total) if f.chemicals else None
    yoy = None
    if chem_history is not None and f.facility_id in chem_history and year:
        per_chem = chem_history[f.facility_id]
        cur = sum(years.get(year, 0.0) for years in per_chem.values())
        prev = sum(years.get(year - 1, 0.0) for years in per_chem.values())
        yoy = _yoy_pct_change(cur, prev)
    return {
        "slug": _facility_slug(f.name, f.facility_id),
        "state": f.state_slug,
        "state_label": _state_label(f.state_slug),
        "name": f.name,
        "parent_company": f.parent_company,
        "total_pounds_recent": _round_pounds(f.pounds_total),
        "yoy_pct_change": yoy,
        "top_chemical": top_chem.chemical if top_chem else "",
        "city": f.city,
        "lat": f.lat,
        "lng": f.lng,
    }


# ---- State ---------------------------------------------------------------

def publish_state(
    state: State,
    state_agg: StateAgg,
    counties: dict[str, CountyAgg],
    facilities: dict[str, FacilityAgg],
    year: int,
    history: dict[int, float] | None = None,
    utilities: dict[str, UtilityAgg] | None = None,
    county_history: dict[str, dict[int, float]] | None = None,
    chem_history: dict[str, dict[str, dict[int, float]]] | None = None,
    medium_history: dict[str, dict[int, float]] | None = None,
    county_populations: dict[str, int] | None = None,
    demographics: object | None = None,
    disparity_scores: list | None = None,
    percentiles: list | None = None,
    ghg_history: dict[int, float] | None = None,
    air_history: dict[str, dict[int, float]] | None = None,
    airtox_history: dict[str, dict[int, float]] | None = None,
    flags: list | None = None,
    superfund_sites: dict[str, SuperfundSiteAgg] | None = None,
) -> Path:
    facility_count = len(facilities)
    sf_map = superfund_sites or {}
    sf_top = sorted(
        sf_map.values(),
        key=lambda s: (_superfund_status_rank(s), s.name),
    )[:10]
    top_counties = sorted(
        counties.values(), key=lambda c: c.pounds_total, reverse=True
    )[:STATE_TOP_COUNTIES]
    top_facilities = sorted(
        facilities.values(), key=lambda f: f.pounds_total, reverse=True
    )[:STATE_TOP_FACILITIES]

    util_map = utilities or {}
    # Top utilities: highest-pop CWS, but always include any utility with an
    # unresolved health-based violation so those don't get hidden by size.
    # The frontend table heading reflects this dual-priority ordering.
    top_utility_objs = sorted(
        util_map.values(),
        key=lambda u: (u.health_based_5yr > 0 and u.unresolved > 0, u.population_served),
        reverse=True,
    )[:STATE_TOP_FACILITIES]
    # Full alphabetical directory of every county we have a published page
    # for — drives the bottom-of-state-page link sitemap. Mirrors the
    # crime-site `NeighborhoodDirectory` SEO pattern.
    counties_alphabetical = sorted(counties.values(), key=lambda c: c.name)

    history_map = history or {year: state_agg.pounds_total}
    history_pts = [{"year": y, "value": round(v)} for y, v in sorted(history_map.items())]
    baseline_year = min(history_map.keys()) if history_map else year
    long_arc = (
        _yoy_pct_change(history_map.get(year), history_map.get(baseline_year))
        if len(history_map) > 1 else None
    )

    # Cache the unique chemical fingerprints emitted by this state so
    # publish_home() can union them across states without re-reading every
    # facility JSON. CAS preferred; falls back to chemical name when CAS
    # is missing (a few PFAS categories have no CAS).
    chem_cas_keys: set[str] = set()
    for fac in facilities.values():
        for chem in fac.chemicals.values():
            chem_cas_keys.add(chem.cas or chem.chemical)

    payload = {
        "state": {
            "slug": state.slug,
            "name": state.name,
            "fips": state.fips,
            "population": state.population,
            "counties_total": state.counties_total,
        },
        "reporting_year": year,
        "briefing_label": f"TRI {year}",
        "totals": {
            "facilities_tracked": facility_count,
            "utilities_tracked": len(util_map),
            "npl_sites_tracked": len(sf_map),
            "counties_with_data": len(counties),
            "total_releases_pounds": round(state_agg.pounds_total),
            "yoy_pct_change": _yoy_pct_change(history_map.get(year), history_map.get(year - 1)),
            "long_arc_pct_change": long_arc,
            "long_arc_baseline_year": baseline_year,
        },
        "pathways": (
            _criteria_air_pathways(air_history=air_history, year=year)
            + _hazardous_air_pathways(airtox_history=airtox_history, year=year)
        ) + _tri_pathways(
            current_air=state_agg.pounds_air,
            current_water=state_agg.pounds_water,
            current_land=state_agg.pounds_land,
            medium_history=medium_history,
            year=year,
            ghg_history=ghg_history,
        ),
        "top_counties": [
            _county_summary(
                c, facilities,
                county_history=county_history, year=year,
                county_populations=county_populations,
            )
            for c in top_counties
        ],
        "counties_directory": [
            {
                "slug": _county_slug(c.name, c.fips),
                "name": c.name,
                "fips": c.fips,
                "facilities_count": len(c.facility_ids),
                "total_releases_pounds": _round_pounds(c.pounds_total),
            }
            for c in counties_alphabetical
        ],
        "top_facilities": [
            _facility_summary(f, chem_history=chem_history, year=year)
            for f in top_facilities
        ],
        "top_utilities": [_utility_summary(u) for u in top_utility_objs],
        "superfund": [_superfund_summary(s) for s in sf_top],
        "flags": [f.to_payload() for f in (flags or [])],
        "equity": _build_equity(
            population=state.population,
            geography_label=f"All {state.name} block groups",
            demographics=demographics,
            disparity_scores=disparity_scores,
            percentiles=percentiles,
        ),
        "sources": [
            {
                "label": "EPA Toxics Release Inventory",
                "url": "https://www.epa.gov/toxics-release-inventory-tri-program",
                "retrieved": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            }
        ],
        "_chem_cas": sorted(chem_cas_keys),
        "_published_at": _now_iso(),
    }
    out = PUBLISHED_ROOT / "state" / f"{state.slug}.json"
    write_json(out, payload)
    return out


def _county_summary(
    c: CountyAgg,
    facilities: dict[str, FacilityAgg],
    county_history: dict[str, dict[int, float]] | None = None,
    year: int = 0,
    county_populations: dict[str, int] | None = None,
) -> dict:
    fac_chemicals: dict[str, float] = {}
    for fid in c.facility_ids:
        fac = facilities.get(fid)
        if not fac:
            continue
        for chem in fac.chemicals.values():
            fac_chemicals[chem.chemical] = fac_chemicals.get(chem.chemical, 0) + chem.pounds_total
    top_chem = max(fac_chemicals.items(), key=lambda kv: kv[1])[0] if fac_chemicals else ""
    yoy = None
    if county_history is not None and c.fips in county_history and year:
        ch = county_history[c.fips]
        yoy = _yoy_pct_change(ch.get(year), ch.get(year - 1))
    population = (county_populations or {}).get(c.fips, 0)
    return {
        "slug": _county_slug(c.name, c.fips),
        "state": c.state_slug,
        "state_label": _state_label(c.state_slug),
        "name": c.name,
        "fips": c.fips,
        "population": population,
        "facilities_count": len(c.facility_ids),
        "total_releases_pounds": round(c.pounds_total),
        "yoy_pct_change": yoy,
        "top_chemical": top_chem,
    }


# ---- Home ----------------------------------------------------------------

def publish_home(
    states: list[State],
    state_aggs: dict[str, StateAgg],
    facilities_by_state: dict[str, dict[str, FacilityAgg]],
    counties_by_state: dict[str, dict[str, CountyAgg]],
    year: int,
    utilities_by_state: dict[str, dict[str, UtilityAgg]] | None = None,
    facility_flags: dict[str, dict[str, list]] | None = None,
    county_flags: dict[str, dict[str, list]] | None = None,
    utility_flags: dict[str, dict[str, list]] | None = None,
) -> Path:
    # Cumulative counts across every published state, not just the
    # current run's targets. publish_state has already written fresh
    # state.json files for current-run states by the time we get here,
    # so reading from disk gives a unified view.
    disk_totals, disk_chem_keys = _aggregate_published_state_totals()
    total_facilities = disk_totals["facilities"]
    total_counties = disk_totals["counties"]
    total_utilities = disk_totals["utilities"]
    total_superfund = disk_totals["superfund"]

    featured: list[dict] = []
    # Pick the top facility nationally (by pounds) for the first card. If
    # the facility has a flag, prefer the flag's summary over the generic
    # "largest single-facility TRI release" headline.
    all_facilities: list[FacilityAgg] = []
    for fmap in facilities_by_state.values():
        all_facilities.extend(fmap.values())
    if all_facilities:
        top_fac = max(all_facilities, key=lambda f: f.pounds_total)
        top_chem = max(top_fac.chemicals.values(), key=lambda c: c.pounds_total) if top_fac.chemicals else None
        flag = _top_flag((facility_flags or {}).get(top_fac.state_slug, {}).get(top_fac.facility_id, []))
        headline = flag.summary if flag else (
            f"Largest single-facility TRI release in the dataset"
            + (f"; top chemical {top_chem.chemical}." if top_chem else ".")
        )
        featured.append({
            "kind": "facility",
            "state": top_fac.state_slug,
            "slug": _facility_slug(top_fac.name, top_fac.facility_id),
            "name": top_fac.name,
            "state_label": _state_label(top_fac.state_slug),
            "headline": headline,
            "metric_label": f"Total releases · {year}",
            "metric_value": _short_pounds(top_fac.pounds_total),
            "flag_type": flag.type if flag else None,
        })
    # Top county nationally
    all_counties: list[CountyAgg] = []
    for cmap in counties_by_state.values():
        all_counties.extend(cmap.values())
    if all_counties:
        top_county = max(all_counties, key=lambda c: c.pounds_total)
        flag = _top_flag((county_flags or {}).get(top_county.state_slug, {}).get(top_county.fips, []))
        headline = flag.summary if flag else f"{len(top_county.facility_ids)} TRI facilities reporting in {year}."
        featured.append({
            "kind": "county",
            "state": top_county.state_slug,
            "slug": _county_slug(top_county.name, top_county.fips),
            "name": top_county.name,
            "state_label": _state_label(top_county.state_slug),
            "headline": headline,
            "metric_label": f"TRI releases · {year}",
            "metric_value": _short_pounds(top_county.pounds_total),
            "flag_type": flag.type if flag else None,
        })
    # Featured city: pick the most-populated utility with at least one
    # health-based violation (real story); fall back to most populated.
    all_utilities: list[UtilityAgg] = []
    for umap in (utilities_by_state or {}).values():
        all_utilities.extend(umap.values())
    if all_utilities:
        flagged = [u for u in all_utilities if u.health_based_5yr > 0]
        pool = flagged or all_utilities
        top_util = max(pool, key=lambda u: u.population_served)
        flag = _top_flag((utility_flags or {}).get(top_util.state_slug, {}).get(top_util.pwsid, []))
        if flag:
            headline = flag.summary
        elif top_util.health_based_5yr:
            headline = (
                f"{top_util.health_based_5yr} health-based SDWIS violation"
                f"{'s' if top_util.health_based_5yr != 1 else ''} in the past 5 years."
            )
        else:
            headline = "No health-based SDWIS violations in the past 5 years."
        featured.append({
            "kind": "water",
            "state": top_util.state_slug,
            "slug": utility_city_slug(top_util.name, top_util.pwsid),
            "name": top_util.name,
            "state_label": _state_label(top_util.state_slug),
            "headline": headline,
            "metric_label": "Population served",
            "metric_value": f"{top_util.population_served:,}",
            "flag_type": flag.type if flag else None,
        })

    payload = {
        "reporting_year": year,
        "briefing_label": f"TRI {year} · pipeline run {datetime.now(timezone.utc):%Y-%m-%d}",
        "totals": {
            "facilities_tracked": total_facilities,
            "utilities_tracked": total_utilities,
            "superfund_tracked": total_superfund,
            "counties_covered": total_counties,
            "chemicals_indexed": len(disk_chem_keys),
        },
        "featured": featured,
        "_published_at": _now_iso(),
    }
    out = PUBLISHED_ROOT / "home.json"
    write_json(out, payload)
    return out


def _aggregate_published_state_totals() -> tuple[dict[str, int], set[str]]:
    """Sum facility/utility/county counts across every state.json on disk
    and union each state's chemical fingerprint set.

    publish_state writes `_chem_cas` so the chemical union can dedupe
    across states without parsing facility JSONs. Legacy state.json
    files written before that field existed are handled by walking
    `data/published/facility/<slug>/*.json` once as a fallback.
    """
    state_dir = PUBLISHED_ROOT / "state"
    totals = {"facilities": 0, "utilities": 0, "superfund": 0, "counties": 0}
    chem_keys: set[str] = set()
    if not state_dir.exists():
        return totals, chem_keys
    for path in sorted(state_dir.glob("*.json")):
        try:
            data = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        st_totals = data.get("totals") or {}
        totals["facilities"] += int(st_totals.get("facilities_tracked") or 0)
        totals["utilities"] += int(st_totals.get("utilities_tracked") or 0)
        totals["superfund"] += int(st_totals.get("npl_sites_tracked") or 0)
        totals["counties"] += int(st_totals.get("counties_with_data") or 0)
        cas_list = data.get("_chem_cas")
        if cas_list:
            chem_keys.update(str(c) for c in cas_list)
        else:
            slug = (data.get("state") or {}).get("slug") or path.stem
            chem_keys.update(_walk_state_facility_chem_keys(slug))
    return totals, chem_keys


def _walk_state_facility_chem_keys(state_slug: str) -> set[str]:
    """Fallback for state.json files that predate the _chem_cas cache.
    Reads each published facility JSON for the state and extracts a
    CAS-or-name fingerprint per chemical."""
    keys: set[str] = set()
    fac_dir = PUBLISHED_ROOT / "facility" / state_slug
    if not fac_dir.exists():
        return keys
    for fpath in fac_dir.glob("*.json"):
        try:
            data = json.loads(fpath.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        for chem in data.get("chemicals") or []:
            key = chem.get("cas") or chem.get("chemical")
            if key:
                keys.add(str(key))
    return keys


def _top_flag(flags: list):
    """Return the highest-weighted flag from a list, or None when empty.
    Used by publish_home() to fold a flag-derived headline into each
    featured card. Imports lazily so the publish module stays importable
    without the flags package on PYTHONPATH (e.g. for unit tests that
    bypass main.py).
    """
    if not flags:
        return None
    from ..flags.types import severity_weight
    return max(flags, key=lambda f: severity_weight(f.severity))


def _short_pounds(p: float) -> str:
    if p >= 1_000_000:
        return f"{p/1_000_000:.1f}M lb"
    if p >= 1_000:
        return f"{p/1_000:.0f}k lb"
    return f"{p:.0f} lb"


def _yoy_pct_change(curr: float | None, prev: float | None) -> float | None:
    if curr is None or prev is None or prev <= 0:
        return None
    return round((curr - prev) / prev * 100, 1)


def _state_label(slug: str) -> str:
    from ..states import STATES
    return STATES[slug].name if slug in STATES else slug.upper()
