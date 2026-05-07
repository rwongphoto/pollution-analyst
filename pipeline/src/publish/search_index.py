"""Build the client-side search index served at /search-index.json.

Walks data/published/{state,county,city,superfund} and emits a single flat
JSON list keyed for Fuse.js fuzzy search in the SiteHeader. Single-letter
field names keep the payload tight (~1.5 MB raw across state+county+city+
superfund at full 50-state coverage); the file is fetched once on first
search-input focus.

Field encoding:
  t: entity type — "s" state, "co" county, "ci" city, "sf" superfund
  n: display name
  s: route-suffix slug — "ca", "ca/alameda", "ca/acampo", "ca/aerojet-general-corp"
  l: state abbr (uppercase) — used as a result-row badge
  c: context disambiguator (county for cities, city/county for superfund) — optional

Water utilities and TRI facilities are intentionally excluded: water alone
is ~48k records and would push the index past the threshold where Fuse.js
on low-end mobile starts to stutter.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path

from ..config import PUBLISHED_ROOT

log = logging.getLogger(__name__)

OUTPUT_NAME = "search-index.json"


def _read_json(path: Path) -> dict | None:
    try:
        with path.open() as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        log.warning("search-index: skipping %s (%s)", path, e)
        return None


def _state_records(published: Path) -> list[dict]:
    out: list[dict] = []
    for p in sorted((published / "state").glob("*.json")):
        d = _read_json(p)
        if not d:
            continue
        s = d.get("state") or {}
        name = s.get("name")
        slug = s.get("slug")
        if not (name and slug):
            continue
        out.append({"t": "s", "n": name, "s": slug, "l": slug.upper()})
    return out


def _county_records(published: Path) -> list[dict]:
    out: list[dict] = []
    for state_dir in sorted((published / "county").glob("*")):
        if not state_dir.is_dir():
            continue
        for p in sorted(state_dir.glob("*.json")):
            d = _read_json(p)
            if not d:
                continue
            c = d.get("county") or {}
            name = c.get("name")
            slug = c.get("slug")
            state = c.get("state")
            if not (name and slug and state):
                continue
            out.append({
                "t": "co",
                "n": name,
                "s": f"{state}/{slug}",
                "l": state.upper(),
            })
    return out


def _city_records(published: Path) -> list[dict]:
    out: list[dict] = []
    for state_dir in sorted((published / "city").glob("*")):
        if not state_dir.is_dir():
            continue
        for p in sorted(state_dir.glob("*.json")):
            d = _read_json(p)
            if not d:
                continue
            place = d.get("place") or {}
            name = place.get("name")
            slug = place.get("slug")
            state = place.get("state")
            if not (name and slug and state):
                continue
            rec = {
                "t": "ci",
                "n": name,
                "s": f"{state}/{slug}",
                "l": state.upper(),
            }
            county = place.get("county_name")
            if county:
                rec["c"] = county
            out.append(rec)
    return out


def _superfund_records(published: Path) -> list[dict]:
    out: list[dict] = []
    for state_dir in sorted((published / "superfund").glob("*")):
        if not state_dir.is_dir():
            continue
        for p in sorted(state_dir.glob("*.json")):
            d = _read_json(p)
            if not d:
                continue
            site = d.get("site") or {}
            name = site.get("name")
            slug = site.get("slug")
            state = site.get("state")
            if not (name and slug and state):
                continue
            rec = {
                "t": "sf",
                "n": name,
                "s": f"{state}/{slug}",
                "l": state.upper(),
            }
            ctx_parts = [site.get("city"), site.get("county")]
            ctx = ", ".join(p for p in ctx_parts if p)
            if ctx:
                rec["c"] = ctx
            out.append(rec)
    return out


def build_search_index() -> Path:
    """Walk the published tree and write search-index.json.

    Returns the path written. Callers wire this in after every
    publish_rankings so the index reflects the freshest slug set."""
    published = PUBLISHED_ROOT
    items: list[dict] = []
    items.extend(_state_records(published))
    items.extend(_county_records(published))
    items.extend(_city_records(published))
    items.extend(_superfund_records(published))

    payload = {
        "version": 1,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "items": items,
    }
    out_path = published / OUTPUT_NAME
    with out_path.open("w") as f:
        json.dump(payload, f, separators=(",", ":"), ensure_ascii=False)

    counts: dict[str, int] = {}
    for it in items:
        counts[it["t"]] = counts.get(it["t"], 0) + 1
    log.info(
        "search-index: %d items (s=%d co=%d ci=%d sf=%d) → %s (%.1f KB)",
        len(items),
        counts.get("s", 0),
        counts.get("co", 0),
        counts.get("ci", 0),
        counts.get("sf", 0),
        out_path,
        out_path.stat().st_size / 1024,
    )
    return out_path
