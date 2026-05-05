"""Pipeline configuration: paths, endpoints, defaults.

DATA_ROOT layout:
    data/
      raw/                       cached EPA responses (gitignored)
        envirofacts/
          tri_facility_form_release_<state>_<year>.json
          tri_chem_info.json
      published/                 frontend-readable JSON (carved into git)
        home.json
        state/<slug>.json
        county/<state>/<slug>.json
        facility/<state>/<slug>.json
        water/<state>/<slug>.json
"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = REPO_ROOT / "data"
RAW_ROOT = DATA_ROOT / "raw"
PUBLISHED_ROOT = DATA_ROOT / "published"

# EPA Envirofacts JSON API root. Documented here:
#   https://www.epa.gov/enviro/envirofacts-data-service-api
ENVIROFACTS_BASE = "https://data.epa.gov/efservice"

# Default reporting year for TRI runs. TRI is annual; year T's preliminary
# bulk CSV typically appears Oct of T+1, finalized Oct of T+2. As of 2026,
# 2024 is the latest year EPA publishes; bump again when 2025 lands.
DEFAULT_TRI_YEAR = 2024

# How many chemicals to surface on a facility page (top by pounds).
FACILITY_TOP_CHEMICALS = 8
# How many top facilities to surface on a county / state page.
COUNTY_TOP_FACILITIES = 10
STATE_TOP_FACILITIES = 10
# How many top counties to surface on a state page.
STATE_TOP_COUNTIES = 10

# How many years of history to include per-chemical on a facility page.
FACILITY_HISTORY_YEARS = 14
