"""Aggregate raw TRI + SDWIS rows into facility / utility / county / state rollups.

Single module rather than several files because the rollups share
intermediate dicts. Splitting forces redundant grouping passes for no
clarity gain.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from ..ingest.sdwis import Violation, WaterSystem
from ..ingest.tri import TriRow
from ..normalize.chemicals import Category, cas_for, categorize
from ..normalize.contaminants import contaminant_name, rule_label, severity_for


@dataclass
class FacilityChemical:
    chemical: str
    cas: str | None
    tri_chem_id: str
    category: Category
    pounds_total: float = 0.0
    pounds_air: float = 0.0
    pounds_water: float = 0.0
    pounds_land: float = 0.0
    history: dict[int, float] = field(default_factory=dict)  # year -> pounds_total


@dataclass
class FacilityAgg:
    facility_id: str
    name: str
    parent_company: str | None
    address: str
    city: str
    county_name: str
    county_fips: str
    state_abbr: str
    state_slug: str  # 'ca'
    lat: float | None
    lng: float | None
    naics_label: str | None
    chemicals: dict[str, FacilityChemical] = field(default_factory=dict)  # by tri_chem_id
    pounds_total: float = 0.0
    pounds_air: float = 0.0
    pounds_water: float = 0.0
    pounds_land: float = 0.0


@dataclass
class CountyAgg:
    fips: str
    name: str
    state_abbr: str
    state_slug: str
    facility_ids: set[str] = field(default_factory=set)
    pounds_total: float = 0.0
    pounds_air: float = 0.0
    pounds_water: float = 0.0
    pounds_land: float = 0.0


@dataclass
class StateAgg:
    state_slug: str
    state_abbr: str
    pounds_total: float = 0.0
    pounds_air: float = 0.0
    pounds_water: float = 0.0
    pounds_land: float = 0.0


def aggregate(
    rows: list[TriRow],
    chem_info: dict[str, dict[str, Any]],
    state_slug: str,
    year: int,
    history: dict[int, float] | None = None,
) -> tuple[StateAgg, dict[str, CountyAgg], dict[str, FacilityAgg]]:
    """Aggregate a single year's worth of release rows.

    history (optional): {year: total_pounds} state-level multi-year history
    for the state-page sparkline. Per-facility history would require fetching
    every prior year's join — deferred until needed.
    """
    state = StateAgg(state_slug=state_slug, state_abbr=rows[0].state_abbr if rows else "")
    counties: dict[str, CountyAgg] = {}
    facilities: dict[str, FacilityAgg] = {}

    for r in rows:
        if not r.facility_id:
            continue
        fac = facilities.get(r.facility_id)
        if fac is None:
            fac = FacilityAgg(
                facility_id=r.facility_id,
                name=_clean_name(r.facility_name),
                parent_company=r.parent_company,
                address=r.address,
                city=r.city,
                county_name=r.county_name,
                county_fips=r.state_county_fips,
                state_abbr=r.state_abbr,
                state_slug=state_slug,
                lat=r.lat,
                lng=r.lng,
                naics_label=r.naics_label,
            )
            facilities[r.facility_id] = fac

        county = counties.get(r.state_county_fips)
        if county is None:
            county = CountyAgg(
                fips=r.state_county_fips,
                name=r.county_name,
                state_abbr=r.state_abbr,
                state_slug=state_slug,
            )
            counties[r.state_county_fips] = county

        chem = fac.chemicals.get(r.tri_chem_id)
        if chem is None:
            ci = chem_info.get(r.tri_chem_id)
            chem = FacilityChemical(
                chemical=r.chemical_name,
                cas=cas_for(ci),
                tri_chem_id=r.tri_chem_id,
                category=categorize(ci),
            )
            fac.chemicals[r.tri_chem_id] = chem

        chem.pounds_total += r.pounds
        chem.history[year] = chem.history.get(year, 0.0) + r.pounds

        if r.medium == "AIR":
            chem.pounds_air += r.pounds
            fac.pounds_air += r.pounds
            county.pounds_air += r.pounds
            state.pounds_air += r.pounds
        elif r.medium == "WATER":
            chem.pounds_water += r.pounds
            fac.pounds_water += r.pounds
            county.pounds_water += r.pounds
            state.pounds_water += r.pounds
        else:  # LAND / OTHER
            chem.pounds_land += r.pounds
            fac.pounds_land += r.pounds
            county.pounds_land += r.pounds
            state.pounds_land += r.pounds

        fac.pounds_total += r.pounds
        county.pounds_total += r.pounds
        county.facility_ids.add(r.facility_id)
        state.pounds_total += r.pounds

    return state, counties, facilities


_FAC_KEEP = {
    "INC", "INC.", "LLC", "L.L.C.", "L.L.C", "LP", "L.P.", "LTD", "CO", "CO.",
    "USA", "US", "PLC", "AG", "BV", "II", "III", "IV", "VI", "VII", "VIII", "IX",
}


# ---- Utility (SDWIS) aggregates ----------------------------------------

@dataclass
class UtilityViolation:
    pwsid: str
    year: int
    contaminant: str
    contaminant_code: str
    severity: str  # 'health_based' | 'monitoring' | 'other'
    rule: str
    is_unresolved: bool
    description: str


@dataclass
class UtilityAgg:
    pwsid: str
    name: str
    state_abbr: str
    state_slug: str
    population_served: int
    primary_source: str  # 'groundwater' | 'surface_water' | 'purchased' | 'mixed'
    city_name: str
    is_wholesaler: bool
    violations: list[UtilityViolation] = field(default_factory=list)

    @property
    def violations_5yr(self) -> int:
        return len(self.violations)

    @property
    def health_based_5yr(self) -> int:
        return sum(1 for v in self.violations if v.severity == "health_based")

    @property
    def unresolved(self) -> int:
        return sum(1 for v in self.violations if v.is_unresolved)

    @property
    def contaminants_count(self) -> int:
        return len({v.contaminant_code for v in self.violations})


_PRIMARY_SOURCE_MAP = {
    "GW": "groundwater",
    "SW": "surface_water",
    "GWP": "purchased",
    "SWP": "purchased",
    "GU": "mixed",
}


def aggregate_utilities(
    systems: list[WaterSystem],
    violations: list[Violation],
    state_slug: str,
) -> dict[str, UtilityAgg]:
    """Group violations by pwsid and attach to active CWS metadata."""
    by_id: dict[str, UtilityAgg] = {}
    for s in systems:
        by_id[s.pwsid] = UtilityAgg(
            pwsid=s.pwsid,
            name=s.name,
            state_abbr=s.state,
            state_slug=state_slug,
            population_served=s.population_served,
            primary_source=_PRIMARY_SOURCE_MAP.get(s.primary_source_code, "mixed"),
            city_name=s.city_name,
            is_wholesaler=s.is_wholesaler,
        )
    for v in violations:
        agg = by_id.get(v.pwsid)
        if agg is None:
            continue  # violation references a system we filtered out (TNCWS, inactive)
        year = _parse_year(v.compl_per_begin_date)
        agg.violations.append(
            UtilityViolation(
                pwsid=v.pwsid,
                year=year,
                contaminant=contaminant_name(v.contaminant_code),
                contaminant_code=v.contaminant_code,
                severity=severity_for(v.is_health_based, v.violation_category_code),
                rule=rule_label(v.rule_code),
                is_unresolved=v.rtc_date is None,
                description=_violation_description(v),
            )
        )
    # Sort each utility's violations newest-first.
    for agg in by_id.values():
        agg.violations.sort(key=lambda x: x.year, reverse=True)
    return by_id


def _parse_year(s: str | None) -> int:
    if not s:
        return 0
    try:
        return datetime.fromisoformat(str(s)[:10]).year
    except ValueError:
        return 0


def _violation_description(v: Violation) -> str:
    cat = {
        "MCL": "Maximum contaminant level exceeded",
        "TT": "Treatment technique violation",
        "MR": "Failure to monitor as scheduled",
        "MON": "Monitoring failure",
        "RPT": "Reporting failure",
        "MRDL": "Maximum residual disinfectant level exceeded",
        "Other": "Other rule violation",
    }.get(v.violation_category_code, v.violation_category_code or "Rule violation")
    if v.rtc_date:
        cat += "; returned to compliance"
    return cat


def _clean_name(name: str) -> str:
    """TRI facility names are ALL-CAPS; title-case but keep INC / LLC / LP / etc."""
    if not name:
        return name
    parts = []
    for w in name.split():
        parts.append(w.upper() if w.upper() in _FAC_KEEP else w.title())
    return " ".join(parts)
