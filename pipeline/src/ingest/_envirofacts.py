"""EPA Envirofacts JSON client.

Envirofacts is the public REST gateway over EPA's data warehouse. URL pattern:
    https://data.epa.gov/efservice/{TABLE}/{COLUMN}/{OP}/{VALUE}/{...}/JSON

Multiple table segments JOIN. Pagination is via /rows/{from}:{to}/ — max page
size is 10,000.

We cache responses to data/raw/envirofacts/ keyed on a hash of the URL so
re-runs don't re-hit EPA. Per the plan's source-respect rules: identify the
UA and cache aggressively.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any, Iterable

import httpx

from ..config import ENVIROFACTS_BASE, RAW_ROOT

USER_AGENT = "PollutionAnalystAi/0.1 (+contact: ops@pollutionanalyst.ai)"
PAGE_SIZE = 10_000


def _cache_path(cache_key: str) -> Path:
    out = RAW_ROOT / "envirofacts" / f"{cache_key}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    return out


def _hash_url(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]


def fetch_json(path_segments: Iterable[str], cache_key: str | None = None) -> Any:
    """One-shot Envirofacts fetch. Suitable for COUNT calls and small results."""
    url = f"{ENVIROFACTS_BASE}/{'/'.join(path_segments)}/JSON"
    key = cache_key or _hash_url(url)
    cache = _cache_path(key)
    if cache.exists():
        return json.loads(cache.read_text())
    with httpx.Client(timeout=120.0, headers={"User-Agent": USER_AGENT}) as client:
        r = client.get(url)
        r.raise_for_status()
    data = r.json()
    cache.write_text(json.dumps(data))
    return data


def is_year_cached(cache_key: str) -> bool:
    """True if a paginated fetch for this cache_key has at least one page on
    disk. Used by callers that want to skip uncached years rather than hit
    EPA when the API is slow.
    """
    cache_dir = RAW_ROOT / "envirofacts" / cache_key
    if not cache_dir.exists():
        return False
    return any(f.name.startswith("page_") for f in cache_dir.iterdir())


def fetch_all_paginated(
    path_segments: Iterable[str],
    cache_key: str,
    expected_total: int | None = None,
    sleep_between: float = 0.5,
    cache_only: bool = False,
) -> list[dict[str, Any]]:
    """Page through an Envirofacts query and return concatenated rows.

    expected_total lets us stop early if EPA returns fewer than a full page.
    """
    segs = list(path_segments)
    cache_dir = RAW_ROOT / "envirofacts" / cache_key
    cache_dir.mkdir(parents=True, exist_ok=True)
    out: list[dict[str, Any]] = []
    start = 0
    page_idx = 0
    with httpx.Client(timeout=180.0, headers={"User-Agent": USER_AGENT}) as client:
        while True:
            page_cache = cache_dir / f"page_{page_idx:04d}.json"
            if page_cache.exists():
                rows = json.loads(page_cache.read_text())
            elif cache_only:
                # Stop short rather than hitting EPA. Caller is signalling
                # "use what's cached, skip the rest."
                break
            else:
                end = start + PAGE_SIZE - 1
                url = (
                    f"{ENVIROFACTS_BASE}/"
                    + "/".join(segs)
                    + f"/rows/{start}:{end}/JSON"
                )
                r = client.get(url)
                r.raise_for_status()
                rows = r.json()
                page_cache.write_text(json.dumps(rows))
                if sleep_between > 0:
                    time.sleep(sleep_between)
            if not isinstance(rows, list) or not rows:
                break
            out.extend(rows)
            page_idx += 1
            if len(rows) < PAGE_SIZE:
                break
            if expected_total is not None and len(out) >= expected_total:
                break
            start += PAGE_SIZE
    return out


def get_count(path_segments: Iterable[str], cache_key: str | None = None) -> int:
    """Run the same query with /COUNT/ tail and return the integer total."""
    segs = list(path_segments) + ["COUNT"]
    data = fetch_json(segs, cache_key=cache_key)
    if isinstance(data, list) and data and "TOTALQUERYRESULTS" in data[0]:
        return int(data[0]["TOTALQUERYRESULTS"])
    raise RuntimeError(f"unexpected COUNT shape: {data!r}")
