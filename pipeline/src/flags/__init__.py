"""Anomaly engine — emits Flag objects for facility/county/state/utility geographies.

Per ``anomaly_engine_design.md``, v1 ships four flag types tied to data
already in the pipeline. AQS-dependent flags (smoke days, NAAQS exceedance)
defer until air-monitor ingest lands.
"""

from .calibration import calibrate, summarize
from .ghg_step import detect_ghg_step
from .long_arc import detect_long_arc_facility, detect_long_arc_geo
from .naaqs_exceedance import detect_naaqs_exceedance
from .prose import render
from .release_shift import detect_release_shifts
from .types import Flag, FlagSeverity, FlagType
from .violation_event import detect_violation_events

__all__ = [
    "Flag",
    "FlagSeverity",
    "FlagType",
    "calibrate",
    "detect_ghg_step",
    "detect_long_arc_facility",
    "detect_long_arc_geo",
    "detect_naaqs_exceedance",
    "detect_release_shifts",
    "detect_violation_events",
    "render",
    "summarize",
]
