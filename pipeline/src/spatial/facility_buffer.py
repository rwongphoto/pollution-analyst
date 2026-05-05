"""Population-weighted demographic aggregation within a radius of a facility.

For TRI facility pages, the equity overlay should describe *who lives in the
immediate vicinity* — not the demographics of the entire containing county.
County-as-proxy is fine for state and county pages, but on a facility page it
both over-claims (Marin's 1.1M residents aren't all "next to" Chevron Richmond)
and misleads (it implies the facility's footprint is county-wide).

Standard approach: 3-mile circular buffer around the facility's lat/lng,
intersect with Census block-group centroids, population-weighted average of
demographic shares. This mirrors what EJScreen's "Define an Area" tool did
before EPA retired it.

Block-group centroid source: TIGER 2020 BG shapefile's INTPTLAT/INTPTLON
attributes (pre-computed internal points guaranteed inside each polygon).
Demographic columns: pop, pctlowinc, pctmin, pctunder5, pctover64 from
blockgroupstats.rda (USEPA-clone/EJAM-open).
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass

from ..config import RAW_ROOT
from .places import _ensure_zip, _tiger_dir

log = logging.getLogger(__name__)

DEFAULT_RADIUS_MILES = 3.0
EARTH_RADIUS_MILES = 3958.8


@dataclass
class BufferDemographics:
    """Population-weighted demographic aggregate within a buffer radius."""
    population: int
    pct_low_income: float | None
    pct_people_of_color: float | None
    pct_under_5: float | None
    pct_over_64: float | None
    block_groups_in_buffer: int


def _haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * math.asin(math.sqrt(a))


def _load_bg_centroids(state_fips: str) -> list[tuple[str, float, float]]:
    """Return [(bgfips, lat, lng), ...] from TIGER 2020 BG shapefile.

    Uses INTPTLAT/INTPTLON columns (pre-computed internal points) so we don't
    have to compute centroids from polygon geometry on every run.
    """
    import shapefile  # pyshp
    _ensure_zip(state_fips, "BG")
    shp_path = _tiger_dir() / f"tl_2020_{state_fips}_bg.shp"
    sf = shapefile.Reader(str(shp_path))
    fields = [f[0] for f in sf.fields[1:]]
    out: list[tuple[str, float, float]] = []
    for sr in sf.iterShapeRecords():
        rec = dict(zip(fields, sr.record))
        bgfips = str(rec.get("GEOID") or "")
        try:
            lat = float(rec.get("INTPTLAT") or "")
            lng = float(rec.get("INTPTLON") or "")
        except (TypeError, ValueError):
            continue
        if not bgfips:
            continue
        out.append((bgfips, lat, lng))
    log.info("Loaded %d block-group centroids for state %s", len(out), state_fips)
    return out


def compute_facility_buffer_demographics(
    facility_points: list[tuple[str, float, float]],
    state_fips: str,
    radius_miles: float = DEFAULT_RADIUS_MILES,
) -> dict[str, BufferDemographics]:
    """For each facility (id, lat, lng), compute pop-weighted demographics
    across block groups whose centroid falls within ``radius_miles``.

    Returns ``{facility_id: BufferDemographics}``. Facilities with no
    block-groups in their buffer (e.g., far from any populated area, or
    missing lat/lng) are absent from the output — caller falls back to
    county-level demographics.
    """
    # Load BG centroids and the demographic table once.
    bg_centroids = _load_bg_centroids(state_fips)
    if not bg_centroids:
        return {}

    from ..ingest.ejscreen import _load_blockgroupstats  # noqa: PLC0415
    df = _load_blockgroupstats()
    # Filter to in-state rows once. ``ST`` is the state postal code, e.g.
    # "CA". Map FIPS → postal via Census table.
    from ..states import STATES  # noqa: PLC0415
    state_abbr = next((s.abbr for s in STATES.values() if s.fips == state_fips), None)
    if state_abbr is None:
        log.warning("facility_buffer: unknown state_fips %s", state_fips)
        return {}
    sub = df[df["ST"] == state_abbr.upper()]
    # Index demographics by bgfips for O(1) lookup.
    demo_cols = ["pop", "pctlowinc", "pctmin", "pctunder5", "pctover64"]
    available = [c for c in demo_cols if c in sub.columns]
    demo_by_bg: dict[str, dict[str, float | None]] = {}
    for _, row in sub.iterrows():
        bgfips = str(row.get("bgfips") or "")
        if not bgfips:
            continue
        demo_by_bg[bgfips] = {c: row.get(c) for c in available}

    # Pre-compute a coarse bbox per radius for fast pre-filter. At CA's avg
    # latitude (~37°N), 1° latitude ≈ 69 miles, 1° longitude ≈ 55 miles.
    # 3 miles ≈ 0.044° lat, 0.055° lng. Add a 10% margin so haversine
    # filter doesn't miss edge cases at higher latitudes.
    bbox_lat = (radius_miles / 69.0) * 1.1
    bbox_lng = (radius_miles / 55.0) * 1.1

    out: dict[str, BufferDemographics] = {}
    for fac_id, fac_lat, fac_lng in facility_points:
        if fac_lat is None or fac_lng is None:
            continue
        # Pre-filter by bbox
        candidates = [
            (bgfips, bg_lat, bg_lng)
            for bgfips, bg_lat, bg_lng in bg_centroids
            if abs(bg_lat - fac_lat) <= bbox_lat and abs(bg_lng - fac_lng) <= bbox_lng
        ]
        # Refine to true radius
        in_buffer: list[str] = []
        for bgfips, bg_lat, bg_lng in candidates:
            if _haversine_miles(fac_lat, fac_lng, bg_lat, bg_lng) <= radius_miles:
                in_buffer.append(bgfips)
        if not in_buffer:
            continue

        # Pop-weighted aggregate of demographic shares.
        total_pop = 0.0
        weighted: dict[str, float] = {c: 0.0 for c in ("pctlowinc", "pctmin", "pctunder5", "pctover64")}
        weights: dict[str, float] = {c: 0.0 for c in weighted}
        for bgfips in in_buffer:
            d = demo_by_bg.get(bgfips)
            if not d:
                continue
            pop = d.get("pop")
            if pop is None or (isinstance(pop, float) and math.isnan(pop)) or pop <= 0:
                continue
            total_pop += float(pop)
            for col in weighted:
                v = d.get(col)
                if v is None or (isinstance(v, float) and math.isnan(v)):
                    continue
                weighted[col] += float(v) * float(pop)
                weights[col] += float(pop)

        if total_pop <= 0:
            continue

        # blockgroupstats.rda stores demographic shares as 0-1 fractions; the
        # rest of the pipeline (and the frontend templates) work in 0-100
        # percentages. Multiply by 100 here so the values match the shape
        # the equity overlay expects.
        out[fac_id] = BufferDemographics(
            population=int(round(total_pop)),
            pct_low_income=round((weighted["pctlowinc"] / weights["pctlowinc"]) * 100, 1) if weights["pctlowinc"] > 0 else None,
            pct_people_of_color=round((weighted["pctmin"] / weights["pctmin"]) * 100, 1) if weights["pctmin"] > 0 else None,
            pct_under_5=round((weighted["pctunder5"] / weights["pctunder5"]) * 100, 1) if weights["pctunder5"] > 0 else None,
            pct_over_64=round((weighted["pctover64"] / weights["pctover64"]) * 100, 1) if weights["pctover64"] > 0 else None,
            block_groups_in_buffer=len(in_buffer),
        )
    log.info(
        "facility_buffer: computed demographics for %d/%d facilities (radius %.1f mi)",
        len(out), len(facility_points), radius_miles,
    )
    return out
