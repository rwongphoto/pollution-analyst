"""ghg_step detector — county-level GHGRP YoY shifts.

v1 emits at county level only. Facility-level needs a TRI↔GHGRP facility-ID
join (TRI uses TRIFID, GHGRP uses its own facility_id) — deferred until
that join exists. County totals are clean signals (well-defined sum) and
already in the publish payload.
"""

from __future__ import annotations

from .prose import render_ghg_step
from .types import Flag

MIN_PCT_CHANGE = 0.30      # 30% YoY
MIN_RECENT_MTCO2E = 10_000
MIN_PRIOR_MTCO2E = 10_000


def detect_ghg_step(
    *,
    ghg_history: dict[int, float] | None,
    geography_label: str,
    recent_year: int,
) -> Flag | None:
    """Detect a year-over-year step change in county GHG emissions."""
    if not ghg_history:
        return None
    recent = ghg_history.get(recent_year, 0.0)
    prior = ghg_history.get(recent_year - 1, 0.0)
    if recent < MIN_RECENT_MTCO2E or prior < MIN_PRIOR_MTCO2E:
        return None
    if prior <= 0:
        return None
    delta = recent - prior
    pct = delta / prior
    if abs(pct) < MIN_PCT_CHANGE:
        return None
    severity = "surge" if delta > 0 else "drop"
    years = sorted(ghg_history.keys())
    history_pts = [{"year": y, "value": round(ghg_history[y])} for y in years]
    return Flag(
        type="ghg_step",
        severity=severity,
        label="Greenhouse gas emissions",
        summary=render_ghg_step(geography_label, prior, recent, pct * 100),
        magnitude_pct=round(pct * 100, 1),
        magnitude_abs=round(delta, 1),
        baseline_year=recent_year - 1,
        recent_year=recent_year,
        units="mtCO2e",
        history=history_pts,
    )
