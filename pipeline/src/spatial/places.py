"""Block-group → Census Place spatial lookup.

Reads TIGER 2020 shapefiles (block-group polygons + place polygons) and
maps each block-group GEOID to a containing place_fips via centroid-in-polygon.

Block groups can technically straddle place boundaries; we assign a single
place via centroid containment, which is the standard simplification for
demographic / EJ aggregation.

Cache: per-state JSON file ``data/raw/tiger/bg_to_place_<state>.json``.
"""

from __future__ import annotations

import json
import logging
import zipfile
from dataclasses import dataclass
from pathlib import Path

import httpx

from ..config import RAW_ROOT

log = logging.getLogger(__name__)

USER_AGENT = "PollutionAnalystAi/0.1 (+contact: ops@pollutionanalyst.ai)"
TIGER_BASE = "https://www2.census.gov/geo/tiger/TIGER2020"


def _tiger_dir() -> Path:
    return RAW_ROOT / "tiger"


def _ensure_zip(state_fips: str, kind: str) -> Path:
    """kind: 'BG' or 'PLACE'."""
    d = _tiger_dir()
    d.mkdir(parents=True, exist_ok=True)
    fname = f"tl_2020_{state_fips}_{kind.lower()}.zip"
    p = d / fname
    if p.exists() and p.stat().st_size > 1000:
        return p
    url = f"{TIGER_BASE}/{kind}/{fname}"
    log.info("TIGER: downloading %s", fname)
    with httpx.Client(timeout=300.0, headers={"User-Agent": USER_AGENT}) as c:
        r = c.get(url)
        r.raise_for_status()
    p.write_bytes(r.content)
    # Unzip to same dir
    with zipfile.ZipFile(p) as z:
        z.extractall(d)
    return p


@dataclass
class Place:
    fips: str    # 7-digit (state + 5-digit place code) or 5-digit place code
    name: str
    namelsad: str  # e.g. "Stockton city"


def load_places(state_fips: str) -> list[tuple[Place, object]]:
    """Return list of (Place, shapely.geometry.Polygon)."""
    import shapefile  # pyshp
    from shapely.geometry import shape  # noqa: PLC0415

    _ensure_zip(state_fips, "PLACE")
    shp_path = _tiger_dir() / f"tl_2020_{state_fips}_place.shp"
    out: list[tuple[Place, object]] = []
    sf = shapefile.Reader(str(shp_path))
    fields = [f[0] for f in sf.fields[1:]]  # skip DeletionFlag
    for sr in sf.iterShapeRecords():
        rec = dict(zip(fields, sr.record))
        place_fips = str(rec.get("GEOID") or "")
        if not place_fips:
            continue
        geom = shape(sr.shape.__geo_interface__)
        out.append((
            Place(
                fips=place_fips,
                name=str(rec.get("NAME") or "").strip(),
                namelsad=str(rec.get("NAMELSAD") or "").strip(),
            ),
            geom,
        ))
    log.info("Places loaded for state %s: %d", state_fips, len(out))
    return out


def build_bg_to_place(state_fips: str) -> dict[str, str]:
    """Return {bgfips: place_fips}. Cached on disk after first build."""
    cache = _tiger_dir() / f"bg_to_place_{state_fips}.json"
    if cache.exists():
        return json.loads(cache.read_text())

    import shapefile  # pyshp
    from shapely.geometry import shape  # noqa: PLC0415
    from shapely.strtree import STRtree

    _ensure_zip(state_fips, "BG")
    shp_path = _tiger_dir() / f"tl_2020_{state_fips}_bg.shp"

    place_pairs = load_places(state_fips)
    place_geoms = [g for _, g in place_pairs]
    place_fips = [p.fips for p, _ in place_pairs]
    tree = STRtree(place_geoms)

    sf = shapefile.Reader(str(shp_path))
    fields = [f[0] for f in sf.fields[1:]]
    out: dict[str, str] = {}
    n_assigned = 0
    n_total = 0
    for sr in sf.iterShapeRecords():
        n_total += 1
        rec = dict(zip(fields, sr.record))
        bgfips = str(rec.get("GEOID") or "")
        if not bgfips:
            continue
        bg_geom = shape(sr.shape.__geo_interface__)
        centroid = bg_geom.representative_point()  # always inside the polygon
        candidates = tree.query(centroid)
        # STRtree returns indices in newer shapely; iter and test
        for idx in candidates:
            try:
                idx_int = int(idx)
            except (TypeError, ValueError):
                continue
            if 0 <= idx_int < len(place_geoms) and place_geoms[idx_int].contains(centroid):
                out[bgfips] = place_fips[idx_int]
                n_assigned += 1
                break
    log.info("BG→Place: %d/%d block groups assigned to a place (rest are unincorporated)",
             n_assigned, n_total)
    cache.write_text(json.dumps(out))
    return out
