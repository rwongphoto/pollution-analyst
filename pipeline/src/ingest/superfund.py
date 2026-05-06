"""Superfund / NPL site ingest from EPA Envirofacts.

Pulls NPL-relevant sites for a given state from the SEMS database, plus
contaminants of concern joined per site. Source URL pattern:
    https://data.epa.gov/efservice/sems.envirofacts_site/<filter>/JSON
    https://data.epa.gov/efservice/sems.envirofacts_contaminants/JSON

Two tables joined client-side by site_id:
- sems.envirofacts_site         ~55k rows nationally; ~4k per state, in-memory
                                filtered to NPL_INGEST_STATUSES.
- sems.envirofacts_contaminants ~73k rows nationally; filtered in-memory by
                                the resolved site_id set.

The Envirofacts query parser refuses /COUNT/ and /rows/{a}:{b}/ tail clauses
on dotted-namespace tables (parse error: "Expected OPERATOR" after the
schema.table prefix). Workaround: fetch the full filtered set in one shot —
both endpoints fit comfortably in a single response at current scale.

Listing-date gap: sems.envirofacts_site does not expose an NPL listing
date column. Phase 1 ingests without dates; Phase 1.5 enriches from a
secondary source (per-site SEMS SiteProfile pages, cached permanently per
EPA ID).

NPL status filter (V1 ingest scope) — see NPL_INGEST_STATUSES below:
- 'Currently on the Final NPL'
- 'Proposed for NPL'
- 'Deleted from the Final NPL'
- 'Withdrawn from the Final NPL'

Excluded from V1: 'Site is Part of NPL Site' (operable units of larger
sites — defer to V2 with parent linkage), 'Removed from Proposed NPL'
(never listed), 'Not on the NPL' (most rows; non-listed CERCLIS sites).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from ..states import State
from ._envirofacts import fetch_json

log = logging.getLogger(__name__)


NPL_INGEST_STATUSES = frozenset({
    "Currently on the Final NPL",
    "Proposed for NPL",
    "Deleted from the Final NPL",
    "Withdrawn from the Final NPL",
})


@dataclass
class SuperfundSite:
    site_id: str               # SEMS internal ID; joins to contaminants.fk_site_id
    epa_id: str                # EPA ID, e.g. 'CA2170023236' (URL-stable)
    name: str
    state: str                 # two-letter abbreviation
    npl_status: str            # verbatim npl_status_name from EPA
    is_archived: bool
    is_federal_facility: bool
    county_name: str
    fips_code: str             # 5-digit FIPS, e.g. '06001'
    city_name: str
    latitude: float | None
    longitude: float | None
    zip_code: str
    street_address: str

    @property
    def is_active_npl(self) -> bool:
        return self.npl_status == "Currently on the Final NPL"

    @property
    def is_deleted(self) -> bool:
        return self.npl_status in {
            "Deleted from the Final NPL",
            "Withdrawn from the Final NPL",
        }


@dataclass
class Contaminant:
    site_id: str               # joins SuperfundSite.site_id
    name: str                  # preferred_contaminant_name, title-cased
    media: str                 # exposure pathway: 'Groundwater', 'Soil', etc.
    operable_unit: str | None  # e.g. '02', or None
    action_name: str | None    # e.g. 'Record of Decision', or None


# ---- Site fetch ---------------------------------------------------------

def fetch_npl_sites(state: State) -> list[SuperfundSite]:
    """All NPL-relevant sites for the state. Returned set is the V1 entity-
    page universe.
    """
    segs = [
        "sems.envirofacts_site",
        "fk_ref_state_code", "equals", state.abbr,
    ]
    cache_key = f"sems_site_{state.abbr.lower()}"
    raw = fetch_json(segs, cache_key=cache_key)
    if not isinstance(raw, list):
        raise RuntimeError(
            f"unexpected SEMS site response shape: {type(raw).__name__}"
        )

    out: list[SuperfundSite] = []
    for r in raw:
        status = (r.get("npl_status_name") or "").strip()
        if status not in NPL_INGEST_STATUSES:
            continue
        site_id = str(r.get("site_id") or "").strip()
        epa_id = str(r.get("epa_id") or "").strip()
        if not site_id or not epa_id:
            continue
        out.append(
            SuperfundSite(
                site_id=site_id,
                epa_id=epa_id,
                name=_titlecase(r.get("name")),
                state=state.abbr,
                npl_status=status,
                is_archived=str(r.get("archived_ind") or "").upper() == "Y",
                is_federal_facility=str(r.get("federal_facility_ind") or "").upper() == "Y",
                county_name=_titlecase(r.get("county_name")),
                fips_code=str(r.get("fips_code") or "").strip(),
                city_name=_titlecase(r.get("city_name")),
                latitude=_to_float(r.get("primary_latitude_decimal_val")),
                longitude=_to_float(r.get("primary_longitude_decimal_val")),
                zip_code=str(r.get("zip_code") or "").strip(),
                street_address=_titlecase(r.get("street_addr_txt")),
            )
        )
    log.info(
        "Superfund %s: %d NPL-relevant sites (%d Final, %d Proposed, %d Deleted, %d Withdrawn)",
        state.abbr,
        len(out),
        sum(1 for s in out if s.npl_status == "Currently on the Final NPL"),
        sum(1 for s in out if s.npl_status == "Proposed for NPL"),
        sum(1 for s in out if s.npl_status == "Deleted from the Final NPL"),
        sum(1 for s in out if s.npl_status == "Withdrawn from the Final NPL"),
    )
    return out


# ---- Contaminants fetch -------------------------------------------------

def fetch_contaminants(site_ids: set[str]) -> list[Contaminant]:
    """Fetch the national SEMS contaminants table once, filter in-memory to
    the supplied site_id set. National total is bounded (~70-100k rows);
    single-shot fetch is acceptable. Caches by URL hash, so re-runs read
    from disk.
    """
    if not site_ids:
        return []
    segs = ["sems.envirofacts_contaminants"]
    raw = fetch_json(segs, cache_key="sems_contaminants_all")
    if not isinstance(raw, list):
        raise RuntimeError(
            f"unexpected SEMS contaminants response shape: {type(raw).__name__}"
        )

    out: list[Contaminant] = []
    for r in raw:
        sid = str(r.get("fk_site_id") or "").strip()
        if sid not in site_ids:
            continue
        name = (r.get("preferred_contaminant_name") or "").strip()
        if not name:
            continue
        out.append(
            Contaminant(
                site_id=sid,
                name=name.title(),
                media=(r.get("media_name") or "").strip(),
                operable_unit=(r.get("operable_unit_num") or "").strip() or None,
                action_name=(r.get("action_name") or "").strip() or None,
            )
        )
    log.info(
        "Superfund: %d contaminant records covering %d of %d sites",
        len(out),
        len({c.site_id for c in out}),
        len(site_ids),
    )
    return out


# ---- Helpers ------------------------------------------------------------

def _to_float(v) -> float | None:
    if v in (None, "", "NULL"):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f == 0.0:  # SEMS uses 0,0 as a missing-coord sentinel on some legacy rows
        return None
    return f


def _titlecase(v) -> str:
    if not v:
        return ""
    s = str(v).strip()
    if not s:
        return ""
    return s.title() if s.isupper() else s
