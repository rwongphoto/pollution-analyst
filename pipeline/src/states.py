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
    "ma": State(
        slug="ma",
        abbr="MA",
        name="Massachusetts",
        fips="25",
        population=7029917,
        counties_total=14,
    ),
    "md": State(
        slug="md",
        abbr="MD",
        name="Maryland",
        fips="24",
        population=6177224,
        counties_total=24,
    ),
    "ar": State(
        slug="ar",
        abbr="AR",
        name="Arkansas",
        fips="05",
        population=3011524,
        counties_total=75,
    ),
    "nm": State(
        slug="nm",
        abbr="NM",
        name="New Mexico",
        fips="35",
        population=2117522,
        counties_total=33,
    ),
    "az": State(
        slug="az",
        abbr="AZ",
        name="Arizona",
        fips="04",
        population=7151502,
        counties_total=15,
    ),
    "wy": State(
        slug="wy",
        abbr="WY",
        name="Wyoming",
        fips="56",
        population=576851,
        counties_total=23,
    ),
    "mt": State(
        slug="mt",
        abbr="MT",
        name="Montana",
        fips="30",
        population=1084225,
        counties_total=56,
    ),
    "nd": State(
        slug="nd",
        abbr="ND",
        name="North Dakota",
        fips="38",
        population=779094,
        counties_total=53,
    ),
    "sd": State(
        slug="sd",
        abbr="SD",
        name="South Dakota",
        fips="46",
        population=886667,
        counties_total=66,
    ),
    "ut": State(
        slug="ut",
        abbr="UT",
        name="Utah",
        fips="49",
        population=3271616,
        counties_total=29,
    ),
    "la": State(
        slug="la",
        abbr="LA",
        name="Louisiana",
        fips="22",
        population=4657757,
        counties_total=64,
    ),
    "ak": State(
        slug="ak",
        abbr="AK",
        name="Alaska",
        fips="02",
        population=733391,
        counties_total=30,
    ),
    "id": State(
        slug="id",
        abbr="ID",
        name="Idaho",
        fips="16",
        population=1839106,
        counties_total=44,
    ),
    "or": State(
        slug="or",
        abbr="OR",
        name="Oregon",
        fips="41",
        population=4237256,
        counties_total=36,
    ),
    "wa": State(
        slug="wa",
        abbr="WA",
        name="Washington",
        fips="53",
        population=7705281,
        counties_total=39,
    ),
    "pa": State(
        slug="pa",
        abbr="PA",
        name="Pennsylvania",
        fips="42",
        population=13002700,
        counties_total=67,
    ),
    "va": State(
        slug="va",
        abbr="VA",
        name="Virginia",
        fips="51",
        population=8631393,
        counties_total=133,
    ),
    "co": State(
        slug="co",
        abbr="CO",
        name="Colorado",
        fips="08",
        population=5773714,
        counties_total=64,
    ),
    "nj": State(
        slug="nj",
        abbr="NJ",
        name="New Jersey",
        fips="34",
        population=9288994,
        counties_total=21,
    ),
    "ny": State(
        slug="ny",
        abbr="NY",
        name="New York",
        fips="36",
        population=20201249,
        counties_total=62,
    ),
    "al": State(
        slug="al",
        abbr="AL",
        name="Alabama",
        fips="01",
        population=5024279,
        counties_total=67,
    ),
    "ky": State(
        slug="ky",
        abbr="KY",
        name="Kentucky",
        fips="21",
        population=4505836,
        counties_total=120,
    ),
    "ga": State(
        slug="ga",
        abbr="GA",
        name="Georgia",
        fips="13",
        population=10711908,
        counties_total=159,
    ),
    "fl": State(
        slug="fl",
        abbr="FL",
        name="Florida",
        fips="12",
        population=21538187,
        counties_total=67,
    ),
    "ms": State(
        slug="ms",
        abbr="MS",
        name="Mississippi",
        fips="28",
        population=2961279,
        counties_total=82,
    ),
    "sc": State(
        slug="sc",
        abbr="SC",
        name="South Carolina",
        fips="45",
        population=5118425,
        counties_total=46,
    ),
    "nc": State(
        slug="nc",
        abbr="NC",
        name="North Carolina",
        fips="37",
        population=10439388,
        counties_total=100,
    ),
    "tn": State(
        slug="tn",
        abbr="TN",
        name="Tennessee",
        fips="47",
        population=6910840,
        counties_total=95,
    ),
    "il": State(
        slug="il",
        abbr="IL",
        name="Illinois",
        fips="17",
        population=12812508,
        counties_total=102,
    ),
    "in": State(
        slug="in",
        abbr="IN",
        name="Indiana",
        fips="18",
        population=6785528,
        counties_total=92,
    ),
}


def get(slug: str) -> State:
    if slug not in STATES:
        raise KeyError(f"unknown state slug: {slug}")
    return STATES[slug]


def all_slugs() -> list[str]:
    return sorted(STATES.keys())
