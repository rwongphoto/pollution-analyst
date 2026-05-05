"""One-shot: copy lat/lng from each facility detail JSON onto the
top_facilities / facilities arrays in state, county, and city payloads.

Pipeline change in publish/site.py adds these fields going forward; this
script avoids a full re-ingest just to populate them on existing JSON.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT / "data" / "published"


def load_facility_coords(state: str) -> dict[str, tuple[float | None, float | None]]:
    coords: dict[str, tuple[float | None, float | None]] = {}
    fac_dir = PUB / "facility" / state
    if not fac_dir.exists():
        return coords
    for fp in fac_dir.glob("*.json"):
        with fp.open() as f:
            d = json.load(f)
        fac = d.get("facility", {})
        slug = fac.get("slug")
        if slug:
            coords[slug] = (fac.get("lat"), fac.get("lng"))
    return coords


def patch_array(arr, coords, key="top_facilities"):
    n = 0
    for entry in arr:
        slug = entry.get("slug")
        if slug in coords and "lat" not in entry:
            entry["lat"], entry["lng"] = coords[slug]
            n += 1
    return n


def patch_state(state: str) -> int:
    coords = load_facility_coords(state)
    if not coords:
        print(f"  no facility coords for {state}", file=sys.stderr)
        return 0
    total = 0

    state_fp = PUB / "state" / f"{state}.json"
    if state_fp.exists():
        d = json.loads(state_fp.read_text())
        n = patch_array(d.get("top_facilities", []), coords)
        if n:
            state_fp.write_text(json.dumps(d, indent=2))
            print(f"  state/{state}.json: patched {n} facilities")
            total += n

    cty_dir = PUB / "county" / state
    if cty_dir.exists():
        for fp in cty_dir.glob("*.json"):
            d = json.loads(fp.read_text())
            n = patch_array(d.get("facilities", []), coords)
            if n:
                fp.write_text(json.dumps(d, indent=2))
                total += n
        print(f"  county/{state}/: total patches across counties")

    city_dir = PUB / "city" / state
    if city_dir.exists():
        for fp in city_dir.glob("*.json"):
            d = json.loads(fp.read_text())
            n = patch_array(d.get("facilities", []), coords)
            if n:
                fp.write_text(json.dumps(d, indent=2))
                total += n

    return total


def main() -> int:
    states = [p.name for p in (PUB / "facility").iterdir() if p.is_dir()]
    grand_total = 0
    for s in sorted(states):
        print(f"== {s} ==")
        grand_total += patch_state(s)
    print(f"\ntotal facility entries patched: {grand_total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
