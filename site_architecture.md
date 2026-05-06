# Pollution Analyst.ai — Site Architecture

**Status:** California POC live. One state ingested end-to-end (TRI, SDWIS, GHGRP, AQS, EJScreen-clone, ACS). Five programmatic page types render statically.

**Companion docs:**
- [`page_templates.md`](page_templates.md) — per-template section breakdowns.
- [`pollution_data_plan.md`](pollution_data_plan.md) — historical design playbook. Read for *why* decisions were made; read this for *what the site is now*.
- [`prose_strategy.md`](prose_strategy.md) — the no-LLM-in-POC, template-first stance.
- [`anomaly_engine_design.md`](anomaly_engine_design.md) — flag taxonomy + thresholds + calibration.

## Positioning

Trend intelligence and narrative platform for environmental data — **not a real-time AQI dashboard**. The differentiation, all of which has shipped (CA only):

- Analytics + storytelling layer on top of public-domain federal data.
- Methodological discipline (transparent caveats, federal-only sourcing).
- Programmatic SEO at scale via stacked place / entity surfaces — 4,735 pages rendered for CA alone.
- Anomaly detection as encoded editorial judgment (five flag types calibrated against CA data).
- Deterministic template prose — no LLM in the loop. See [`prose_strategy.md`](prose_strategy.md).

## Live Coverage (CA POC)

| Geography | Count | Source |
|---|---|---|
| State hub | 1 (CA) | TRI 2010–2024 + GHGRP 2010–2024 + AQS 2010–2024 + SDWIS + EJScreen-clone + SEMS |
| County hubs | 58 | every CA county with TRI / GHG / AQS / EJ / SEMS data |
| City hubs (place-anchored) | 787 | CA Census places with ≥1 facility, ≥1 utility serving, or ≥1 NPL site |
| TRI facility entity pages | 785 | CA only |
| SDWIS water utility entity pages | 3,071 | CA active CWSes + Flint MI demo |
| Superfund / NPL site entity pages | 117 | CA Final + Proposed + Deleted + Withdrawn from SEMS |
| Methodology | 1 | static |

Total static pages: **4,820** at last build.

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
| `/` | Cross-state hero, three featured entities, principles, equity band, CTAs | Every publish |
| `/methodology` | Pollutant taxonomy, anomaly engine rules, equity-overlay stance, per-source caveats | When sources or thresholds change |
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

Loaders live in [`frontend/src/lib/data.ts`](frontend/src/lib/data.ts). All loaders are server-only; the frontend ships zero runtime fetches for these payloads.

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

Rendered on state, county, city hub, facility (county-as-proxy), water-utility (place-as-proxy if matched, else county), and Superfund-site (planned: 1-mile-buffer when tract data lands → host city → containing county) pages. Facility-level uses containing-county equity until 3-mile-buffer aggregation lands.

## Frontend Stack

- **Next.js 16 (App Router, Turbopack)** — SSG, `dynamicParams = false` on every dynamic segment. The Next.js version diverges from training-data defaults; `frontend/AGENTS.md` is the binding rule for any Next.js work.
- **Inline SVG** for sparklines, hero charts, anomaly card sparklines. No charting library — direct SVG keeps the static bundle small.
- **CSS variables** for the design system (`--ink`, `--fg-2`, `--blue`, `--green`, `--red`, `--amber`, `--graphite-2`). Pathway colors live alongside each consuming component.
- **No client-side data fetching** for page content — all JSON is read server-side at build time.
- **No Mapbox** yet. Crime site uses Mapbox heavily; pollution site doesn't have neighborhood polygons, so a choropleth isn't load-bearing yet.

## Operational Cadence

- **Annual ingest** for TRI (reporting year T published in T+1), GHGRP, ACS.
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

- **Ranking pages — county / city / state (HIGH PRIORITY — wealth-pollution gap visualization).** Sortable tables that surface the structural pattern across each programmatic surface. Currently the wealth-pollution correlation is only visible if you compare Marin (median income ~$140k, 0 TRI facilities, PM2.5 80th %ile) to Kern (median income ~$60k, 87 TRI facilities, PM2.5 99th %ile) by hand. Data is already in every payload (`equity.ej_indexes` + `equity.population` + ACS pulls). Three routes share one template:
  - `/rankings/counties` — every published county sorted by indicator percentile, with median income alongside.
  - `/rankings/cities` — same shape across the 822 published city hubs. The most editorially valuable surface — facility-host cities (Richmond, Fontana, Bakersfield) jump to the top of PM2.5 / NO₂ rankings and that's the story.
  - `/rankings/states` — across all ingested states. Trivially small (1 row today, 50 at full coverage) but high-traffic SEO surface — "most polluted states" is a real query.

  **Page structure — each ranking page groups every header section into two parallel top-10 tables, named by the surface:**
  - `/rankings/states` → **Top 10 states** (national across every ingested state).
  - `/rankings/counties` → **Top 10 counties** (national across every published county) + **Top 10 by State** (per-state sub-tables, or a state filter on the same table).
  - `/rankings/cities` → **Top 10 cities** (national across every published city hub) + **Top 10 by State** (per-state sub-tables).

  Both blocks appear under every header section on the page (e.g. PM2.5, NO₂, ozone, TRI air, EJ disparity) so a reader can pivot between "Top 10 nationally" and "Top 10 by State" without leaving the page. Today (CA-only POC) the **Top 10 by State** block is the shippable surface — facility-host cities (Richmond, Fontana, Bakersfield) jump to the top of PM2.5 / NO₂. Until cross-state coverage lands, the **Top 10 counties** / **Top 10 cities** national blocks render a "expands when state #2 ingests" placeholder rather than being hidden — the structure should be visible from day one. **Top 10 states** is also placeholder-only until state #2.

  All three pages render at home-publish time by reading the union of state / county / city JSONs. Optional: scatter / strip-plot of percentile vs median income to make the correlation literally a chart, not just a table. Optional cross-link: "X ranks Yth nationally / Zth in CA" on every per-place page header.
- **Semantic HTML pass on every programmatic template (CA-only, before cross-state expansion).** Audit `frontend/src/app/state/[state]/page.tsx`, `.../county/[slug]/page.tsx`, `.../city/[slug]/page.tsx`, `.../facility/[slug]/page.tsx`, `.../water/[slug]/page.tsx` for proper structure: single `<h1>`, hierarchical `<h2>`/`<h3>` (no rank skips), `<main>` / `<section>` / `<article>` / `<nav>` / `<aside>` in place of generic `<div>`s, `<time datetime="…">` on every reporting-year / publication-date, `<table>` with `<caption>` + `<thead>`/`<tbody>` + `<th scope="col|row">`, `<figure>` + `<figcaption>` for charts and maps, descriptive `alt` on every visualization, real link text (never "click here"). Why now: every template only exists once today (CA POC). Fixing the markup before cross-state fanout means the audit happens in one place instead of being repeated per state. Payoff is threefold — screen-reader accessibility, Google Lighthouse SEO score, and AI-crawler comprehension (SGE / Gemini / ChatGPT browsing weight semantic structure heavily when summarizing).
- **Schema.org JSON-LD on every programmatic surface (CA-only, before cross-state expansion).** Today JSON-LD ships only on the home page (`WebSite`, `Organization` — [`frontend/src/app/page.tsx:349`](frontend/src/app/page.tsx#L349)) and `/methodology` (`Article`, `BreadcrumbList`, `Organization`). The 822 city hubs, 58 county hubs, state hub, every facility page, and every water-system page render with no structured data. Per-template additions:
  - **State / county / city hubs** → `Place` (with `geo` lat/lon from existing payload), `BreadcrumbList`, `Dataset` for each pathway block (TRI air, AQS PM2.5/NO₂/O₃, SDWIS, AirToxScreen) citing EPA as `creator` and our retrieval date as `dateModified`, `WebPage` with `lastReviewed`.
  - **Facility pages** → `Place` + `Organization` (operator), `Dataset` for the multi-year release history, `BreadcrumbList`.
  - **Water-system pages** → `GovernmentService` (or `Organization` for private utilities — pairs naturally with the SDWIS `OWNER_TYPE_CODE` work below), `Dataset` for violation history, `BreadcrumbList`.
  - **Rankings pages (when shipped)** → `ItemList` with `position` + `url` per entity, one per Top-10 block.
  
  Why now: same logic as the semantic HTML pass — bake it into the templates before they fan out to 50 states. Concrete payoff: eligibility for Google rich results (sitelinks, Dataset Search inclusion, AI Overviews), Bing entity panels, and structured-data-aware AI crawlers. Implementation lives in the page components since payload data (lat/lon, pathway values, retrieval timestamps) is already in scope at render time.
- **TRI ↔ GHGRP facility-ID join.** Unlocks facility-level `ghg_step` flags.
- **Sustained-shift / streak-break flags.** Need a monthly cadence; TRI is annual-native.
- **Cross-state expansion.** Pipeline is parameterized on state slug; bulk-CSV cache is keyed per state. Adding a state is registration + ACS + TIGER fetch + a non-`--history-cache-only` warm-up run for AQS history.
- **SDWIS `OWNER_TYPE_CODE` ingest + UI chip.** SDWIS classifies each PWS by owner type (`L` local government, `M` mixed, `N` Native American, `P` private, `S` state government, `F` federal). Currently we don't ingest this field and the city-hub / state water-system tables can't tell readers whether a row is "City of Stockton" (municipal) vs "Stockton Verde Mobile Home Park" (private). Two pieces of work: (1) extend `pipeline/src/ingest/sdwis.py:WaterSystem` + `aggregate/build.py:UtilityAgg` + the `UtilitySummary` payload to carry an `owner_type` field; (2) surface it as a chip in the water-system table cell, e.g. MUNICIPAL / PRIVATE / DISTRICT, so readers can mentally bucket without inferring from the name.
- **Superfund / NPL site coverage — shipped (CA POC).** 117 entity pages (97 Final + 17 Deleted + 1 Withdrawn + 2 Proposed) at `/state/[state]/superfund/[slug]`, plus `SuperfundSection` rollups on state / county / city hubs. City-hub eligibility extended to "≥1 NPL site in the polygon" as a third qualifying condition. Source: `sems.envirofacts_site` + `sems.envirofacts_contaminants` via Envirofacts. Page template: [`page_templates.md`](page_templates.md) §8.

  Open follow-ups:
  - **`WaterLinkageSection`** — shipped on entity page (3-mile buffer; 49 of 117 CA NPL sites have ≥1 nearby groundwater PWS). Distance computed to served-place centroid since SDWIS doesn't expose wellhead lat/lon — methodology disclosure on the section.
  - **Listing-date enrichment — evaluated, shelved.** Probed Envirofacts SEMS tables, cumulis.epa.gov SiteProfile scraping (multi-tab + multi-pattern regex), and SEMS Public PDF reports. Envirofacts has no listing-date column. Cumulis prose coverage was ~25–60% on a sample (many profile pages have no NPL-mentioning sentences); reliable extraction would require parsing the 4–34 MB FOIA-15 / List-8R PDFs. Not worth the lift relative to the editorial payoff. Hero degrades gracefully without the date — the §8 entity page leads with status + location instead of "Listed YYYY — N years in cleanup." Revisit if (a) EPA publishes a flat dataset of `(epa_id, listing_date)` rows, or (b) the editorial value swings hard enough to justify PDF parsing.
  - **`PhaseTimeline` component** — depended on the shelved listing-date enrichment; deferred indefinitely.
  - **Superfund-driven flags** (`stalled_cleanup`, `recently_deleted`, `5yr_review_overdue`) — deferred until calibrated.
  - **Operator / PRP ↔ TRI cross-link** — V2; gated on PRP-name normalization.
