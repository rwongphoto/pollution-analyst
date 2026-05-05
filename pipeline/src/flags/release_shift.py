"""release_shift detector — facility × chemical YoY TRI shifts.

Tuned for facility-level TRI noise (±100% YoY at small facilities is
routine). The combined relative + absolute floor + prior-year minimum
keeps the flag for material movements only.
"""

from __future__ import annotations

from .prose import render_release_shift
from .types import Flag

MIN_PCT_CHANGE = 0.50      # 50% YoY
MIN_ABS_LB = 10_000        # 10k lb absolute delta (anti-tiny-base noise)
MIN_PRIOR_LB = 1_000       # prior-year baseline must be ≥1k lb


def detect_release_shifts(
    *,
    chem_histories: dict[str, dict[int, float]] | None,
    chem_names: dict[str, str],
    facility_label: str,
    recent_year: int,
    cap: int = 3,
) -> list[Flag]:
    """One Flag per chemical that crosses the threshold. Sorted by absolute
    delta desc, capped at ``cap``.
    """
    if not chem_histories:
        return []
    out: list[Flag] = []
    prior_year = recent_year - 1
    for cid, hist in chem_histories.items():
        recent = hist.get(recent_year, 0.0)
        prior = hist.get(prior_year, 0.0)
        if prior < MIN_PRIOR_LB or prior <= 0:
            continue
        delta = recent - prior
        if abs(delta) < MIN_ABS_LB:
            continue
        pct = delta / prior
        if abs(pct) < MIN_PCT_CHANGE:
            continue
        severity = "surge" if delta > 0 else "drop"
        cname = chem_names.get(cid, cid)
        years = sorted(hist.keys())
        history_pts = [{"year": y, "value": round(hist[y], 1) if hist[y] < 1 else round(hist[y])} for y in years]
        out.append(Flag(
            type="release_shift",
            severity=severity,
            label=cname,
            summary=render_release_shift(cname, facility_label, prior, recent, prior_year, recent_year),
            magnitude_pct=round(pct * 100, 1),
            magnitude_abs=round(delta, 1),
            baseline_year=prior_year,
            recent_year=recent_year,
            units="lb",
            history=history_pts,
        ))
    out.sort(key=lambda f: abs(f.magnitude_abs or 0), reverse=True)
    return out[:cap]
