"""TRI <-> GHGRP facility-ID join coverage audit.

Read-only. Loads cached TRI bulk CSVs and cached GHGRP joined Envirofacts
pages for a sample of states, then reports:

  - % of TRI rows carrying an FRS ID (vs falling back to TRIFD)
  - % of GHGRP rows carrying an FRS ID
  - Direct overlap (TRI FRS set ∩ GHGRP FRS set)
  - Lift from a fuzzy fallback (lat/lng < 100m + name token Jaccard >= 0.5)
    for the TRI facilities not matched on FRS.

Run from project root:
    .venv/bin/python scripts/audit_tri_ghgrp_join.py
"""

from __future__ import annotations

import csv
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRI_BULK = ROOT / "data" / "raw" / "tri_bulk"
GHGRP_CACHE = ROOT / "data" / "raw" / "envirofacts"

STATES = ["TX", "CA", "OH", "LA", "PA"]
YEAR = 2023  # last year with both TRI + GHGRP coverage (GHGRP 2024 is null)


# ---- TRI loader ----------------------------------------------------------

def load_tri(state: str, year: int) -> list[dict]:
    """Load TRI bulk CSV. Returns one row per facility (deduplicated by FRS-or-TRIFD)."""
    path = TRI_BULK / f"{state}_{year}.csv"
    if not path.exists():
        return []
    seen: dict[str, dict] = {}
    with path.open(newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            row = {(k or "").strip(): v for k, v in raw.items()}
            frs = (row.get("3. FRS ID") or "").strip()
            trifd = (row.get("2. TRIFD") or "").strip()
            key = frs or trifd
            if not key or key in seen:
                continue
            try:
                lat = float(row.get("12. LATITUDE") or "nan")
                lng = float(row.get("13. LONGITUDE") or "nan")
            except (TypeError, ValueError):
                lat = lng = float("nan")
            seen[key] = {
                "frs": frs,
                "trifd": trifd,
                "name": (row.get("4. FACILITY NAME") or "").strip().upper(),
                "parent": (row.get("14. PARENT COMPANY NAME") or "").strip().upper(),
                "lat": lat,
                "lng": lng,
                "state": state,
            }
    return list(seen.values())


# ---- GHGRP loader --------------------------------------------------------

def load_ghgrp(state: str, year: int) -> list[dict]:
    """Load all cached pages for ghgrp_join_{state}_{year}, deduplicate per facility_id."""
    cache_dir = GHGRP_CACHE / f"ghgrp_join_{state.lower()}_{year}"
    if not cache_dir.exists():
        return []
    seen: dict[int, dict] = {}
    for page in sorted(cache_dir.glob("page_*.json")):
        rows = json.loads(page.read_text())
        for r in rows:
            try:
                fid = int(r.get("facility_id"))
            except (TypeError, ValueError):
                continue
            if fid in seen:
                continue
            try:
                lat = float(r.get("latitude") or "nan")
                lng = float(r.get("longitude") or "nan")
            except (TypeError, ValueError):
                lat = lng = float("nan")
            seen[fid] = {
                "ghg_id": fid,
                "frs": (r.get("frs_id") or "").strip(),
                "name": (r.get("facility_name") or "").strip().upper(),
                "parent": (r.get("parent_company") or "").strip().upper(),
                "lat": lat,
                "lng": lng,
                "state": state,
            }
    return list(seen.values())


# ---- Fuzzy match helpers -------------------------------------------------

_TOKEN_RE = re.compile(r"[A-Z0-9]+")
_STOPWORDS = {
    "INC", "LLC", "LP", "CORP", "CO", "COMPANY", "PLANT", "FACILITY",
    "REFINERY", "REFINING", "CHEMICAL", "CHEMICALS", "GAS", "OIL",
    "THE", "OF", "AND", "&", "LTD", "PLC",
}


def name_tokens(name: str) -> set[str]:
    return {t for t in _TOKEN_RE.findall(name) if t not in _STOPWORDS and len(t) > 1}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def haversine_m(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    if any(math.isnan(x) for x in (a_lat, a_lng, b_lat, b_lng)):
        return float("inf")
    R = 6371000.0
    rlat1, rlat2 = math.radians(a_lat), math.radians(b_lat)
    dlat = math.radians(b_lat - a_lat)
    dlng = math.radians(b_lng - a_lng)
    h = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


# ---- Audit ---------------------------------------------------------------

def audit_state(state: str, year: int) -> dict:
    tri = load_tri(state, year)
    ghg = load_ghgrp(state, year)

    tri_frs = {r["frs"] for r in tri if r["frs"]}
    ghg_frs = {r["frs"] for r in ghg if r["frs"]}
    tri_with_frs = sum(1 for r in tri if r["frs"])
    ghg_with_frs = sum(1 for r in ghg if r["frs"])

    direct = tri_frs & ghg_frs

    # For GHGRP facilities not joined on FRS, count how many can be matched
    # to a TRI facility on (distance < 100m + name token Jaccard >= 0.5).
    # This isolates "would fuzzy actually rescue more facilities?" — a yes
    # means we need fuzzy; a no means FRS alone is sufficient.
    unmatched_ghg = [r for r in ghg if r["frs"] not in tri_frs]
    fuzzy_rescued = 0
    for g in unmatched_ghg:
        g_tokens = name_tokens(g["name"])
        for t in tri:
            if t["frs"] and t["frs"] in direct:
                continue
            d = haversine_m(g["lat"], g["lng"], t["lat"], t["lng"])
            if d > 100:
                continue
            if jaccard(g_tokens, name_tokens(t["name"])) >= 0.5:
                fuzzy_rescued += 1
                break

    return {
        "state": state,
        "tri_facilities": len(tri),
        "tri_with_frs": tri_with_frs,
        "tri_with_frs_pct": tri_with_frs / max(1, len(tri)) * 100,
        "ghg_facilities": len(ghg),
        "ghg_with_frs": ghg_with_frs,
        "ghg_with_frs_pct": ghg_with_frs / max(1, len(ghg)) * 100,
        "direct_overlap": len(direct),
        "direct_overlap_pct_of_ghg": len(direct) / max(1, len(ghg)) * 100,
        "ghg_unmatched_after_frs": len(unmatched_ghg),
        "fuzzy_rescued": fuzzy_rescued,
        "fuzzy_rescued_pct_of_ghg": fuzzy_rescued / max(1, len(ghg)) * 100,
    }


def main() -> None:
    print(f"Audit: TRI <-> GHGRP join coverage, {YEAR}, states={STATES}\n")
    print(f"{'State':<6} {'TRI':>6} {'TRI/FRS%':>9} {'GHG':>5} {'GHG/FRS%':>9} "
          f"{'Direct':>7} {'D/GHG%':>7} {'Unmatch':>8} {'Fuzzy+':>7} {'F/GHG%':>7}")
    print("-" * 86)
    totals = {"tri": 0, "ghg": 0, "direct": 0, "fuzzy": 0,
              "tri_frs": 0, "ghg_frs": 0, "unmatched": 0}
    for state in STATES:
        r = audit_state(state, YEAR)
        print(f"{r['state']:<6} {r['tri_facilities']:>6} "
              f"{r['tri_with_frs_pct']:>8.1f}% {r['ghg_facilities']:>5} "
              f"{r['ghg_with_frs_pct']:>8.1f}% {r['direct_overlap']:>7} "
              f"{r['direct_overlap_pct_of_ghg']:>6.1f}% "
              f"{r['ghg_unmatched_after_frs']:>8} {r['fuzzy_rescued']:>7} "
              f"{r['fuzzy_rescued_pct_of_ghg']:>6.1f}%")
        totals["tri"] += r["tri_facilities"]
        totals["tri_frs"] += r["tri_with_frs"]
        totals["ghg"] += r["ghg_facilities"]
        totals["ghg_frs"] += r["ghg_with_frs"]
        totals["direct"] += r["direct_overlap"]
        totals["unmatched"] += r["ghg_unmatched_after_frs"]
        totals["fuzzy"] += r["fuzzy_rescued"]
    print("-" * 86)
    tri_frs_pct = totals["tri_frs"] / max(1, totals["tri"]) * 100
    ghg_frs_pct = totals["ghg_frs"] / max(1, totals["ghg"]) * 100
    direct_pct = totals["direct"] / max(1, totals["ghg"]) * 100
    fuzzy_pct = totals["fuzzy"] / max(1, totals["ghg"]) * 100
    print(f"{'Total':<6} {totals['tri']:>6} {tri_frs_pct:>8.1f}% "
          f"{totals['ghg']:>5} {ghg_frs_pct:>8.1f}% "
          f"{totals['direct']:>7} {direct_pct:>6.1f}% "
          f"{totals['unmatched']:>8} {totals['fuzzy']:>7} {fuzzy_pct:>6.1f}%")
    print()
    print("Legend:")
    print("  TRI/FRS%  = % of TRI facilities with an FRS ID")
    print("  GHG/FRS%  = % of GHGRP facilities with an FRS ID")
    print("  Direct    = facilities matched FRS<->FRS (numerator over GHGRP count)")
    print("  Unmatch   = GHGRP facilities not matched on FRS")
    print("  Fuzzy+    = those rescued by (dist<100m AND name Jaccard>=0.5)")


if __name__ == "__main__":
    main()
