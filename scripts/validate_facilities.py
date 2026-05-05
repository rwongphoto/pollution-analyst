"""Independent validator for published facility JSON.

Re-derives totals + identity directly from the cached bulk TRI CSVs (no
project pipeline imports) and diffs against the published payload. Lets
us catch aggregate logic bugs, slug/name drift, county misjoins, etc.

Usage:
    python scripts/validate_facilities.py [--all] [slug ...]
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "tri_bulk"
PUBLISHED = ROOT / "data" / "published" / "facility" / "ca"

AIR_COLS = ["51. 5.1 - FUGITIVE AIR", "52. 5.2 - STACK AIR"]
WATER_COLS = ["53. 5.3 - WATER"]
LAND_COLS = [
    "55. 5.4.1 - UNDERGROUND CL I",
    "56. 5.4.2 - UNDERGROUND C II-V",
    "58. 5.5.1A - RCRA C LANDFILL",
    "59. 5.5.1B - OTHER LANDFILLS",
    "60. 5.5.2 - LAND TREATMENT",
    "62. 5.5.3A - RCRA SURFACE IM",
    "63. 5.5.3B - OTHER SURFACE I",
    "64. 5.5.4 - OTHER DISPOSAL",
    "88. OFF-SITE RELEASE TOTAL",
]


def num(v):
    if v in (None, ""):
        return 0.0
    try:
        return float(v)
    except ValueError:
        return 0.0


def _round_pounds(v: float):
    """Mirror site.py:_round_pounds so the validator doesn't false-fail on
    sub-1-lb decimal preservation."""
    if v >= 1:
        return int(round(v))
    if v <= 0:
        return 0
    return round(v, 2)


def load_year(state: str, year: int) -> list[dict]:
    p = RAW / f"{state}_{year}.csv"
    if not p.exists():
        return []
    rows = []
    with p.open() as fh:
        for raw in csv.DictReader(fh):
            row = {(k or "").strip(): v for k, v in raw.items()}
            rows.append(row)
    return rows


def aggregate_by_facility(rows: list[dict]) -> dict[str, dict]:
    """Group rows by FRS ID, summing AIR/WATER/LAND across all chemicals."""
    by_fac = defaultdict(lambda: {
        "air": 0.0, "water": 0.0, "land": 0.0,
        "chem_ids": set(),
        "name": None, "address": None, "city": None,
        "county": None, "lat": None, "lng": None,
        "parent": None, "naics": None, "naics_sector": None,
        "rows": 0,
    })
    for row in rows:
        fid = (row.get("3. FRS ID") or row.get("2. TRIFD") or "").strip()
        if not fid:
            continue
        air = sum(num(row.get(c)) for c in AIR_COLS)
        water = sum(num(row.get(c)) for c in WATER_COLS)
        land = sum(num(row.get(c)) for c in LAND_COLS)
        if air <= 0 and water <= 0 and land <= 0:
            continue
        d = by_fac[fid]
        d["air"] += air
        d["water"] += water
        d["land"] += land
        d["chem_ids"].add((row.get("39. TRI CHEMICAL/COMPOUND ID") or "").strip())
        d["rows"] += 1
        # First-seen identity (in practice constant across rows)
        if d["name"] is None:
            d["name"] = row.get("4. FACILITY NAME") or ""
            d["address"] = row.get("5. STREET ADDRESS") or ""
            d["city"] = row.get("6. CITY") or ""
            d["county"] = row.get("7. COUNTY") or ""
            d["lat"] = num(row.get("12. LATITUDE")) or None
            d["lng"] = num(row.get("13. LONGITUDE")) or None
            d["parent"] = (row.get("17. STANDARD PARENT CO NAME")
                           or row.get("15. PARENT CO NAME") or "").strip()
            d["naics"] = row.get("30. PRIMARY NAICS") or ""
            d["naics_sector"] = row.get("23. INDUSTRY SECTOR") or ""
    return by_fac


def validate(slugs: list[str], reporting_year: int = 2024) -> int:
    # Load every CA year that we have history for.
    years = sorted(int(p.stem.split("_")[1]) for p in RAW.glob("CA_*.csv"))
    print(f"Loaded years: {years}")
    per_year = {y: aggregate_by_facility(load_year("CA", y)) for y in years}

    # Build a year-by-year totals lookup keyed by FRS ID for history check.
    history_by_fid: dict[str, dict[int, float]] = defaultdict(dict)
    for y, fac_map in per_year.items():
        for fid, d in fac_map.items():
            history_by_fid[fid][y] = d["air"] + d["water"] + d["land"]

    issues = 0
    for slug in slugs:
        path = PUBLISHED / f"{slug}.json"
        if not path.exists():
            print(f"\n[SKIP] {slug}: file missing")
            continue
        pub = json.loads(path.read_text())
        fac = pub["facility"]
        totals = pub["totals"]

        # Find this facility in the raw aggregate. Match by name+address since
        # the published JSON does NOT include FRS ID — so we have to identify
        # by identity fields.
        candidates = []
        for fid, d in per_year[reporting_year].items():
            # Loose match: name (case-insensitive) starts-with OR address match
            pn = fac["name"].upper().split(",")[0]
            rn = (d["name"] or "").upper()
            if (rn.startswith(pn[:20]) or pn.startswith(rn[:20])) and \
               d["address"].upper().startswith(fac["address"].upper()[:15]):
                candidates.append((fid, d))
        if not candidates:
            # Try address-only fallback
            for fid, d in per_year[reporting_year].items():
                if d["address"].upper() == fac["address"].upper() \
                   and d["city"].upper() == fac["city"].upper():
                    candidates.append((fid, d))

        if len(candidates) != 1:
            # Facility may have zero releases in 2023; check earlier years
            print(f"\n[{slug}] no unique 2023 match (n={len(candidates)}). "
                  f"Pub total={totals['total_releases_pounds']}, "
                  f"name={fac['name']!r}, addr={fac['address']!r}")
            # For zero-total facilities we expect this — check older years
            if totals["total_releases_pounds"] == 0:
                # Look across all years
                all_cands = set()
                for y in reversed(years):
                    for fid, d in per_year[y].items():
                        if d["address"].upper() == fac["address"].upper() \
                           and d["city"].upper() == fac["city"].upper():
                            all_cands.add(fid)
                print(f"    facilities matching address across all years: {all_cands}")
                if all_cands:
                    for fid in all_cands:
                        years_present = sorted(history_by_fid[fid].keys())
                        print(f"      FRS {fid}: years_with_data={years_present}, "
                              f"latest_total={history_by_fid[fid].get(max(years_present), 0):.0f}")
            issues += 1
            continue

        fid, d = candidates[0]
        # ---- Totals checks ----
        raw_total = _round_pounds(d["air"] + d["water"] + d["land"])
        raw_air = _round_pounds(d["air"])
        raw_water = _round_pounds(d["water"])
        raw_land = _round_pounds(d["land"])
        raw_chems = len(d["chem_ids"])

        ok = []
        if raw_total != totals["total_releases_pounds"]:
            ok.append(f"TOTAL diff: pub={totals['total_releases_pounds']} raw={raw_total}")
        if raw_air != totals["air_releases_pounds"]:
            ok.append(f"AIR diff: pub={totals['air_releases_pounds']} raw={raw_air}")
        if raw_water != totals["water_releases_pounds"]:
            ok.append(f"WATER diff: pub={totals['water_releases_pounds']} raw={raw_water}")
        if raw_land != totals["land_releases_pounds"]:
            ok.append(f"LAND diff: pub={totals['land_releases_pounds']} raw={raw_land}")
        if raw_chems != totals["chemicals_reported"]:
            ok.append(f"CHEMS diff: pub={totals['chemicals_reported']} raw={raw_chems}")

        # ---- Identity checks ----
        if abs((d["lat"] or 0) - (fac["lat"] or 0)) > 0.001:
            ok.append(f"LAT diff: pub={fac['lat']} raw={d['lat']}")
        if abs((d["lng"] or 0) - (fac["lng"] or 0)) > 0.001:
            ok.append(f"LNG diff: pub={fac['lng']} raw={d['lng']}")
        # County name (allow "X County" suffix on pub side)
        pub_county = fac["county"].upper().replace(" COUNTY", "").strip()
        if d["county"].upper().strip() != pub_county:
            ok.append(f"COUNTY diff: pub={fac['county']!r} raw={d['county']!r}")
        # Address (raw is uppercase; compare uppercase)
        if d["address"].upper().strip() != fac["address"].upper().strip():
            ok.append(f"ADDRESS diff: pub={fac['address']!r} raw={d['address']!r}")
        # NAICS code
        pub_naics_code = fac["naics_label"].split(" ")[0]
        if d["naics"] != pub_naics_code:
            ok.append(f"NAICS diff: pub={fac['naics_label']!r} raw={d['naics']!r}")

        # ---- History checks ----
        # Publish step trims to a 'material baseline' (see _pick_material_baseline
        # in publish/site.py); only compare years that appear in the published
        # history, since pre-baseline years are intentionally omitted.
        pub_hist = {h["year"]: h["value"] for h in totals["history"]}
        raw_hist = history_by_fid[fid]
        for y in sorted(pub_hist.keys()):
            pub_v = pub_hist.get(y, 0)
            raw_v = _round_pounds(raw_hist.get(y, 0))
            if pub_v != raw_v:
                ok.append(f"HIST {y} diff: pub={pub_v} raw={raw_v}")

        status = "OK" if not ok else "FAIL"
        print(f"\n[{status}] {slug}  (FRS {fid})")
        print(f"  name (pub):  {fac['name']}")
        print(f"  name (raw):  {d['name']}")
        print(f"  addr:        {fac['address']!r} ↔ {d['address']!r}")
        print(f"  city:        {fac['city']} ↔ {d['city']}")
        print(f"  county:      {fac['county']} ↔ {d['county']}")
        print(f"  parent:      {fac['parent_company']!r} ↔ {d['parent']!r}")
        print(f"  NAICS:       {fac['naics_label']!r} ↔ {d['naics']} {d['naics_sector']}")
        print(f"  lat/lng:     ({fac['lat']},{fac['lng']}) ↔ ({d['lat']},{d['lng']})")
        print(f"  totals (pub):  total={totals['total_releases_pounds']} air={totals['air_releases_pounds']} "
              f"water={totals['water_releases_pounds']} land={totals['land_releases_pounds']} chems={totals['chemicals_reported']}")
        print(f"  totals (raw):  total={raw_total} air={raw_air} water={raw_water} land={raw_land} chems={raw_chems}")
        if ok:
            for line in ok:
                print(f"  ! {line}")
            issues += 1
    print(f"\nSummary: {len(slugs)} checked, {issues} with issues")
    return issues


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("slugs", nargs="*")
    args = ap.parse_args()
    sys.exit(validate(args.slugs))
