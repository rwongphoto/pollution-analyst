"""Backfill `counties_directory` entries in published state JSON with
`fips` + `total_releases_pounds`, derived from each county's published
detail JSON. Avoids a full re-ingest just to get richer choropleth data
on the StateMap.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT / "data" / "published"


def county_burden(state: str, slug: str) -> tuple[str | None, int | None]:
    fp = PUB / "county" / state / f"{slug}.json"
    if not fp.exists():
        return None, None
    d = json.loads(fp.read_text())
    fips = d.get("county", {}).get("fips")
    total = 0
    for p in d.get("pathways", []):
        # TRI total = air + water + land. GHG and other pathways are not
        # in pounds and would inflate the choropleth comparison.
        if p.get("pathway", "").startswith("tri_"):
            total += p.get("current") or 0
    return fips, round(total)


def patch_state(state: str) -> int:
    state_fp = PUB / "state" / f"{state}.json"
    if not state_fp.exists():
        return 0
    d = json.loads(state_fp.read_text())
    n = 0
    for entry in d.get("counties_directory", []):
        slug = entry.get("slug")
        if not slug:
            continue
        fips, total = county_burden(state, slug)
        changed = False
        if fips and "fips" not in entry:
            entry["fips"] = fips
            changed = True
        if total is not None and "total_releases_pounds" not in entry:
            entry["total_releases_pounds"] = total
            changed = True
        if changed:
            n += 1
    if n:
        state_fp.write_text(json.dumps(d, indent=2))
        print(f"  state/{state}.json: patched {n} directory entries")
    return n


def main() -> int:
    states = [p.stem for p in (PUB / "state").glob("*.json")]
    grand_total = 0
    for s in sorted(states):
        print(f"== {s} ==")
        grand_total += patch_state(s)
    print(f"\ntotal counties_directory entries patched: {grand_total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
