"""long_arc_shift detector.

The Clean-Air-Act-decadal-arc story, generalized. Triggers on ≥50% change
between most-recent year and a baseline year ≥10 yr prior, with absolute
floors so the percent change is meaningful.
"""

from __future__ import annotations

from .prose import render_long_arc
from .types import Flag

# Pathway-specific minimum baseline values. Below these, percent changes
# are noise.
MIN_BASELINE_LB = 50_000        # TRI pathways
MIN_BASELINE_MTCO2E = 100_000   # GHG pathway
MIN_PCT_CHANGE = 0.50           # 50%
MIN_BASELINE_YEAR_GAP = 10      # baseline must be ≥10 yr prior


def detect_long_arc_geo(
    history: dict[int, float] | None,
    *,
    label: str,
    pathway_units: str,
    geography: str,
    recent_year: int,
) -> Flag | None:
    """Detect a long-arc shift on a single (geography × pathway) history.

    history: {year: pounds | mtCO2e}. label is the pathway display name
    (e.g. "TRI air releases"); pathway_units is "lb" or "mtCO2e";
    geography is the geography name for the prose ("Kern County").
    """
    if not history or recent_year not in history:
        return None
    years = sorted(history.keys())
    baseline_year = years[0]
    if recent_year - baseline_year < MIN_BASELINE_YEAR_GAP:
        return None
    baseline = history[baseline_year]
    recent = history[recent_year]
    floor = MIN_BASELINE_MTCO2E if pathway_units == "mtCO2e" else MIN_BASELINE_LB
    if baseline < floor:
        return None
    if baseline <= 0:
        return None
    pct = (recent - baseline) / baseline
    if abs(pct) < MIN_PCT_CHANGE:
        return None
    severity = "improvement" if pct < 0 else "regression"
    history_pts = [{"year": y, "value": round(history[y], 1) if history[y] < 1 else round(history[y])} for y in years]
    return Flag(
        type="long_arc_shift",
        severity=severity,
        label=label,
        summary=render_long_arc(label, geography, pct * 100, baseline_year, recent_year),
        magnitude_pct=round(pct * 100, 1),
        magnitude_abs=round(recent - baseline, 1),
        baseline_year=baseline_year,
        recent_year=recent_year,
        units=pathway_units,
        history=history_pts,
    )


def detect_long_arc_facility(
    *,
    fac_history: dict[int, float] | None,
    chem_histories: dict[str, dict[int, float]] | None,
    chem_names: dict[str, str],
    facility_label: str,
    recent_year: int,
) -> list[Flag]:
    """Emit long-arc flags at the facility level: one for the total, plus up
    to two for the largest chemicals that individually meet the threshold.

    chem_histories: {tri_chem_id: {year: pounds}}
    chem_names: {tri_chem_id: chemical name}
    """
    out: list[Flag] = []
    total = detect_long_arc_geo(
        fac_history,
        label="Total reported releases",
        pathway_units="lb",
        geography=facility_label,
        recent_year=recent_year,
    )
    if total is not None:
        out.append(total)
    # Per-chemical long arcs: only if the chemical itself crosses the
    # threshold AND the baseline value ≥ MIN_BASELINE_LB. Cap at 2 so the
    # facility "Notable signals" section doesn't get crowded.
    chem_flags: list[Flag] = []
    for cid, hist in (chem_histories or {}).items():
        cname = chem_names.get(cid, cid)
        f = detect_long_arc_geo(
            hist,
            label=cname,
            pathway_units="lb",
            geography=facility_label,
            recent_year=recent_year,
        )
        if f is not None:
            chem_flags.append(f)
    chem_flags.sort(key=lambda f: abs(f.magnitude_abs or 0), reverse=True)
    out.extend(chem_flags[:2])
    return out
