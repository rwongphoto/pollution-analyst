"""Map TRI chemicals to the platform's category buckets.

Categories surfaced on facility / county pages:
- 'pbt'         persistent bioaccumulative toxin
- 'carcinogen'  IARC / NTP / EPA carcinogen
- 'respiratory' Clean Air Act Amendments §112 hazardous air pollutant (HAP)
                with no carc / pbt flag — proxy for general inhalation hazard
- 'general'     everything else

Source of categorization: TRI_CHEM_INFO indicators (carc_ind, pbt_ind,
caac_ind). Priority order is PBT > carcinogen > respiratory > general so a
chemical with multiple flags lands in the most-actionable bucket.
"""

from __future__ import annotations

from typing import Any, Literal

Category = Literal["pbt", "carcinogen", "respiratory", "general"]


def categorize(chem_info_row: dict[str, Any] | None) -> Category:
    if not chem_info_row:
        return "general"
    if _flag(chem_info_row, "pbt_ind"):
        return "pbt"
    if _flag(chem_info_row, "carc_ind"):
        return "carcinogen"
    if _flag(chem_info_row, "caac_ind"):
        return "respiratory"
    return "general"


def cas_for(chem_info_row: dict[str, Any] | None) -> str | None:
    if not chem_info_row:
        return None
    cas = chem_info_row.get("cas_registry_number")
    if cas in (None, "", "0"):
        return None
    return str(cas)


def _flag(row: dict[str, Any], key: str) -> bool:
    v = row.get(key)
    if v is None:
        return False
    s = str(v).strip()
    return s in ("1", "Y", "YES", "TRUE")
