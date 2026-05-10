"""ghg_step detector — GHGRP YoY shifts at county and facility level.

Facility-level fires when a TRI facility's FRS ID matches a GHGRP facility's
FRS ID (the ~14% of GHGRP facilities that are also in TRI — refineries,
large chemical plants, steel mills, cement, paper). Same threshold as
county-level: 30% YoY on a base of ≥10K mtCO2e in both years.
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
    at_facility: bool = False,
) -> Flag | None:
    """Detect a year-over-year step change in GHG emissions. ``at_facility``
    only swaps the prose preposition ("at" vs "in") so the same detector
    can flag both county-level and facility-level shifts."""
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
        summary=render_ghg_step(geography_label, prior, recent, pct * 100, at_facility=at_facility),
        magnitude_pct=round(pct * 100, 1),
        magnitude_abs=round(delta, 1),
        baseline_year=recent_year - 1,
        recent_year=recent_year,
        units="mtCO2e",
        history=history_pts,
    )
