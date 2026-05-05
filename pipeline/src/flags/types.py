"""Flag dataclass + literal types. Mirrors ``frontend/src/lib/types.ts`` Flag."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

FlagType = Literal[
    "long_arc_shift",
    "release_shift",
    "violation_event",
    "ghg_step",
]

FlagSeverity = Literal[
    "improvement",        # long-arc decline
    "regression",         # long-arc rise
    "surge",              # YoY rise (release_shift, ghg_step)
    "drop",               # YoY decline (release_shift, ghg_step)
    "unresolved",         # SDWIS unresolved violation
    "health_based_recent",   # SDWIS health-based within 1 year
    "health_based_recent5y", # SDWIS health-based within 5 years
]


@dataclass
class Flag:
    type: FlagType
    severity: FlagSeverity
    label: str
    summary: str
    magnitude_pct: float | None = None
    magnitude_abs: float | None = None
    baseline_year: int | None = None
    recent_year: int = 0
    units: str | None = None
    history: list[dict] = field(default_factory=list)  # [{year, value}]
    link_label: str | None = None
    link_href: str | None = None

    def to_payload(self) -> dict:
        out: dict = {
            "type": self.type,
            "severity": self.severity,
            "label": self.label,
            "summary": self.summary,
            "magnitude_pct": self.magnitude_pct,
            "magnitude_abs": self.magnitude_abs,
            "baseline_year": self.baseline_year,
            "recent_year": self.recent_year,
            "units": self.units,
            "history": self.history,
        }
        if self.link_href:
            out["link"] = {"label": self.link_label or "Source", "href": self.link_href}
        return out


# Severity weights for sorting flags within a section. Higher = more
# editorial weight = sorted first.
_SEVERITY_WEIGHT: dict[str, int] = {
    "unresolved": 100,
    "regression": 80,
    "surge": 70,
    "health_based_recent": 60,
    "health_based_recent5y": 50,
    "drop": 30,
    "improvement": 20,
}


def severity_weight(s: str) -> int:
    return _SEVERITY_WEIGHT.get(s, 0)
