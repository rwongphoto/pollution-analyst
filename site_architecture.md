# Pollution Analyst.ai — Site Architecture

**Status:** 50-state coverage live. Every US state ingested end-to-end (TRI, SDWIS, GHGRP, AQS, AirToxScreen, EJScreen-clone, CDC PLACES, SEMS, ACS). Eight programmatic page types render statically, plus five cross-surface ranking pages.

**Companion docs:**
- [`page_templates.md`](page_templates.md) — per-template section breakdowns.
- [`pollution_data_plan.md`](pollution_data_plan.md) — historical design playbook. Read for *why* decisions were made; read this for *what the site is now*.
- [`prose_strategy.md`](prose_strategy.md) — the no-LLM-in-POC, template-first stance.
- [`anomaly_engine_design.md`](anomaly_engine_design.md) — flag taxonomy + thresholds + calibration.

## Positioning

Trend intelligence and narrative platform for environmental data — **not a real-time AQI dashboard**. The differentiation, all of which has shipped:

- Analytics + storytelling layer on top of public-domain federal data.
- Methodological discipline (transparent caveats, federal-only sourcing).
- Programmatic SEO at scale via stacked place / entity surfaces — ~87k pages rendered across all 50 states.
- Anomaly detection as encoded editorial judgment (five flag types calibrated against the 50-state corpus).
- Deterministic template prose — no LLM in the loop. See [`prose_strategy.md`](prose_strategy.md).

## Live Coverage

| Geography | Count | Source |
|---|---|---|
| State hubs | 50 | TRI 2010–2024 + GHGRP 2010–2023 + AQS 2010–2024 + SDWIS + AirToxScreen 2020 + EJScreen-clone + SEMS |
| County hubs | 3,146 | every published county with TRI / GHG / AQS / EJ / SEMS data |
| City hubs (place-anchored) | 17,257 | Census places with ≥1 facility, ≥1 utility serving, or ≥1 NPL site |
| TRI facility entity pages | 16,461 | every state |
| SDWIS water utility entity pages | 48,652 | active CWSes across every state |
| Superfund / NPL site entity pages | 1,814 | Final + Proposed + Deleted + Withdrawn from SEMS, every state |
| Cross-surface ranking pages | 5 | states · counties · cities · facilities · superfund |
| Methodology | 1 | static |
| Legal (Terms + Privacy) | 1 | static |

Total static pages: **~87,388** at last build.

## Route Map

All routes are statically generated (`generateStaticParams`). `dynamicParams = false` on every dynamic segment — only what the pipeline published is reachable.

```
/                                     Home
/methodology                          Methodology + per-source caveats
/legal                                Terms + Privacy
/rankings/states                      Cross-state rankings
/rankings/counties                    Cross-county rankings (national + by state)
/rankings/cities                      Cross-city rankings (national + by state)
/rankings/facilities                  Cross-facility rankings
/rankings/superfund                   Cross-NPL-site rankings
/state/[state]                        State hub (e.g. /state/ca)
/state/[state]/county/[slug]          County place page
/state/[state]/city/[slug]            City hub — place-anchored aggregate
/state/[state]/facility/[slug]        TRI facility entity page
/state/[state]/water/[slug]           SDWIS water utility entity page
/state/[state]/superfund/[slug]       Superfund / NPL site entity page
```

The routing follows a four-tier hierarchy distinct from the crime site's single-tier (neighborhood-only) model:
- **Tier 0 — state**, single-page-per-state aggregator.
- **Tier 2 — place**: county and city hubs. Roll up entities + equity into a "what's the environment like here?" surface.
- **Tier 1 — entity**: TRI facility, SDWIS public water system, and Superfund / NPL site. The PWS and the city are *not* the same thing — a PWS can serve multiple cities and a city can be served by multiple PWSes; both surfaces exist for this reason. NPL sites are similarly distinct from the city they sit in. Page template: [`page_templates.md`](page_templates.md) §8.
- **Tier 3 — neighborhood**: deferred. Will land when NATA + EJScreen tract data is ingested.

## Page Inventory

| Route | Purpose | Update cadence |
|---|---|---|
| `/` | Cross-state hero, national choropleth, rankings pivot, principles, equity band, CTAs | Every publish |
| `/methodology` | Pollutant taxonomy, anomaly engine rules, equity-overlay stance, per-source caveats | When sources or thresholds change |
| `/legal` | Terms of Use + Privacy Policy | Static |
| `/rankings/states` | Top 10 states per indicator (PM2.5, NO₂, ozone, TRI air, EJ disparity, etc.) | Every publish |
| `/rankings/counties` | Top 10 counties nationally + Top 10 by state | Every publish |
| `/rankings/cities` | Top 10 cities nationally + Top 10 by state | Every publish |
| `/rankings/facilities` | Top facilities by release / chemical | Every publish |
| `/rankings/superfund` | Top NPL sites by status / contaminant burden | Every publish |
| `/state/[state]` | State hub: pathways, top counties, top facilities, top utilities, equity, county directory | Every publish |
| `/state/[state]/county/[slug]` | County: pathways, top facilities, utilities, NPL sites, equity | Every publish |
| `/state/[state]/city/[slug]` | City hub: in-city facilities + utilities-serving + NPL sites + equity | Every publish |
| `/state/[state]/facility/[slug]` | TRI facility entity: chemicals, releases, equity | Every publish |
| `/state/[state]/water/[slug]` | SDWIS utility entity: violation history, contaminants, equity | Every publish |
| `/state/[state]/superfund/[slug]` | NPL site entity: status, contaminants of concern, federal-facility flag, equity | Every publish |

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
| `superfund/<state>/<slug>.json` | `/state/[state]/superfund/[slug]` | `publish_site.publish_superfund()` |
| `search-index.json` | nav search box (client) | `publish.search_index.build_search_index()` |

Loaders live in [`frontend/src/lib/data.ts`](frontend/src/lib/data.ts). All loaders are server-only; the frontend ships zero runtime fetches for these payloads — except the nav search index, which the `SiteSearch` client component fetches on first focus from `/search-index.json`. The frontend's `prebuild` (and `predev`) hook runs `frontend/scripts/sync-search-index.mjs`, which copies the pipeline-emitted `data/published/search-index.json` into `frontend/public/` so the static export ships it as a top-level asset. The index covers states + counties + cities + superfund sites only (~22k records, ~290 KB gzipped); water utilities and TRI facilities are excluded to keep the client-side fuzzy-search payload tractable on low-end mobile.

## Data Flow

```
EPA TRI bulk CSVs · EPA Envirofacts (GHGRP, SDWIS, SEMS) · USEPA-clone bgej.arrow
· EPA AQS bulk · EPA AirToxScreen · CDC PLACES · Census ACS · TIGER 2020 shapefiles
    │
    ▼
pipeline/src/ingest/<source>.py        (per-source modules: tri, sdwis, ghgrp, ejscreen,
                                         aqs, airtoxscreen, cdc_places, superfund)
    │
    ▼
pipeline/src/normalize/                (chemicals.py, contaminants.py — taxonomy mapping)
    │
    ▼
pipeline/src/spatial/                  (county_fips, places point-in-polygon, ACS demos)
    │
    ▼
pipeline/src/aggregate/build.py        (StateAgg, CountyAgg, FacilityAgg, UtilityAgg,
                                         SuperfundSiteAgg)
    │
    ▼
pipeline/src/flags/                    (anomaly engine: 4 flag types)
    │
    ▼
pipeline/src/publish/site.py           (writes data/published/*.json, cleanup_stale)
pipeline/src/publish/rankings.py       (writes data/published/rankings.json)
pipeline/src/publish/search_index.py   (writes data/published/search-index.json, nav search)
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
| `criteria_air` | AQS annual_conc_by_monitor (PM2.5 annual + 24-hr 98th, Ozone 8-hr 4th-max, NO₂ annual) | µg/m³, ppm, ppb |
| `hazardous_air` | AirToxScreen 2020 (cancer-risk total + formaldehyde + benzene ambient) | per million, µg/m³ |
| `drinking_water` | SDWIS (event-based, no continuous metric on pathway tiles) | n/a |
| `pesticide` | USGS NSP (deferred) | lb/county |

Per-pathway color is consistent across every chart component. `hazardous_air` is single-vintage (2020) — EPA's AirToxScreen cadence is ~3-4 years, so the tile renders without a YoY/long-arc spark trail. Drinking water (continuous) and pesticide pathway tiles are stubbed in the type system but not yet emitted by the pipeline. SO₂ / CO / Lead / PM10 are deliberately excluded from the v1 `criteria_air` set — rarely the editorial story outside of specific industrial contexts; can be added without changing the pathway shape.

## Anomaly Engine (5 flag types)

Per [`anomaly_engine_design.md`](anomaly_engine_design.md), v1 ships:

| Flag | Source | Geography | Trigger |
|---|---|---|---|
| `long_arc_shift` | TRI / GHGRP | facility, county, state | ≥50% change vs ≥10-year baseline, with ≥50k lb / ≥100k mtCO₂e baseline floor |
| `release_shift` | TRI | facility × chemical | ≥50% YoY AND ≥10k lb absolute AND ≥1k lb prior |
| `violation_event` | SDWIS | water utility | Health-based or unresolved violation |
| `ghg_step` | GHGRP | county | ≥30% YoY AND both years ≥10k mtCO₂e |
| `naaqs_exceedance` | AQS | county, state | Population-of-monitors mean for a NAAQS-relevant metric exceeds the standard in the most recent reporting year |

Calibration target: 1–3 flags per geography on average. Rendered cap on the page UI is 4 (severity-weighted). Calibration counts log per publish run; thresholds tighten if average overshoots.

Deferred (facility-join- or sub-annual-cadence-dependent): `smoke_days`, facility-level `ghg_step`, `sustained_shift`, `streak_break`. AirToxScreen-based flags (e.g. cancer-risk threshold) are an open follow-up — the source is now ingested but no flag detector reads it yet. Superfund-driven flags (`stalled_cleanup` — listed >N years with no recent SEMS action; `recently_deleted` — partial or full NPL deletion in the last 2 years; `5yr_review_overdue` — EPA's mandated post-cleanup 5-year review past due) are deferred to the v1+ ingest landing.

## Equity Overlay

Three-layer composition, demographics-leading, per the plan's post-EJScreen-deprecation rewrite:

1. **Demographic context.** Census ACS 2018-2022: population total + share low-income / people of color / under 5 / over 64. Always rendered.
2. **National percentiles, per environmental indicator.** Population-weighted geography mean ranked against the national CDF of all US block-group means. Computed in-pipeline from `USEPA-clone/EJAM-open/data/blockgroupstats.rda`. Mirrors the framing EPA's original EJScreen used.
3. **EJ disparity scores.** USEPA-clone `bgej.arrow`, population-weighted to state / county / city. Higher = greater disparate burden; 100 = reference.

Rendered on state, county, city hub, facility (3-mile block-group buffer → containing county fallback), water-utility (place-as-proxy if matched, else county), and Superfund-site (1-mile block-group buffer → host city → containing county) pages. Buffer-anchored overlays show ACS demographics only; national-percentile and EJ-disparity layers are dropped when the buffer is the source — those are aggregated at place/county scope today and pairing them with buffer demographics would over-claim. Buffer demographics use TIGER 2020 block-group INTPTLAT/INTPTLON centroids and population-weight `pop`/`pctlowinc`/`pctmin`/`pctunder5`/`pctover64` from `USEPA-clone/EJAM-open/data/blockgroupstats.rda`.

## Frontend Stack

- **Next.js 16 (App Router, Turbopack)** — SSG, `dynamicParams = false` on every dynamic segment. The Next.js version diverges from training-data defaults; `frontend/AGENTS.md` is the binding rule for any Next.js work.
- **Inline SVG** for sparklines, hero charts, anomaly card sparklines. No charting library — direct SVG keeps the static bundle small.
- **CSS variables** for the design system (`--ink`, `--fg-2`, `--blue`, `--green`, `--red`, `--amber`, `--graphite-2`). Pathway colors live alongside each consuming component.
- **No client-side data fetching** for page content — all JSON is read server-side at build time.
- **No Mapbox** yet. Crime site uses Mapbox heavily; pollution site doesn't have neighborhood polygons, so a choropleth isn't load-bearing yet.

## Operational Cadence

- **Annual ingest** for TRI (reporting year T published in T+1), GHGRP, ACS.
- **GHGRP 2024 unavailable.** EPA's Envirofacts returns 0 rows nationally for GHGRP year 2024 — the Trump administration halted the GHG Reporting Program in 2025 and the year-2024 dataset that would normally have published in late 2025 was not released. EIP [released the data independently](https://environmentalintegrity.org/news/eip-releases-2024-industrial-greenhouse-gas-data-after-trump-halts-reporting-program/); we have not yet ingested it. Every state's GHG pathway tile lands on 2023 as the most-recent year with data. Surface on `/methodology#ghgrp`.
- **Twice-yearly AQS refresh** — EPA republishes `annual_conc_by_monitor_YYYY.zip` in June (prior-year final) and December (summer/ozone update). Cache lives at `data/raw/aqs/`; one-time warm-up needs a non-`--history-cache-only` run before subsequent runs can stay cache-only.
- **AirToxScreen vintage refresh** — EPA publishes a new vintage every ~3-4 years (2020 vintage released 2024-2025; prior was 2017). Cache lives at `data/raw/airtoxscreen/{vintage}/`; the regional cancer-by-pollutant XLSX is ~346 MB (R9), one-time per vintage. Bump `airtoxscreen.VINTAGE` and add the new region map when the next vintage lands.
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

- **Schema.org JSON-LD on every entity template — shipped.** Six templates emit a `@graph` block from a `<script type="application/ld+json">` tag in the page component, alongside the existing home (`WebSite`, `Organization`) and `/methodology` (`Article`, `BreadcrumbList`, `Organization`) blocks. Each page reuses a single `*Description(data)` helper so the meta description and the schema description can't drift, and each breadcrumb mirrors the visible `<Crumbs>` items (URL-less crumbs are skipped — Google's `BreadcrumbList` rich result requires every `item` to be a URL).
  - **State** ([`state/[state]/page.tsx`](frontend/src/app/state/%5Bstate%5D/page.tsx)) → `BreadcrumbList` + `Article` + `Organization` + `Place`. Image: `/icon.png`.
  - **County** ([`county/[slug]/page.tsx`](frontend/src/app/state/%5Bstate%5D/county/%5Bslug%5D/page.tsx)) → `BreadcrumbList` + `Article` + `Place` (with `PostalAddress.addressRegion`) + `Organization`. Image: `ImageObject` `/icon.png` 512×512.
  - **City** ([`city/[slug]/page.tsx`](frontend/src/app/state/%5Bstate%5D/city/%5Bslug%5D/page.tsx)) → `Place` (with `addressLocality`) + `BreadcrumbList` (4-item with county / 3-item without) + `Organization` + `Article`.
  - **Facility** ([`facility/[slug]/page.tsx`](frontend/src/app/state/%5Bstate%5D/facility/%5Bslug%5D/page.tsx)) → `BreadcrumbList` (5-item Home → State → County → City → Facility) + `Organization` (facility-as-org with full street address) + `Article` (with `datePublished`/`dateModified` from `_published_at` ?? `source.retrieved`) + `Place`. Image: `ImageObject` 512×512.
  - **Water utility** ([`water/[slug]/page.tsx`](frontend/src/app/state/%5Bstate%5D/water/%5Bslug%5D/page.tsx)) → `Article` + `BreadcrumbList` + `Organization` carrying `identifier` (`PropertyValue` `propertyID: "PWSID"`) + `sameAs` pointing at the EPA SDWIS site (same URL the page's "EPA SDWIS record" button uses — single source of truth).
  - **Superfund** ([`superfund/[slug]/page.tsx`](frontend/src/app/state/%5Bstate%5D/superfund/%5Bslug%5D/page.tsx)) → `BreadcrumbList` + `Article` + `Place` carrying `identifier` (`PropertyValue` `propertyID: "EPA ID"`) and `GeoCoordinates` from `s.lat`/`s.lng`. Modeled as `Place` rather than `Organization` — a contaminated location is not a corporate entity.
  
  Canonical site URL is now `https://www.pollutionanalyst.com` ([`frontend/src/lib/seo.ts`](frontend/src/lib/seo.ts) + [`frontend/src/app/layout.tsx`](frontend/src/app/layout.tsx) — fixed from `.ai` 2026-05-06). All schema URLs derive from `SITE_URL`, so the host stays consistent.

  **Open follow-ups:**
  - **`Dataset` nodes per pathway block** (TRI air, AQS PM2.5/NO₂/O₃, SDWIS, AirToxScreen) — not yet emitted. Would cite EPA as `creator` and retrieval date as `dateModified`. Significant payload-shape work since `creator` / `distribution` blocks need machine-readable URLs per pathway, not just our display labels. Deferred until pathways stabilize across data sources.
  - **`WebPage` with `lastReviewed`** — not yet emitted. Less impactful than the per-entity nodes above; the `Article.dateModified` already gives crawlers a freshness signal on facility/Superfund pages.
  - **Rankings pages → `ItemList`** — rankings pages are live at `/rankings/{states,counties,cities,facilities,superfund}` but none emit `ItemList` JSON-LD yet. When wired, each Top-10 block gets one `ItemList` with `position` + `url` per entity.
  - **Per-page OG images** — every Article currently uses `/icon.png`. Article rich results favor larger per-page images; revisit when an `opengraph-image.tsx` route generator is justifiable. Pipeline could synthesize per-state / per-entity hero charts at build time.
- **TRI ↔ GHGRP facility-ID join.** Unlocks facility-level `ghg_step` flags.
- **Sustained-shift / streak-break flags.** Need a monthly cadence; TRI is annual-native.
- **SDWIS `OWNER_TYPE_CODE` ingest + UI chip — shipped.** `WaterSystem.owner_type_code` ingested from `WATER_SYSTEM`, normalized to `local | mixed | tribal | private | state | federal` on `UtilityAgg.owner_type` (and `NearbyGroundwaterUtility.owner_type` for Superfund linkage), threaded through `_utility_summary` + `publish_water` + `water_linkage` payloads. Frontend chip ("Municipal" / "Private" / "Tribal" / "State-owned" / "Federal" / "Mixed") renders on state / county / city water tables, the water entity hero, and the Superfund water-linkage section. 50-state distribution across 48,652 utilities: 23,862 Municipal · 22,091 Private · 1,162 Mixed · 764 Tribal · 417 State · 354 Federal (2 records had no source code).
- **Superfund / NPL site coverage — shipped.** 1,814 entity pages (Final + Proposed + Deleted + Withdrawn) at `/state/[state]/superfund/[slug]`, plus `SuperfundSection` rollups on state / county / city hubs. City-hub eligibility extended to "≥1 NPL site in the polygon" as a third qualifying condition. Equity overlay is a 1-mile block-group buffer (host-city / county fallback when no centroids fall inside). Source: `sems.envirofacts_site` + `sems.envirofacts_contaminants` via Envirofacts. Page template: [`page_templates.md`](page_templates.md) §8.

  Open follow-ups:
  - **`WaterLinkageSection`** — shipped on entity page (3-mile buffer). Distance computed to served-place centroid since SDWIS doesn't expose wellhead lat/lon — methodology disclosure on the section.
  - **Listing-date enrichment — evaluated, shelved.** Probed Envirofacts SEMS tables, cumulis.epa.gov SiteProfile scraping (multi-tab + multi-pattern regex), and SEMS Public PDF reports. Envirofacts has no listing-date column. Cumulis prose coverage was ~25–60% on a sample (many profile pages have no NPL-mentioning sentences); reliable extraction would require parsing the 4–34 MB FOIA-15 / List-8R PDFs. Not worth the lift relative to the editorial payoff. Hero degrades gracefully without the date — the §8 entity page leads with status + location instead of "Listed YYYY — N years in cleanup." Revisit if (a) EPA publishes a flat dataset of `(epa_id, listing_date)` rows, or (b) the editorial value swings hard enough to justify PDF parsing.
  - **`PhaseTimeline` component** — depended on the shelved listing-date enrichment; deferred indefinitely.
  - **Superfund-driven flags** (`stalled_cleanup`, `recently_deleted`, `5yr_review_overdue`) — deferred until calibrated.
  - **Operator / PRP ↔ TRI cross-link** — V2; gated on PRP-name normalization.
- **Downloadable graphics with Pollution Analyst watermark.** Every chart, map, and table on the site should be downloadable as a PNG with the Pollution Analyst logo + URL watermarked in the lower-right corner. For modules that bundle multiple cards (e.g. an EJ block, a TRI section), the *whole module* is one downloadable image rather than per-card downloads. Goal: turn each rendered surface into a shareable asset that carries attribution back to the site (Reddit / Twitter / Bluesky / journalist screenshots all currently lose the source). Implementation sketch: a `<Downloadable>` wrapper component using `html-to-image` (works under static export — pure client-side DOM-to-canvas) with an absolute-positioned watermark layer that's `opacity-0` on screen and shown only during capture; a small download icon button surfaces in the top-right of the wrapper on hover. Mapbox WebGL canvases need a different code path — `map.getCanvas().toDataURL()` composited with the surrounding DOM via `preserveDrawingBuffer: true`. Open questions for when this gets picked up: (1) logo asset — wordmark SVG vs. PNG mark; (2) format menu — PNG only, or also CSV-for-tables / SVG-for-charts; (3) whether to also bake an OG-image-style hero export per state/county/city as a build-time asset for richer social previews.
