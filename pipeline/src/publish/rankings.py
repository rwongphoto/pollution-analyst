"""Cross-state rankings publisher.

Reads the per-page JSONs already written by `publish_county`,
`publish_city_hub`, and `publish_facility`, then emits a single
`rankings.json` payload that powers the three /rankings pages:

- /rankings/counties — top-10 most + top-10 least, per pathway lane
- /rankings/cities — same shape across published city hubs
- /rankings/facilities — top-20 most by TRI total releases (lb)

Reading the published JSONs (rather than re-deriving from aggregates) avoids
duplicating the pathway-summary logic that lives in publish/site.py. Run after
every per-state publish loop completes.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..config import PUBLISHED_ROOT
from .site import _now_iso, write_json


# A "lane" is one rankable indicator. (pathway, label_prefix) identifies
# the pathway entry inside a county/city published JSON. Prefix-match keeps
# us robust to NAAQS standard updates (e.g. PM2.5 9 -> 8 µg/m³) that change
# the parenthetical without changing the indicator name.
@dataclass(frozen=True)
class _Lane:
    key: str               # short id used by the frontend
    label: str             # display label on the table heading
    pathway: str           # PollutantPathway match
    label_prefix: str      # label-prefix match within that pathway
    units: str             # display units
    most_n: int            # how many rows in the "most polluted" table
    least_n: int           # 0 = no "least" table (skip)
    value_format: str      # "pounds" | "metric_tons" | "decimal3" | "decimal1"
    # County-derived value (PM2.5, AirToxScreen, GHG-county-share). For city
    # rankings, dedupe these to one city per county (largest by population)
    # so the table doesn't fill with sibling cities tied at the same value.
    county_derived: bool = False
    # Skip this lane on the city rankings page entirely (e.g. GHG-county-share
    # is a misleading frame for cities even after dedup).
    skip_on_cities: bool = False


PLACE_LANES: tuple[_Lane, ...] = (
    _Lane(
        key="pm25_annual",
        label="PM2.5 annual mean",
        pathway="criteria_air",
        label_prefix="PM2.5 annual mean",
        units="µg/m³",
        most_n=10,
        least_n=10,
        value_format="decimal3",
        county_derived=True,
    ),
    _Lane(
        key="cancer_risk",
        label="Lifetime cancer risk (all pollutants)",
        pathway="hazardous_air",
        label_prefix="Lifetime cancer risk",
        units="per million",
        most_n=10,
        least_n=10,
        value_format="decimal1",
        county_derived=True,
    ),
    _Lane(
        key="tri_air",
        label="TRI air releases",
        pathway="tri_air",
        label_prefix="TRI air releases",
        units="lb",
        most_n=10,
        # "Least" pool filters zeros (see _build_place_tables) so this answers
        # "of places with TRI activity, who reports the lowest releases?"
        # rather than alphabetizing the long tail of zero-emitter places.
        least_n=10,
        value_format="pounds",
    ),
    _Lane(
        key="ghg",
        label="Greenhouse gases (GHGRP)",
        pathway="ghg",
        label_prefix="",
        units="metric tons CO₂e",
        most_n=10,
        least_n=0,
        value_format="metric_tons",
        county_derived=True,
        skip_on_cities=True,  # county-share — ranking cities is editorially weak
    ),
)


def _format_value(value: float, fmt: str) -> str:
    if fmt == "pounds":
        if value >= 1_000_000:
            return f"{value/1_000_000:.1f}M lb"
        if value >= 1_000:
            return f"{value/1_000:.0f}k lb"
        return f"{value:,.0f} lb"
    if fmt == "metric_tons":
        if value >= 1_000_000:
            return f"{value/1_000_000:.1f}M mtCO₂e"
        if value >= 1_000:
            return f"{value/1_000:.0f}k mtCO₂e"
        return f"{value:,.0f} mtCO₂e"
    if fmt == "decimal3":
        return f"{value:.3f}"
    if fmt == "decimal1":
        return f"{value:.1f}"
    return f"{value}"


def _pick_pathway(payload: dict, lane: _Lane) -> dict | None:
    """Return the pathway entry matching this lane, or None."""
    for entry in payload.get("pathways") or []:
        if entry.get("pathway") != lane.pathway:
            continue
        if not lane.label_prefix:
            return entry
        if (entry.get("label") or "").startswith(lane.label_prefix):
            return entry
    return None


def _read_all(root: Path) -> list[tuple[str, dict]]:
    """Yield every (state_slug, payload) pair under data/published/<root>/."""
    out: list[tuple[str, dict]] = []
    if not root.exists():
        return out
    for state_dir in sorted(root.iterdir()):
        if not state_dir.is_dir():
            continue
        for jf in sorted(state_dir.glob("*.json")):
            try:
                out.append((state_dir.name, json.loads(jf.read_text())))
            except Exception:  # noqa: BLE001
                continue
    return out


def _county_rows(lane: _Lane, payloads: list[tuple[str, dict]]) -> list[dict]:
    rows: list[dict] = []
    for state_slug, p in payloads:
        entry = _pick_pathway(p, lane)
        if entry is None:
            continue
        v = entry.get("current")
        if v is None:
            continue
        county = p["county"]
        rows.append({
            "state": state_slug,
            "state_label": county.get("state_label") or state_slug.upper(),
            "slug": county["slug"],
            "name": county["name"],
            "population": county.get("population", 0),
            "value": float(v),
            "value_label": _format_value(float(v), lane.value_format),
        })
    return rows


def _city_rows(lane: _Lane, payloads: list[tuple[str, dict]]) -> list[dict]:
    rows: list[dict] = []
    for state_slug, p in payloads:
        entry = _pick_pathway(p, lane)
        if entry is None:
            continue
        v = entry.get("current")
        if v is None:
            continue
        place = p["place"]
        rows.append({
            "state": state_slug,
            "state_label": place.get("state_label") or state_slug.upper(),
            "slug": place["slug"],
            "name": place["name"],
            "county_name": place.get("county_name"),
            "population": place.get("population", 0),
            "value": float(v),
            "value_label": _format_value(float(v), lane.value_format),
        })
    return rows


def _dedupe_largest_per_county(rows: list[dict]) -> list[dict]:
    """For city rows on county-derived lanes: keep the largest-population city
    per (state, county) so the ranking doesn't fill with siblings tied at the
    same value. Rows missing a county_name are kept as-is.
    """
    by_key: dict[tuple, dict] = {}
    passthrough: list[dict] = []
    for r in rows:
        county = r.get("county_name")
        if not county:
            passthrough.append(r)
            continue
        key = (r["state"], county)
        keep = by_key.get(key)
        if keep is None or r.get("population", 0) > keep.get("population", 0):
            by_key[key] = r
    return list(by_key.values()) + passthrough


def _build_place_tables(
    payloads: list[tuple[str, dict]],
    row_builder,
    surface: str,  # "counties" | "cities"
) -> list[dict]:
    """Build the per-lane Most/Least tables for a place surface."""
    tables: list[dict] = []
    for lane in PLACE_LANES:
        if surface == "cities" and lane.skip_on_cities:
            continue
        rows = row_builder(lane, payloads)
        if not rows:
            continue
        if surface == "cities" and lane.county_derived:
            rows = _dedupe_largest_per_county(rows)
        # For pounds/metric-tons lanes, restrict both pools to positive values:
        # most-polluted shouldn't be padded by zero-emitter places, and least-
        # polluted answers the more interesting question — "of places with
        # reported activity, who is lowest?" — instead of alphabetizing the
        # long tail of places that simply host no facilities.
        positive_only = lane.value_format in ("pounds", "metric_tons")
        pool = [r for r in rows if r["value"] > 0] if positive_only else rows
        most_sorted = sorted(pool, key=lambda r: r["value"], reverse=True)[: lane.most_n]
        if most_sorted:
            tables.append({
                "lane": lane.key,
                "label": lane.label,
                "units": lane.units,
                "direction": "most",
                "county_derived": lane.county_derived,
                "positive_only": positive_only,
                "rows": [{"rank": i + 1, **r} for i, r in enumerate(most_sorted)],
            })
        if lane.least_n:
            least_sorted = sorted(pool, key=lambda r: r["value"])[: lane.least_n]
            if least_sorted:
                tables.append({
                    "lane": lane.key,
                    "label": lane.label,
                    "units": lane.units,
                    "direction": "least",
                    "county_derived": lane.county_derived,
                    "positive_only": positive_only,
                    "rows": [{"rank": i + 1, **r} for i, r in enumerate(least_sorted)],
                })
    return tables


def _facility_rows(payloads: list[tuple[str, dict]], top_n: int) -> list[dict]:
    return _facility_rows_for_field(payloads, "total_releases_pounds", top_n)


def _facility_rows_for_field(
    payloads: list[tuple[str, dict]], field: str, top_n: int
) -> list[dict]:
    rows: list[dict] = []
    for state_slug, p in payloads:
        totals = p.get("totals") or {}
        v = totals.get(field)
        if v is None or v <= 0:
            continue
        fac = p["facility"]
        chemicals = p.get("chemicals") or []
        top_chem = chemicals[0]["chemical"] if chemicals else None
        rows.append({
            "state": state_slug,
            "state_label": fac.get("state_label") or state_slug.upper(),
            "slug": fac["slug"],
            "name": fac["name"],
            "city": fac.get("city"),
            "county": fac.get("county"),
            "value": float(v),
            "value_label": _format_value(float(v), "pounds"),
            "top_chemical": top_chem,
        })
    rows.sort(key=lambda r: r["value"], reverse=True)
    rows = rows[:top_n]
    return [{"rank": i + 1, **r} for i, r in enumerate(rows)]


def _facility_tables(facilities: list[tuple[str, dict]]) -> list[dict]:
    """Build the four facility ranking tables: total + per-medium (air/water/land)."""
    specs = (
        ("tri_total", "Total TRI releases (air + water + land)", "total_releases_pounds", 20),
        ("tri_air", "TRI air releases", "air_releases_pounds", 10),
        ("tri_water", "TRI water releases", "water_releases_pounds", 10),
        ("tri_land", "TRI land releases", "land_releases_pounds", 10),
    )
    tables: list[dict] = []
    for lane, label, field, top_n in specs:
        rows = _facility_rows_for_field(facilities, field, top_n)
        if not rows:
            continue
        tables.append({
            "lane": lane,
            "label": label,
            "units": "lb",
            "direction": "most",
            "rows": rows,
        })
    return tables


# ---- States surface -----------------------------------------------------
# State-grain rankings parallel the county lanes — same indicators rolled up
# to the state level. Total TRI is read from `totals.total_releases_pounds`
# rather than a pathway entry; everything else uses the existing pathway
# label-prefix matcher. Pounds / metric-tons lanes set `positive_only` so
# the "least" pool answers "of states with reported activity, who reports
# the lowest releases?" rather than alphabetizing zero-activity states.

STATE_LANES: tuple[_Lane, ...] = (
    _Lane(
        key="tri_total",
        label="Total TRI releases (air + water + land)",
        pathway="",  # special-cased: read from totals.total_releases_pounds
        label_prefix="",
        units="lb",
        most_n=10,
        least_n=10,
        value_format="pounds",
    ),
    _Lane(
        key="tri_air",
        label="TRI air releases",
        pathway="tri_air",
        label_prefix="TRI air releases",
        units="lb",
        most_n=10,
        least_n=10,
        value_format="pounds",
    ),
    _Lane(
        key="tri_water",
        label="TRI water releases",
        pathway="tri_water",
        label_prefix="TRI water releases",
        units="lb",
        most_n=10,
        least_n=10,
        value_format="pounds",
    ),
    _Lane(
        key="tri_land",
        label="TRI land releases",
        pathway="tri_land",
        label_prefix="TRI land",
        units="lb",
        most_n=10,
        least_n=10,
        value_format="pounds",
    ),
    _Lane(
        key="pm25_annual",
        label="PM2.5 annual mean",
        pathway="criteria_air",
        label_prefix="PM2.5 annual mean",
        units="µg/m³",
        most_n=10,
        least_n=10,
        value_format="decimal3",
    ),
    _Lane(
        key="cancer_risk",
        label="Lifetime cancer risk (all pollutants)",
        pathway="hazardous_air",
        label_prefix="Lifetime cancer risk",
        units="per million",
        most_n=10,
        least_n=10,
        value_format="decimal1",
    ),
    _Lane(
        key="ghg",
        label="Greenhouse gases (GHGRP)",
        pathway="ghg",
        label_prefix="",
        units="metric tons CO₂e",
        most_n=10,
        least_n=10,
        value_format="metric_tons",
    ),
)


def _state_rows(lane: _Lane, payloads: list[tuple[str, dict]]) -> list[dict]:
    rows: list[dict] = []
    for state_slug, p in payloads:
        state = p.get("state") or {}
        totals = p.get("totals") or {}
        if lane.key == "tri_total":
            v = totals.get("total_releases_pounds")
        else:
            entry = _pick_pathway(p, lane)
            v = entry.get("current") if entry else None
        if v is None:
            continue
        rows.append({
            "state": state_slug,
            "state_label": state.get("name") or state_slug.upper(),
            "slug": state.get("slug") or state_slug,
            "name": state.get("name") or state_slug.upper(),
            "population": state.get("population", 0),
            "facilities_count": totals.get("facilities_tracked", 0),
            "value": float(v),
            "value_label": _format_value(float(v), lane.value_format),
        })
    return rows


def _build_state_tables(payloads: list[tuple[str, dict]]) -> list[dict]:
    tables: list[dict] = []
    for lane in STATE_LANES:
        rows = _state_rows(lane, payloads)
        if not rows:
            continue
        positive_only = lane.value_format in ("pounds", "metric_tons")
        pool = [r for r in rows if r["value"] > 0] if positive_only else rows
        most_sorted = sorted(pool, key=lambda r: r["value"], reverse=True)[: lane.most_n]
        if most_sorted:
            tables.append({
                "lane": lane.key,
                "label": lane.label,
                "units": lane.units,
                "direction": "most",
                "positive_only": positive_only,
                "rows": [{"rank": i + 1, **r} for i, r in enumerate(most_sorted)],
            })
        if lane.least_n:
            least_sorted = sorted(pool, key=lambda r: r["value"])[: lane.least_n]
            if least_sorted:
                tables.append({
                    "lane": lane.key,
                    "label": lane.label,
                    "units": lane.units,
                    "direction": "least",
                    "positive_only": positive_only,
                    "rows": [{"rank": i + 1, **r} for i, r in enumerate(least_sorted)],
                })
    return tables


# ---- Superfund surface --------------------------------------------------
# NPL sites don't have a magnitude metric like TRI pounds — SEMS only reports
# contaminants of concern (count + citation count) and operable units. The
# rankable signals are therefore (a) chemical diversity (count of distinct
# contaminants reported) and (b) downstream risk (count of nearby groundwater
# PWSes from the water_linkage block). "Least" tables aren't meaningful here
# — every NPL site is by definition contaminated; ranking the "least
# contaminated" devolves into sites that simply have sparser SEMS records.

def _superfund_rows_by_contaminants(payloads: list[tuple[str, dict]], top_n: int) -> list[dict]:
    rows: list[dict] = []
    for state_slug, p in payloads:
        site = p.get("site") or {}
        totals = p.get("totals") or {}
        v = totals.get("contaminants_count")
        if v is None or v <= 0:
            continue
        rows.append({
            "state": state_slug,
            "state_label": site.get("state_label") or state_slug.upper(),
            "slug": site["slug"],
            "name": site["name"],
            "city": site.get("city"),
            "city_slug": site.get("city_slug"),
            "county": site.get("county"),
            "npl_status": site.get("npl_status"),
            "is_federal_facility": bool(site.get("is_federal_facility")),
            "primary_contaminant": totals.get("primary_contaminant"),
            "value": float(v),
            "value_label": f"{int(v):,}",
        })
    rows.sort(key=lambda r: r["value"], reverse=True)
    rows = rows[:top_n]
    return [{"rank": i + 1, **r} for i, r in enumerate(rows)]


def _superfund_rows_by_water_linkage(payloads: list[tuple[str, dict]], top_n: int) -> list[dict]:
    rows: list[dict] = []
    for state_slug, p in payloads:
        site = p.get("site") or {}
        linkage = (p.get("water_linkage") or {}).get("utilities") or []
        v = len(linkage)
        if v <= 0:
            continue
        # Population served across all nearby groundwater PWSes — a richer
        # secondary metric than the raw utility count, surfaced in the row
        # so the table can show "12 utilities · 84,000 people" rather than
        # collapsing the human stake into a number alone.
        pop_served = sum(int(u.get("population_served") or 0) for u in linkage)
        rows.append({
            "state": state_slug,
            "state_label": site.get("state_label") or state_slug.upper(),
            "slug": site["slug"],
            "name": site["name"],
            "city": site.get("city"),
            "city_slug": site.get("city_slug"),
            "county": site.get("county"),
            "npl_status": site.get("npl_status"),
            "is_federal_facility": bool(site.get("is_federal_facility")),
            "population_served": pop_served,
            "value": float(v),
            "value_label": f"{int(v)} {'utility' if v == 1 else 'utilities'}",
        })
    rows.sort(key=lambda r: (r["value"], r.get("population_served", 0)), reverse=True)
    rows = rows[:top_n]
    return [{"rank": i + 1, **r} for i, r in enumerate(rows)]


def _superfund_tables(superfund: list[tuple[str, dict]]) -> list[dict]:
    """Build superfund ranking tables: contaminant diversity + nearby groundwater."""
    tables: list[dict] = []
    contam_rows = _superfund_rows_by_contaminants(superfund, top_n=20)
    if contam_rows:
        tables.append({
            "lane": "contaminants",
            "label": "Most contaminants reported",
            "units": "distinct contaminants",
            "direction": "most",
            "rows": contam_rows,
        })
    water_rows = _superfund_rows_by_water_linkage(superfund, top_n=10)
    if water_rows:
        tables.append({
            "lane": "water_linkage",
            "label": "Most nearby groundwater utilities",
            "units": "PWSes within 5 mi",
            "direction": "most",
            "rows": water_rows,
        })
    return tables


def _read_state_files(root: Path) -> list[tuple[str, dict]]:
    """Yield every (state_slug, payload) pair under data/published/state/.
    State files live one level shallower than the per-entity directories."""
    out: list[tuple[str, dict]] = []
    if not root.exists():
        return out
    for jf in sorted(root.glob("*.json")):
        try:
            out.append((jf.stem, json.loads(jf.read_text())))
        except Exception:  # noqa: BLE001
            continue
    return out


def publish_rankings(year: int) -> Path:
    """Read every county/city/facility/state/superfund published JSON and write rankings.json."""
    counties = _read_all(PUBLISHED_ROOT / "county")
    cities = _read_all(PUBLISHED_ROOT / "city")
    facilities = _read_all(PUBLISHED_ROOT / "facility")
    superfund = _read_all(PUBLISHED_ROOT / "superfund")
    states = _read_state_files(PUBLISHED_ROOT / "state")

    states_covered = sorted({s for s, _ in (counties + cities + facilities)})

    payload = {
        "_published_at": _now_iso(),
        "reporting_year": year,
        "states_covered": states_covered,
        "counts": {
            "counties": len(counties),
            "cities": len(cities),
            "facilities": len(facilities),
            "superfund": len(superfund),
            "states": len(states),
        },
        "counties": {
            "tables": _build_place_tables(counties, _county_rows, surface="counties"),
        },
        "cities": {
            "tables": _build_place_tables(cities, _city_rows, surface="cities"),
        },
        "facilities": {
            "tables": _facility_tables(facilities) if facilities else [],
        },
        "states": {
            "tables": _build_state_tables(states) if states else [],
        },
        "superfund": {
            "tables": _superfund_tables(superfund) if superfund else [],
        },
    }

    out = PUBLISHED_ROOT / "rankings.json"
    write_json(out, payload)
    return out
