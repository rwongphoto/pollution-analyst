# Pollution Analyst.ai — Site Architecture

**Status:** California POC live. One state ingested end-to-end (TRI, SDWIS, GHGRP, EJScreen-clone, ACS). Five programmatic page types render statically.

**Companion docs:**
- [`page_templates.md`](page_templates.md) — per-template section breakdowns.
- [`pollution_data_plan.md`](pollution_data_plan.md) — historical design playbook. Read for *why* decisions were made; read this for *what the site is now*.
- [`prose_strategy.md`](prose_strategy.md) — the no-LLM-in-POC, template-first stance.
- [`anomaly_engine_design.md`](anomaly_engine_design.md) — flag taxonomy + thresholds + calibration.

## Positioning

Trend intelligence and narrative platform for environmental data — **not a real-time AQI dashboard**. The differentiation, all of which has shipped (CA only):

- Analytics + storytelling layer on top of public-domain federal data.
- Methodological discipline (transparent caveats, federal-only sourcing).
- Programmatic SEO at scale via stacked place / entity surfaces — 4,769 pages rendered for CA alone.
- Anomaly detection as encoded editorial judgment (four flag types calibrated against CA data).
- Deterministic template prose — no LLM in the loop. See [`prose_strategy.md`](prose_strategy.md).

## Live Coverage (CA POC)

| Geography | Count | Source |
|---|---|---|
| State hub | 1 (CA) | TRI 2010–2023 + GHGRP 2010–2024 + SDWIS + EJScreen-clone |
| County hubs | 44 | CA + TX stub |
| City hubs (place-anchored) | 822 | CA Census places with ≥1 facility or ≥1 utility serving |
| TRI facility entity pages | 822 | CA + TX stub |
| SDWIS water utility entity pages | 3,071 | CA active CWSes + Flint MI demo |
| Methodology | 1 | static |

Total static pages: **4,769** at last build.

## Route Map

All routes are statically generated (`generateStaticParams`). `dynamicParams = false` on every dynamic segment — only what the pipeline published is reachable.

```
/                                     Home
/methodology                          Methodology + per-source caveats
/state/[state]                        State hub (e.g. /state/ca)
/state/[state]/county/[slug]          County place page
/state/[state]/city/[slug]            City hub — place-anchored aggregate
/state/[state]/facility/[slug]        TRI facility entity page
/state/[state]/water/[slug]           SDWIS water utility entity page
```

The routing follows a four-tier hierarchy distinct from the crime site's single-tier (neighborhood-only) model:
- **Tier 0 — state**, single-page-per-state aggregator.
- **Tier 2 — place**: county and city hubs. Roll up entities + equity into a "what's the environment like here?" surface.
- **Tier 1 — entity**: TRI facility, SDWIS public water system. The PWS and the city are *not* the same thing — a PWS can serve multiple cities and a city can be served by multiple PWSes; both surfaces exist for this reason.
- **Tier 3 — neighborhood**: deferred. Will land when NATA + EJScreen tract data is ingested.

## Page Inventory

| Route | Purpose | Update cadence |
|---|---|---|
| `/` | Cross-state hero, three featured entities, principles, equity band, CTAs | Every publish |
| `/methodology` | Pollutant taxonomy, anomaly engine rules, equity-overlay stance, per-source caveats | When sources or thresholds change |
| `/state/[state]` | State hub: pathways, top counties, top facilities, top utilities, equity, county directory | Every publish |
| `/state/[state]/county/[slug]` | County: pathways, top facilities, utilities, equity | Every publish |
| `/state/[state]/city/[slug]` | City hub: in-city facilities + utilities-serving + equity | Every publish |
| `/state/[state]/facility/[slug]` | TRI facility entity: chemicals, releases, equity | Every publish |
| `/state/[state]/water/[slug]` | SDWIS utility entity: violation history, contaminants, equity | Every publish |

## Pipeline → Page Mapping

Every page reads JSON written by the pipeline to `data/published/`. The frontend has no other data source.

| File path | Consumed by | Written by |
|---|---|---|
| `home.json` | `/` | `publish_site.publish_home()` |
| `state/<slug>.json` | `/state/[state]` | `publish_site.publish_state()` |
| `county/<state>/<slug>.json` | `/state/[state]/county/[slug]` | `publish_site.publish_county()` |
| `city/<state>/<slug>.json` | `/state/[state]/city/[slug]` | `publish_site.publish_city_hub()` |
| `facility/<state>/<slug>.json` | `/state/[state]/facility/[slug]` | `publish_site.publish_facility()` |
| `water/<state>/<slug>.json` | `/state/[state]/water/[slug]` | `publish_site.publish_water()` |

Loaders live in [`frontend/src/lib/data.ts`](frontend/src/lib/data.ts). All loaders are server-only; the frontend ships zero runtime fetches for these payloads.

## Data Flow

```
EPA TRI bulk CSVs · EPA Envirofacts (GHGRP, SDWIS) · USEPA-clone bgej.arrow
· Census ACS · TIGER 2020 shapefiles
    │
    ▼
pipeline/src/ingest/<source>.py        (per-source modules: tri, sdwis, ghgrp, ejscreen)
    │
    ▼
pipeline/src/normalize/                (chemicals.py, contaminants.py — taxonomy mapping)
    │
    ▼
pipeline/src/spatial/                  (county_fips, places point-in-polygon, ACS demos)
    │
    ▼
pipeline/src/aggregate/build.py        (StateAgg, CountyAgg, FacilityAgg, UtilityAgg)
    │
    ▼
pipeline/src/flags/                    (anomaly engine: 4 flag types)
    │
    ▼
pipeline/src/publish/site.py           (writes data/published/*.json, cleanup_stale)
    │
    ▼
frontend/ (Next.js SSG)                (statically rendered to Vercel)
```

Pipeline CLI: `python -m pipeline.src.main run --state ca --year 2023 --history-from 2010`. Flags `--no-flags`, `--skip-sdwis`, `--history-cache-only` for partial runs.

## Pollutant Taxonomy

The cross-source common denominator. Used identically on every page where pathway tiles render:

| Pathway slug | Source | Units |
|---|---|---|
| `tri_air` | TRI 5.1 fugitive + 5.2 stack | lb |
| `tri_water` | TRI 5.3 | lb |
| `tri_land` | TRI land + off-site | lb |
| `ghg` | GHGRP large emitters (Subpart A and below) | mtCO₂e |
| `criteria_air` | AQS (deferred — no air-monitor ingest yet) | µg/m³, ppb |
| `hazardous_air` | NATA / AirToxScreen (deferred) | µg/m³ |
| `drinking_water` | SDWIS (event-based, no continuous metric on pathway tiles) | n/a |
| `pesticide` | USGS NSP (deferred) | lb/county |

Per-pathway color is consistent across every chart component. Hazardous air, criteria air, drinking water (continuous), and pesticide pathway tiles are stubbed in the type system but not yet emitted by the pipeline.

## Anomaly Engine (4 flag types)

Per [`anomaly_engine_design.md`](anomaly_engine_design.md), v1 ships:

| Flag | Source | Geography | Trigger |
|---|---|---|---|
| `long_arc_shift` | TRI / GHGRP | facility, county, state | ≥50% change vs ≥10-year baseline, with ≥50k lb / ≥100k mtCO₂e baseline floor |
| `release_shift` | TRI | facility × chemical | ≥50% YoY AND ≥10k lb absolute AND ≥1k lb prior |
| `violation_event` | SDWIS | water utility | Health-based or unresolved violation |
| `ghg_step` | GHGRP | county | ≥30% YoY AND both years ≥10k mtCO₂e |

Calibration target: 1–3 flags per geography on average. Rendered cap on the page UI is 4 (severity-weighted). Calibration counts log per publish run; thresholds tighten if average overshoots.

Deferred (AQS-dependent or facility-join-dependent): `smoke_days`, `naaqs_exceedance`, facility-level `ghg_step`, `sustained_shift`, `streak_break`.

## Equity Overlay

Three-layer composition, demographics-leading, per the plan's post-EJScreen-deprecation rewrite:

1. **Demographic context.** Census ACS 2018-2022: population total + share low-income / people of color / under 5 / over 64. Always rendered.
2. **EJ disparity scores.** USEPA-clone `bgej.arrow`, population-weighted to state / county / city. Higher = greater disparate burden; 100 = reference.
3. **National percentiles.** *Pending.* Computed in-pipeline once raw indicator columns are ingested. Will render between (1) and (2) on the page once available.

Rendered on state, county, city hub, facility (county-as-proxy), and water-utility (place-as-proxy if matched, else county) pages. Facility-level uses containing-county equity until 3-mile-buffer aggregation lands.

## Frontend Stack

- **Next.js 16 (App Router, Turbopack)** — SSG, `dynamicParams = false` on every dynamic segment. The Next.js version diverges from training-data defaults; `frontend/AGENTS.md` is the binding rule for any Next.js work.
- **Inline SVG** for sparklines, hero charts, anomaly card sparklines. No charting library — direct SVG keeps the static bundle small.
- **CSS variables** for the design system (`--ink`, `--fg-2`, `--blue`, `--green`, `--red`, `--amber`, `--graphite-2`). Pathway colors live alongside each consuming component.
- **No client-side data fetching** for page content — all JSON is read server-side at build time.
- **No Mapbox** yet. Crime site uses Mapbox heavily; pollution site doesn't have neighborhood polygons, so a choropleth isn't load-bearing yet.

## Operational Cadence

- **Annual ingest** for TRI (reporting year T published in T+1), GHGRP, ACS.
- **Continuous-but-cached SDWIS** — the violation table changes when EPA updates it; we re-pull on demand.
- **Bulk CSV is the primary path** for every Envirofacts-fronted source. The REST API rate-limits aggressively; bulk downloads scale and are designed for this use. See plan §"Source Resilience".
- **`--history-cache-only` mode** lets the pipeline run during EPA outages by reading whatever's already in `data/raw/`.
- **Monthly publish** is the eventual cadence; today the POC is run-on-demand.

## What's Excluded (Deliberately)

- **Real-time AQI / push notifications.** Not a dashboard.
- **Health diagnoses / medical advice.** Reference exposure thresholds; do not interpret for individuals.
- **Per-individual exposure modeling.** Aggregate (facility, utility, county, place) is the unit of analysis.
- **Speculative attribution** of health outcomes to specific facilities beyond what TRI / ECHO publishes directly.
- **Real-estate value framing.** Pollution data is not a property-listing feature.
- **Commercial / non-federal sensors** (PurpleAir et al.). Federal corpus only.
- **LLM-generated prose** in v1. Deterministic templates only — see [`prose_strategy.md`](prose_strategy.md).

## Open Areas

- **AQS / NATA ingest.** The Tier-3 neighborhood surface depends on this; the criteria-air pathway tile is stubbed and not yet emitting.
- **National-percentile equity layer.** Indicator-rank-against-all-US-block-groups computation, planned to slot between demographic context and EJ disparity scores.
- **TRI ↔ GHGRP facility-ID join.** Unlocks facility-level `ghg_step` flags.
- **Sustained-shift / streak-break flags.** Need a monthly cadence; TRI is annual-native.
- **Cross-state expansion.** Pipeline is parameterized on state slug; bulk-CSV cache is keyed per state. Adding a state is registration + ACS + TIGER fetch.
- **Methodology page equity block.** Currently still references EJScreen as if it's live; needs to be brought in line with the plan's three-layer rewrite.
- **TX demo stubs.** `data/published/{state,county,facility}/tx/` predate the real pipeline; either delete or pipe through proper TX ingest.
