"""naaqs_exceedance detector — AQS criteria-air readings vs NAAQS thresholds.

Per ``anomaly_engine_design.md`` v2 (the AQS-dependent flag set). Triggers
when a county's population-of-monitors mean for a NAAQS-relevant metric
exceeds the standard in the most recent reporting year. Geography is
county-level — the city-hub uses the containing-county's air history, so
the same flag surfaces on both pages.

Why current-year-only and not multi-year: NAAQS exceedance is itself an
event, not an anomaly. The fact of the reading exceeding the standard *this
year* is the editorial signal — readers want "did Kern blow through PM2.5
this year?", not "is the trend bad?". Long-arc decline of an exceedance
metric still gets covered by the existing long_arc_shift flag if the
underlying history is multi-year.
"""

from __future__ import annotations

from ..ingest.aqs import METRICS, MetricSpec
from .prose import render_naaqs_exceedance
from .types import Flag

# Editorial descriptor per metric — used in the rendered summary line.
_DESCRIPTOR: dict[str, str] = {
    "pm25_annual": "annual mean",
    "pm25_24hr":   "24-hour 98th percentile",
    "ozone_8hr":   "8-hour 4th-highest daily max",
    "no2_annual":  "annual mean",
}


def detect_naaqs_exceedance(
    *,
    air_history: dict[str, dict[int, float]] | None,
    geography_label: str,
    recent_year: int,
) -> list[Flag]:
    """Emit one Flag per (metric × exceedance) for ``recent_year``.

    ``air_history`` is the same shape ``publish_site._criteria_air_pathways``
    consumes: ``{metric_key: {year: monitor-mean}}``.
    """
    if not air_history:
        return []
    out: list[Flag] = []
    metrics_by_key: dict[str, MetricSpec] = {m.key: m for m in METRICS}
    for metric_key, hist_map in air_history.items():
        m = metrics_by_key.get(metric_key)
        if m is None or not hist_map:
            continue
        # Use the most recent year that actually has data, falling back from
        # ``recent_year`` if AQS hasn't published yet for the requested year.
        if recent_year in hist_map:
            year_used = recent_year
        else:
            year_used = max(hist_map.keys())
        value = hist_map[year_used]
        if value <= m.naaqs:
            continue
        descriptor = _DESCRIPTOR.get(metric_key, metric_key)
        history_pts = [{"year": y, "value": round(v, 3)} for y, v in sorted(hist_map.items())]
        out.append(Flag(
            type="naaqs_exceedance",
            severity="exceedance",
            label=f"{m.pollutant} {descriptor}",
            summary=render_naaqs_exceedance(
                pollutant=m.pollutant,
                geography_label=geography_label,
                metric_descriptor=descriptor,
                value=value,
                naaqs=m.naaqs,
                units=m.units,
                year=year_used,
            ),
            magnitude_pct=round(((value - m.naaqs) / m.naaqs) * 100, 1) if m.naaqs > 0 else None,
            magnitude_abs=round(value - m.naaqs, 3),
            baseline_year=None,
            recent_year=year_used,
            units=m.units,
            history=history_pts,
        ))
    return out
