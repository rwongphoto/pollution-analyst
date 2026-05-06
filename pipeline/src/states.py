"""State registry. Source of truth for which states the pipeline covers.

Mirrors crime-trend-data/pipeline/src/cities.py — the registry is the only
place that knows about a state, and other modules look up by slug.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class State:
    slug: str          # 'ca'
    abbr: str          # 'CA' (used by EPA APIs)
    name: str          # 'California'
    fips: str          # '06'
    population: int    # ACS 5-year, recent
    counties_total: int


STATES: dict[str, State] = {
    "ca": State(
        slug="ca",
        abbr="CA",
        name="California",
        fips="06",
        population=39538223,
        counties_total=58,
    ),
    "tx": State(
        slug="tx",
        abbr="TX",
        name="Texas",
        fips="48",
        population=29145505,
        counties_total=254,
    ),
}


def get(slug: str) -> State:
    if slug not in STATES:
        raise KeyError(f"unknown state slug: {slug}")
    return STATES[slug]


def all_slugs() -> list[str]:
    return sorted(STATES.keys())
