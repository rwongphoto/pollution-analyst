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
    "vt": State(
        slug="vt",
        abbr="VT",
        name="Vermont",
        fips="50",
        population=643077,
        counties_total=14,
    ),
    "nh": State(
        slug="nh",
        abbr="NH",
        name="New Hampshire",
        fips="33",
        population=1377529,
        counties_total=10,
    ),
    "me": State(
        slug="me",
        abbr="ME",
        name="Maine",
        fips="23",
        population=1362359,
        counties_total=16,
    ),
    "ri": State(
        slug="ri",
        abbr="RI",
        name="Rhode Island",
        fips="44",
        population=1097379,
        counties_total=5,
    ),
    "de": State(
        slug="de",
        abbr="DE",
        name="Delaware",
        fips="10",
        population=989948,
        counties_total=3,
    ),
    "ct": State(
        slug="ct",
        abbr="CT",
        name="Connecticut",
        fips="09",
        population=3605944,
        counties_total=8,
    ),
    "hi": State(
        slug="hi",
        abbr="HI",
        name="Hawaii",
        fips="15",
        population=1455271,
        counties_total=5,
    ),
    "nv": State(
        slug="nv",
        abbr="NV",
        name="Nevada",
        fips="32",
        population=3104614,
        counties_total=17,
    ),
    "wv": State(
        slug="wv",
        abbr="WV",
        name="West Virginia",
        fips="54",
        population=1793716,
        counties_total=55,
    ),
    "ok": State(
        slug="ok",
        abbr="OK",
        name="Oklahoma",
        fips="40",
        population=3959353,
        counties_total=77,
    ),
}


def get(slug: str) -> State:
    if slug not in STATES:
        raise KeyError(f"unknown state slug: {slug}")
    return STATES[slug]


def all_slugs() -> list[str]:
    return sorted(STATES.keys())
