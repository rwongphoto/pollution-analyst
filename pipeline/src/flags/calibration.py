"""Sanity counts for the first-pass anomaly engine run.

Caps from anomaly_engine_design.md:
- facility: ≤ 3 flags
- county:   ≤ 5 flags
- state:    ≤ 8 flags
- utility:  no statistical cap (events, not anomalies)

Logged at INFO during publish so a first calibration run can be eyeballed
without an extra script. If real-world counts overshoot 2× the cap on
average, tighten the per-detector thresholds in ``long_arc.py`` /
``release_shift.py`` / ``ghg_step.py`` before shipping.
"""

from __future__ import annotations

import logging
from collections import Counter

log = logging.getLogger(__name__)

CAPS = {
    "facility": 3,
    "county": 5,
    "state": 8,
    "utility": None,  # event-driven, no statistical cap
}


def summarize(geography: str, identifier: str, flags: list) -> None:
    """Log per-geography counts and severity breakdown for one entity."""
    if not flags:
        return
    by_severity = Counter(f.severity for f in flags)
    cap = CAPS.get(geography)
    over = (cap is not None) and (len(flags) > cap)
    over_marker = "  OVER CAP" if over else ""
    log.info(
        "flags %s/%s: %d total · %s%s",
        geography, identifier, len(flags),
        ", ".join(f"{k}={v}" for k, v in by_severity.most_common()),
        over_marker,
    )


def calibrate(all_counts: dict[str, list[int]]) -> None:
    """Print summary stats across every entity in a publish run.

    all_counts: {geography: [flag_count_per_entity, ...]}
    """
    log.info("=" * 60)
    log.info("Anomaly engine calibration summary")
    log.info("=" * 60)
    for geo, counts in all_counts.items():
        if not counts:
            log.info("%s: no entities", geo)
            continue
        n = len(counts)
        total = sum(counts)
        avg = total / n
        mx = max(counts)
        cap = CAPS.get(geo)
        over = sum(1 for c in counts if cap is not None and c > cap)
        over_pct = (over / n * 100) if n else 0
        log.info(
            "%s: %d entities · %d flags total · avg %.1f · max %d · cap %s · over-cap %d (%.0f%%)",
            geo, n, total, avg, mx, cap if cap is not None else "—", over, over_pct,
        )
