"""AirToxScreen (NATA successor) ingest from EPA's gaftp public archive.

Source: ``gaftp.epa.gov/rtrmodeling_public/AirToxScreen/2020/``. EPA's
modeled exposure to ~150 hazardous air pollutants (HAPs) at census-block
grain. Multi-year publication lag (2020 vintage was released 2024–2025);
treat this as a single-snapshot ingest, not the per-year time series the
AQS module produces.

v1 surfaces three metrics that drive the ``hazardous_air`` pathway tile:

- ``cancer_risk_total`` — total lifetime cancer risk (per million), summed
  across all pollutants per block, then population-weighted to the geography.
  Editorial threshold: 100 in a million (EPA's "presumptive level of
  unacceptable risk").
- ``formaldehyde_ambconc`` — ambient concentration in µg/m³. Threshold
  0.077 µg/m³ ≈ 1-in-a-million URE. The dominant cancer driver nationally.
- ``benzene_ambconc`` — ambient concentration in µg/m³. Threshold
  0.13 µg/m³ ≈ 1-in-a-million URE. Industrial / gasoline indicator.

Source files used (per EPA Region):
  - ``Cancer/ByPollutant/Region{R}_CancerRisk_by_block_poll.xlsx``
    Long format: one row per (block, pollutant). ~346 MB (R9). Single
    "Total Cancer Risk" column = pollutant-level total across source groups.
    We sum across pollutants per block to get the geography total.
  - ``Pollutant Summaries/Region{R}/{POLLUTANT}_AMBCONC_R{R}.zip``
    ~20 MB CSV per pollutant. "Total Conc" column = pollutant-level total.

Respiratory hazard index is *not* in the 2020 ATS public release and is
intentionally omitted from v1. Tier-3 block-level surface (the source grain)
is also deferred — county+state pop-weighted means are sufficient for the
pathway tile.
"""

from __future__ import annotations

import csv
import io
import logging
import zipfile
from dataclasses import dataclass
from pathlib import Path

import httpx
from openpyxl import load_workbook

from ..config import RAW_ROOT
from ..states import State

log = logging.getLogger(__name__)

USER_AGENT = "PollutionAnalystAi/0.1 (+contact: ops@pollutionanalyst.ai)"
GAFTP_BASE = "https://gaftp.epa.gov/rtrmodeling_public/AirToxScreen"

# Only vintage published as of 2026; bump VINTAGE when EPA releases the next.
VINTAGE = 2020

# Map state postal abbreviation to EPA region directory tag. Some regions
# split into "a"/"b" halves on the file system (e.g. R5a/R5b for Midwest);
# CA sits cleanly in R9.
STATE_TO_REGION: dict[str, str] = {
    "CA": "9",
    "TX": "6b",
    "VT": "1",
    "NH": "1",
    "ME": "1",
    "RI": "1",
    "CT": "1",
    "DE": "3",
    "WV": "3",
    "HI": "9",
    "NV": "9",
    "OK": "6a",
    "MA": "1",
    "MD": "3",
    "AR": "6a",
    "NM": "6a",
    "AZ": "9",
    # Add more as states register: Region 1 = CT/ME/MA/NH/RI/VT,
    # 2 = NJ/NY, 3 = DE/DC/MD/PA/VA/WV, 4a = AL/FL/GA/KY, 4b = MS/NC/SC/TN,
    # 5a = IL/IN/MI, 5b = MN/OH/WI, 6a = AR/LA/NM/OK, 6b = TX (verified
    # 2026-05-06: Region6b XLSX is Texas-only; OK is in R6a contrary to the
    # earlier comment), 7 = IA/KS/MO/NE, 8 = CO/MT/ND/SD/UT/WY,
    # 9 = AZ/CA/HI/NV, 10 = AK/ID/OR/WA.
}


# ---- Metric catalog ------------------------------------------------------

@dataclass(frozen=True)
class MetricSpec:
    key: str                # "cancer_risk_total" / "formaldehyde_ambconc" / ...
    pollutant: str          # editorial label, e.g. "Total cancer risk"
    units: str              # rendered units
    threshold: float        # editorial benchmark for prose framing
    threshold_label: str    # human-readable threshold


METRICS: tuple[MetricSpec, ...] = (
    MetricSpec(
        key="cancer_risk_total",
        pollutant="Lifetime cancer risk",
        units="per million",
        threshold=100.0,
        threshold_label="100 in a million (EPA elevated threshold)",
    ),
    MetricSpec(
        key="formaldehyde_ambconc",
        pollutant="Formaldehyde",
        units="µg/m³",
        threshold=0.077,
        threshold_label="0.077 µg/m³ (1-in-a-million URE)",
    ),
    MetricSpec(
        key="benzene_ambconc",
        pollutant="Benzene",
        units="µg/m³",
        threshold=0.13,
        threshold_label="0.13 µg/m³ (1-in-a-million URE)",
    ),
)


# Pollutant Name string in the source CSVs / XLSX for the ambient-concentration
# metrics. The cancer XLSX iterates all pollutants so doesn't need this.
_AMBCONC_POLLUTANT_LABEL: dict[str, str] = {
    "formaldehyde_ambconc": "FORMALDEHYDE",
    "benzene_ambconc": "BENZENE",
}


@dataclass
class AirToxBlockReading:
    """One (block, metric) reading from AirToxScreen 2020.

    For ``cancer_risk_total`` the value is the per-block sum across all
    pollutants; for ambient-concentration metrics it's the pollutant's
    "Total Conc" (sum across source groups for that pollutant).
    """
    state_abbr: str         # 2-letter postal code
    county_fips: str        # 5-digit (state + county)
    block_id: str           # 15-digit Census block
    population: int         # block population
    metric_key: str
    value: float


# ---- Download / cache ----------------------------------------------------

def _cache_dir() -> Path:
    return RAW_ROOT / "airtoxscreen" / str(VINTAGE)


def _summaries_region(region: str) -> str:
    """Pollutant-Summaries directory tag — unsplit even when Cancer is split.

    EPA splits Region 5 + 6 into a/b halves for the per-pollutant Cancer XLSX
    only; the Pollutant-Summaries hierarchy is unsplit (Region5/, Region6/),
    so a state mapped to "5a" / "5b" / "6a" / "6b" must drop the suffix here.
    """
    return region.rstrip("ab")


def _cancer_xlsx_path(region: str) -> Path:
    return _cache_dir() / f"Region{region}_CancerRisk_by_block_poll.xlsx"


def _ambconc_zip_path(region: str, pollutant_token: str) -> Path:
    return _cache_dir() / f"{pollutant_token}_AMBCONC_R{_summaries_region(region)}.zip"


def _download(url: str, dest: Path, min_bytes: int) -> Path:
    if dest.exists() and dest.stat().st_size > min_bytes:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    log.info("AirToxScreen: downloading %s", url)
    with httpx.Client(timeout=1800.0, headers={"User-Agent": USER_AGENT}) as client:
        with client.stream("GET", url) as r:
            r.raise_for_status()
            with dest.open("wb") as fh:
                for chunk in r.iter_bytes(chunk_size=1024 * 1024):
                    fh.write(chunk)
    return dest


def _is_cached(path: Path, min_bytes: int) -> bool:
    return path.exists() and path.stat().st_size > min_bytes


# ---- Public API ----------------------------------------------------------

def fetch_state_year(
    state: State, year: int = VINTAGE, cache_only: bool = False,
) -> list[AirToxBlockReading]:
    """Return per-block readings for ``state`` × the v1 metric set.

    ``year`` is accepted for symmetry with the AQS ingest signature but
    only ``VINTAGE`` (2020) is supported today. Other years return [].

    Skips silently when the state isn't mapped to an EPA region (i.e. not
    yet registered for AirToxScreen ingest) — matches the AQS pattern of
    "no source = no rows" rather than raising.
    """
    if year != VINTAGE:
        log.info(
            "AirToxScreen: only vintage %d available, skipping %d for %s",
            VINTAGE, year, state.abbr,
        )
        return []
    region = STATE_TO_REGION.get(state.abbr.upper())
    if not region:
        log.info(
            "AirToxScreen: no region mapping for %s — skip",
            state.abbr,
        )
        return []

    out: list[AirToxBlockReading] = []
    out.extend(_load_cancer_totals(state, region, cache_only))
    for metric_key, pollutant_token in _AMBCONC_POLLUTANT_LABEL.items():
        out.extend(_load_ambconc(state, region, metric_key, pollutant_token, cache_only))
    log.info(
        "AirToxScreen %s: %d block-level readings across %d metrics",
        state.abbr, len(out), len({r.metric_key for r in out}),
    )
    return out


# ---- Cancer XLSX parse ---------------------------------------------------

# Conservative size floor for the cancer XLSX cache check. R9 file is ~346 MB;
# we use 50 MB as a "is this a real file vs a partial download" sanity floor.
_CANCER_MIN_BYTES = 50 * 1024 * 1024


def _load_cancer_totals(
    state: State, region: str, cache_only: bool,
) -> list[AirToxBlockReading]:
    """Stream the regional cancer XLSX, summing risk-per-pollutant by block.

    The file is long format: one row per (block, pollutant). We:
      1. filter rows to the requested state by the "State" column
      2. sum the "Total Cancer Risk (per million)" column across pollutants
         per block (and capture the per-block population once)
      3. emit one AirToxBlockReading(metric_key="cancer_risk_total") per block.

    openpyxl read_only mode is required — full load would exceed available RAM
    for the 346 MB R9 file. Slow but only runs once per cache (annual cadence,
    multi-year publication lag).
    """
    path = _cancer_xlsx_path(region)
    if cache_only and not _is_cached(path, _CANCER_MIN_BYTES):
        return []
    if not _is_cached(path, _CANCER_MIN_BYTES):
        url = f"{GAFTP_BASE}/{VINTAGE}/Cancer/ByPollutant/Region{region}_CancerRisk_by_block_poll.xlsx"
        try:
            _download(url, path, _CANCER_MIN_BYTES)
        except httpx.HTTPError as exc:
            log.warning("AirToxScreen cancer XLSX download failed for R%s: %s", region, exc)
            return []

    state_abbr = state.abbr.upper()
    # block_id -> [running_total_risk, population, county_fips]
    per_block: dict[str, list] = {}

    log.info(
        "AirToxScreen R%s: streaming cancer XLSX (%.0f MB) — this takes several minutes",
        region, path.stat().st_size / (1024 * 1024),
    )
    wb = load_workbook(filename=str(path), read_only=True, data_only=True)
    try:
        ws = wb.active
        rows = ws.iter_rows(values_only=True)
        header = next(rows)
        col_idx = _resolve_columns(header, {
            "state": "State",
            "fips": "FIPS",
            "block": "Block",
            "population": "Population",
            "risk": "Total Cancer Risk (per million)",
        })
    except StopIteration:
        wb.close()
        return []

    rows_seen = 0
    for row in rows:
        rows_seen += 1
        if (row[col_idx["state"]] or "") != state_abbr:
            continue
        block_id = _str(row[col_idx["block"]])
        if not block_id:
            continue
        risk = _coerce_float(row[col_idx["risk"]])
        if risk is None:
            continue
        bucket = per_block.get(block_id)
        if bucket is None:
            county_fips = _coerce_county_fips(row[col_idx["fips"]])
            if not county_fips:
                continue
            pop = _coerce_int(row[col_idx["population"]]) or 0
            per_block[block_id] = [risk, pop, county_fips]
        else:
            bucket[0] += risk
        if rows_seen % 1_000_000 == 0:
            log.info(
                "AirToxScreen R%s: %s rows processed, %d %s blocks accumulated",
                region, f"{rows_seen:,}", len(per_block), state_abbr,
            )
    wb.close()

    out: list[AirToxBlockReading] = []
    for block_id, (total_risk, pop, county_fips) in per_block.items():
        out.append(AirToxBlockReading(
            state_abbr=state_abbr,
            county_fips=county_fips,
            block_id=block_id,
            population=pop,
            metric_key="cancer_risk_total",
            value=total_risk,
        ))
    log.info(
        "AirToxScreen %s cancer_risk_total: %d blocks (from %s rows in R%s XLSX)",
        state_abbr, len(out), f"{rows_seen:,}", region,
    )
    return out


# ---- Ambient concentration CSV parse -------------------------------------

# Per-pollutant zips are ~20 MB; size floor 1 MB is just a "did anything
# download" sanity check.
_AMBCONC_MIN_BYTES = 1 * 1024 * 1024


def _load_ambconc(
    state: State, region: str, metric_key: str, pollutant_token: str,
    cache_only: bool,
) -> list[AirToxBlockReading]:
    """Parse a per-pollutant ambient-concentration zip (one row per block).

    Returns one AirToxBlockReading per in-state block, value = "Total Conc"
    column (µg/m³, sum across source groups).
    """
    path = _ambconc_zip_path(region, pollutant_token)
    if cache_only and not _is_cached(path, _AMBCONC_MIN_BYTES):
        return []
    if not _is_cached(path, _AMBCONC_MIN_BYTES):
        sreg = _summaries_region(region)
        url = (
            f"{GAFTP_BASE}/{VINTAGE}/Pollutant%20Summaries/Region{sreg}/"
            f"{pollutant_token}_AMBCONC_R{sreg}.zip"
        )
        try:
            _download(url, path, _AMBCONC_MIN_BYTES)
        except httpx.HTTPError as exc:
            log.warning(
                "AirToxScreen ambconc download failed for %s R%s: %s",
                pollutant_token, region, exc,
            )
            return []

    state_abbr = state.abbr.upper()
    out: list[AirToxBlockReading] = []
    with zipfile.ZipFile(path) as zf:
        name = next(n for n in zf.namelist() if n.endswith(".csv"))
        with zf.open(name) as fh:
            text = io.TextIOWrapper(fh, encoding="utf-8", errors="replace")
            reader = csv.DictReader(text)
            for raw in reader:
                if (raw.get("State") or "") != state_abbr:
                    continue
                block_id = _str(raw.get("Block"))
                if not block_id:
                    continue
                value = _coerce_float(raw.get("Total Conc"))
                if value is None:
                    continue
                county_fips = _coerce_county_fips(raw.get("FIPS"))
                if not county_fips:
                    continue
                pop = _coerce_int(raw.get("Population")) or 0
                out.append(AirToxBlockReading(
                    state_abbr=state_abbr,
                    county_fips=county_fips,
                    block_id=block_id,
                    population=pop,
                    metric_key=metric_key,
                    value=value,
                ))
    log.info(
        "AirToxScreen %s %s: %d blocks from R%s ambconc zip",
        state_abbr, metric_key, len(out), region,
    )
    return out


# ---- Aggregation ---------------------------------------------------------

def aggregate_county_year(readings: list[AirToxBlockReading]) -> dict[str, dict[str, float]]:
    """{county_fips: {metric_key: population-weighted block mean}}.

    Pop-weighting matches how EPA presents AirToxScreen rollups in its
    own dashboards — a low-population block with extreme concentration
    shouldn't dominate the county figure.
    """
    # county_fips -> metric_key -> [weighted_sum, total_pop]
    accum: dict[str, dict[str, list]] = {}
    for r in readings:
        if r.population <= 0:
            continue
        bucket = accum.setdefault(r.county_fips, {}).setdefault(r.metric_key, [0.0, 0])
        bucket[0] += r.value * r.population
        bucket[1] += r.population
    out: dict[str, dict[str, float]] = {}
    for cf, metric_map in accum.items():
        for metric_key, (wsum, pop) in metric_map.items():
            if pop > 0:
                out.setdefault(cf, {})[metric_key] = wsum / pop
    return out


def aggregate_state_year(readings: list[AirToxBlockReading]) -> dict[str, float]:
    """{metric_key: population-weighted statewide block mean}."""
    accum: dict[str, list] = {}
    for r in readings:
        if r.population <= 0:
            continue
        bucket = accum.setdefault(r.metric_key, [0.0, 0])
        bucket[0] += r.value * r.population
        bucket[1] += r.population
    return {k: wsum / pop for k, (wsum, pop) in accum.items() if pop > 0}


def metric_for_key(key: str) -> MetricSpec:
    """Reverse-lookup. Raises KeyError on unknown key."""
    for m in METRICS:
        if m.key == key:
            return m
    raise KeyError(key)


# ---- Helpers -------------------------------------------------------------

def _resolve_columns(
    header: tuple, names: dict[str, str],
) -> dict[str, int]:
    """Map a friendly key to the column index in ``header`` for each requested
    column name. Raises KeyError if any required column is missing — that
    means EPA changed the schema and the parser needs an update."""
    header_strs = [(h or "").strip() for h in header]
    out: dict[str, int] = {}
    for friendly, col_name in names.items():
        try:
            out[friendly] = header_strs.index(col_name)
        except ValueError:
            raise KeyError(
                f"AirToxScreen: column {col_name!r} missing from XLSX header "
                f"(have: {header_strs[:10]}...)"
            ) from None
    return out


def _str(v) -> str:
    if v is None:
        return ""
    return str(v).strip()


def _coerce_float(v) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _coerce_int(v) -> int | None:
    if v is None or v == "":
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _coerce_county_fips(v) -> str | None:
    """Coerce the FIPS column (5-digit county FIPS) to a zero-padded string.

    Source files store this as a numeric in the XLSX (so ``6037`` instead of
    ``"06037"`` for LA County). Pad to 5 chars; reject anything that doesn't
    parse to a 4-or-5-digit county FIPS.
    """
    if v is None or v == "":
        return None
    s = str(v).strip()
    if "." in s:
        s = s.split(".", 1)[0]
    if not s.isdigit():
        return None
    if len(s) == 4:
        s = "0" + s
    if len(s) != 5:
        return None
    return s
