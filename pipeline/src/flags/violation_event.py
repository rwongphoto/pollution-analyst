"""violation_event detector — promote SDWIS violations to flags.

Event-driven, not statistical. Two triggers:
1. Any unresolved violation, regardless of date.
2. Any health-based violation in the trailing 5 years.

Severity ordering: unresolved > health_based_recent > health_based_recent5y.
A violation that is both unresolved and health-based is emitted once with
the highest severity that applies.
"""

from __future__ import annotations

from datetime import datetime, timezone

from ..aggregate.build import UtilityViolation
from .prose import render_violation_event
from .types import Flag


def detect_violation_events(
    *,
    pwsid: str,
    utility_label: str,
    violations: list[UtilityViolation],
    cap: int = 4,
) -> list[Flag]:
    """One Flag per violation that meets a trigger. Most-recent and
    most-severe first. EPA SDWIS record link attached for verification.
    """
    if not violations:
        return []
    current_year = datetime.now(timezone.utc).year
    out: list[Flag] = []
    for v in violations:
        is_health_based = v.severity == "health_based"
        is_recent_1yr = (current_year - v.year) <= 1
        is_recent_5yr = (current_year - v.year) <= 5
        if v.is_unresolved:
            severity = "unresolved"
        elif is_health_based and is_recent_1yr:
            severity = "health_based_recent"
        elif is_health_based and is_recent_5yr:
            severity = "health_based_recent5y"
        else:
            continue  # not flag-worthy: monitoring failure, returned to compliance, > 5yr old
        out.append(Flag(
            type="violation_event",
            severity=severity,
            label=v.contaminant,
            summary=render_violation_event(v.contaminant, v.rule, v.year, v.is_unresolved, is_health_based),
            magnitude_pct=None,
            magnitude_abs=None,
            baseline_year=None,
            recent_year=v.year,
            units=None,
            history=[],
            link_label="EPA SDWIS record",
            link_href=f"https://ofmpub.epa.gov/apex/sfdw/f?p=108:200:::NO::P200_PWSID:{pwsid}",
        ))
    # Sort: unresolved first, then by recency.
    rank = {"unresolved": 3, "health_based_recent": 2, "health_based_recent5y": 1}
    out.sort(key=lambda f: (rank.get(f.severity, 0), f.recent_year), reverse=True)
    return out[:cap]
