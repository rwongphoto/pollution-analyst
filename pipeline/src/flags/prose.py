"""Template-rendered summary lines for each flag type.

Mirrors the deterministic-template stance from ``prose_strategy.md``.
Inputs are structured (numbers, names, years); outputs are short editorial
sentences. No LLM in the loop.
"""

from __future__ import annotations


def _pounds(p: float) -> str:
    if p >= 1_000_000:
        return f"{p/1_000_000:.1f}M lb"
    if p >= 1_000:
        return f"{p/1_000:.0f}k lb"
    return f"{p:.0f} lb"


def _mtco2e(v: float) -> str:
    if v >= 1_000_000:
        return f"{v/1_000_000:.1f}M mtCO₂e"
    if v >= 1_000:
        return f"{v/1_000:.0f}k mtCO₂e"
    return f"{v:.0f} mtCO₂e"


def render_long_arc(label: str, geography: str, pct: float, baseline_year: int, recent_year: int) -> str:
    """e.g. 'TRI air releases at this facility have fallen 78% since 2005.'"""
    abs_pct = abs(pct)
    direction = "fallen" if pct < 0 else "risen"
    if abs_pct >= 75 and pct < 0:
        movement = f"more than three-quarters since {baseline_year}"
    elif abs_pct >= 50 and pct < 0:
        movement = f"more than halved since {baseline_year}"
    elif abs_pct >= 100 and pct > 0:
        movement = f"more than doubled since {baseline_year}"
    else:
        movement = f"{direction} {abs_pct:.0f}% since {baseline_year}"
    return f"{label} at {geography} have {movement} (through {recent_year})."


def render_release_shift(
    chemical: str,
    facility_label: str,
    prior_lb: float,
    recent_lb: float,
    prior_year: int,
    recent_year: int,
) -> str:
    """e.g. 'Benzene releases at Refinery X rose from 12k lb to 51k lb (4.2×) year over year.'"""
    if prior_lb <= 0:
        ratio = ""
    else:
        ratio_v = recent_lb / prior_lb
        if ratio_v >= 2:
            ratio = f" ({ratio_v:.1f}×)"
        elif ratio_v <= 0.5:
            ratio = f" ({(1 - ratio_v) * 100:.0f}% lower)"
        else:
            ratio = ""
    direction = "rose" if recent_lb > prior_lb else "fell"
    return (
        f"{chemical} releases at {facility_label} {direction} from "
        f"{_pounds(prior_lb)} to {_pounds(recent_lb)}{ratio} between {prior_year} and {recent_year}."
    )


def render_violation_event(contaminant: str, rule: str, year: int, is_unresolved: bool, is_health_based: bool) -> str:
    """e.g. 'Unresolved Lead and Copper Rule violation cited in 2024 (lead).'"""
    qualifier = "Unresolved " if is_unresolved else ""
    severity = "health-based" if is_health_based else "monitoring"
    if is_unresolved:
        return f"Unresolved {rule} violation cited in {year} ({contaminant.lower()})."
    return f"{rule} {severity} violation cited in {year} ({contaminant.lower()})."


def render_ghg_step(geography_label: str, prior: float, recent: float, pct: float) -> str:
    """e.g. 'GHG emissions in Kern County fell 41% year over year — typical of a fuel switch or unit shutdown.'"""
    direction = "rose" if pct > 0 else "fell"
    abs_pct = abs(pct)
    nudge = (
        " — typical of a fuel switch or unit shutdown."
        if pct < 0 else
        " — typical of new commissioning or expanded operations."
    )
    return (
        f"GHG emissions in {geography_label} {direction} {abs_pct:.0f}% year over year "
        f"({_mtco2e(prior)} → {_mtco2e(recent)}){nudge}"
    )


def render(flag) -> str:
    """Polymorphic render helper — used when we have a Flag and want a fresh
    summary. Currently the summary is computed at detect-time and stored on
    the flag, so this just returns it. Kept here so callers can stay
    consistent if/when re-rendering becomes useful.
    """
    return flag.summary
