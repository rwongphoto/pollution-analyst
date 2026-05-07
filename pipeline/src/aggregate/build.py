"""Aggregate raw TRI + SDWIS + Superfund rows into facility / utility /
superfund-site / county / state rollups.

Single module rather than several files because the rollups share
intermediate dicts. Splitting forces redundant grouping passes for no
clarity gain.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from ..ingest.sdwis import Violation, WaterSystem
from ..ingest.superfund import Contaminant, SuperfundSite
from ..ingest.tri import TriRow
from ..normalize.chemicals import Category, cas_for, categorize
from ..normalize.contaminants import contaminant_name, rule_label, severity_for

log = logging.getLogger(__name__)


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
    owner_type: str | None  # 'local' | 'mixed' | 'tribal' | 'private' | 'state' | 'federal' | None
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

# SDWIS WATER_SYSTEM.owner_type_code → normalized vocabulary. Empty / unrecognized
# codes map to None so the frontend can omit the chip rather than render "Unknown."
_OWNER_TYPE_MAP = {
    "L": "local",     # local government — municipal utilities, water districts
    "M": "mixed",     # mixed public/private ownership
    "N": "tribal",    # Native American (tribal) ownership
    "P": "private",   # privately owned (mobile-home parks, HOAs, investor-owned)
    "S": "state",     # state government
    "F": "federal",   # federal government
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
            owner_type=_OWNER_TYPE_MAP.get(s.owner_type_code),
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


# ---- Superfund (NPL site) aggregates -----------------------------------

@dataclass
class SuperfundContaminant:
    """One row per distinct (contaminant, exposure-pathway) at a site.
    The same contaminant can appear in multiple media (e.g. lead in both
    soil and sediment) — each pathway is a separate row so the entity-page
    contaminants table can show pathway tags per contaminant.
    """
    name: str                  # title-cased preferred name from EPA
    media: str                 # 'Groundwater' | 'Soil' | 'Sediment' | 'Surface Water' | etc.
    operable_units: list[str] = field(default_factory=list)
    citation_count: int = 0    # how many SEMS rows mentioned this (name, media)


@dataclass
class NearbyGroundwaterUtility:
    """One PWS within the configured buffer radius of a Superfund site.
    Lives on SuperfundSiteAgg.water_linkage. The distance is computed from
    the site lat/lon to the served-place centroid — coarse, since SDWIS
    doesn't expose treatment-plant lat/lon. The page disclosure language
    needs to make that explicit.
    """
    pwsid: str
    name: str
    state_slug: str
    distance_miles: float
    place_name: str
    primary_source: str          # 'groundwater' | 'mixed' | 'purchased' | 'surface_water'
    owner_type: str | None       # 'local' | 'mixed' | 'tribal' | 'private' | 'state' | 'federal' | None
    population_served: int
    health_based_5yr: int
    unresolved: bool


@dataclass
class SuperfundSiteAgg:
    """Per-NPL-site aggregate. One per entity page."""
    site_id: str               # SEMS internal, joins contaminants
    epa_id: str                # URL-stable EPA ID
    name: str
    state_abbr: str
    state_slug: str
    npl_status: str            # verbatim from SEMS
    is_active_npl: bool
    is_deleted: bool
    is_federal_facility: bool
    # Geography — county is from EPA's authoritative fips_code; place is
    # from TIGER point-in-polygon (None when site is in unincorporated area
    # or missing coords).
    county_name: str
    county_fips: str           # 5-digit
    city_name: str             # EPA-supplied label (may differ from TIGER place)
    place_fips: str | None     # 7-digit TIGER place GEOID, or None
    place_name: str | None     # canonical TIGER place name, or None
    lat: float | None
    lng: float | None
    street_address: str
    zip_code: str
    contaminants: list[SuperfundContaminant] = field(default_factory=list)
    water_linkage: list[NearbyGroundwaterUtility] = field(default_factory=list)

    @property
    def primary_contaminant(self) -> str | None:
        """Most-cited COC by SEMS row count. Used in roll-up tables on
        state / county / city pages.
        """
        if not self.contaminants:
            return None
        return max(self.contaminants, key=lambda c: c.citation_count).name


def aggregate_superfund(
    sites: list[SuperfundSite],
    contaminants: list[Contaminant],
    state_slug: str,
    state_fips: str,
) -> dict[str, SuperfundSiteAgg]:
    """Roll SEMS sites + contaminants into entity-page-ready aggregates.

    Returns ``{epa_id: SuperfundSiteAgg}``. Place assignment is via TIGER
    point-in-polygon on the existing spatial machinery; sites missing
    coordinates or sitting in unincorporated areas get ``place_fips=None``.
    County FIPS is taken verbatim from EPA's authoritative ``fips_code``.
    """
    from ..spatial.places import assign_facilities_to_places, load_places

    # ----- TIGER place assignment via lat/lng ---------------------------
    site_points = [
        (s.site_id, s.latitude, s.longitude)
        for s in sites
        if s.latitude is not None and s.longitude is not None
    ]
    if site_points:
        place_to_sites = assign_facilities_to_places(site_points, state_fips)
        place_names = {p.fips: p.name for p, _ in load_places(state_fips)}
    else:
        place_to_sites = {}
        place_names = {}

    site_to_place: dict[str, tuple[str, str]] = {}
    for place_fips, site_ids in place_to_sites.items():
        name = place_names.get(place_fips, "")
        for sid in site_ids:
            site_to_place[sid] = (place_fips, name)

    # ----- Contaminants → per-site deduped list -------------------------
    raw_by_site: dict[str, dict[tuple[str, str], SuperfundContaminant]] = defaultdict(dict)
    for c in contaminants:
        key = (c.name, c.media)
        bucket = raw_by_site[c.site_id]
        existing = bucket.get(key)
        if existing is None:
            bucket[key] = SuperfundContaminant(
                name=c.name,
                media=c.media,
                operable_units=[c.operable_unit] if c.operable_unit else [],
                citation_count=1,
            )
        else:
            existing.citation_count += 1
            if c.operable_unit and c.operable_unit not in existing.operable_units:
                existing.operable_units.append(c.operable_unit)

    # ----- Build per-site aggregates ------------------------------------
    out: dict[str, SuperfundSiteAgg] = {}
    placed = 0
    for s in sites:
        place_fips, place_name = site_to_place.get(s.site_id, (None, None))
        if place_fips:
            placed += 1
        site_conts = sorted(
            raw_by_site.get(s.site_id, {}).values(),
            key=lambda c: (-c.citation_count, c.name, c.media),
        )
        out[s.epa_id] = SuperfundSiteAgg(
            site_id=s.site_id,
            epa_id=s.epa_id,
            name=s.name,
            state_abbr=s.state,
            state_slug=state_slug,
            npl_status=s.npl_status,
            is_active_npl=s.is_active_npl,
            is_deleted=s.is_deleted,
            is_federal_facility=s.is_federal_facility,
            county_name=s.county_name,
            county_fips=s.fips_code,
            city_name=s.city_name,
            place_fips=place_fips,
            place_name=place_name,
            lat=s.latitude,
            lng=s.longitude,
            street_address=s.street_address,
            zip_code=s.zip_code,
            contaminants=site_conts,
        )
    log.info(
        "Superfund agg %s: %d sites, %d assigned to a TIGER place, %d unincorporated/no-coord",
        state_slug,
        len(out),
        placed,
        len(out) - placed,
    )
    return out


def attach_water_linkage(
    superfund_aggs: dict[str, SuperfundSiteAgg],
    utilities: dict[str, UtilityAgg],
    state_fips: str,
    place_name_to_fips: dict[str, str],
    radius_miles: float = 3.0,
) -> None:
    """For each NPL site, find groundwater-sourced PWSes whose served-city
    centroid sits within ``radius_miles`` of the site lat/lon. Mutates
    each SuperfundSiteAgg.water_linkage in place.

    Coarse by design: SDWIS does not expose individual well lat/lon, so we
    use the served city's TIGER place centroid as the PWS coordinate. The
    entity page surfaces this caveat so readers don't read the result as
    "wellheads within 3 miles."

    Empty result is editorially meaningful — "no groundwater PWSes within
    {radius_miles} mi" is itself a finding worth surfacing on the page.
    """
    from ..spatial.facility_buffer import _haversine_miles  # noqa: PLC0415
    from ..spatial.places import place_centroids  # noqa: PLC0415

    centroids = place_centroids(state_fips)
    candidates: list[tuple[UtilityAgg, float, float]] = []
    for u in utilities.values():
        if u.primary_source not in ("groundwater", "mixed"):
            continue
        if not u.city_name:
            continue
        pf = place_name_to_fips.get(u.city_name.strip().upper())
        if not pf:
            continue
        latlng = centroids.get(pf)
        if not latlng:
            continue
        candidates.append((u, *latlng))
    if not candidates:
        log.info("Superfund water linkage: no candidate groundwater/mixed PWSes resolved to a TIGER place centroid")
        return

    placed = 0
    for sf in superfund_aggs.values():
        if sf.lat is None or sf.lng is None:
            continue
        nearby: list[NearbyGroundwaterUtility] = []
        for u, ulat, ulng in candidates:
            d = _haversine_miles(sf.lat, sf.lng, ulat, ulng)
            if d > radius_miles:
                continue
            nearby.append(NearbyGroundwaterUtility(
                pwsid=u.pwsid,
                name=u.name,
                state_slug=u.state_slug,
                distance_miles=round(d, 2),
                place_name=u.city_name,
                primary_source=u.primary_source,
                owner_type=u.owner_type,
                population_served=u.population_served,
                health_based_5yr=u.health_based_5yr,
                unresolved=u.unresolved > 0,
            ))
        nearby.sort(key=lambda n: n.distance_miles)
        sf.water_linkage = nearby
        if nearby:
            placed += 1
    log.info(
        "Superfund water linkage: %d of %d sites have ≥1 groundwater PWS within %.1f mi",
        placed, len(superfund_aggs), radius_miles,
    )
