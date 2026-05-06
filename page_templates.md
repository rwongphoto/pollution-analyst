# Pollution Analyst.ai — Page Templates

Per-template structural reference. For the route map, pipeline data flow, and high-level positioning see [`site_architecture.md`](site_architecture.md).

Every page is a server component that reads JSON from `data/published/` via [`frontend/src/lib/data.ts`](frontend/src/lib/data.ts) and renders statically. No client-side fetches for page content. All dynamic routes use `dynamicParams = false`.

Shared chrome on every page:
- [`SiteHeader`](frontend/src/components/site/SiteHeader.tsx) — five nav items: States · Counties · Cities · Facilities · Methodology.
- [`SiteFooter`](frontend/src/components/site/SiteFooter.tsx) — briefing label + brand block.
- [`Crumbs`](frontend/src/components/site/Crumbs.tsx) — breadcrumb trail; current page is unlinked.
- [`Brand`](frontend/src/components/site/Brand.tsx) — logotype + wordmark.

Shared section component for anomaly engine output:
- [`NotableSignals`](frontend/src/components/site/AnomalyCard.tsx) — wraps `<AnomalyCard>` instances; severity-weighted sort; rendered cap of 4; explicit empty-state line so absence-of-signal stays visible.

---

## 1. Home — `/`

**File:** [`frontend/src/app/page.tsx`](frontend/src/app/page.tsx)
**Payload:** `home.json`

Cross-state entry point. Hero + three featured entity cards (drawn from facility / county / utility flag-aware picks) + four product principles + an EJScreen-tinted equity band + CTAs.

| Section | Component / inline | What it shows |
|---|---|---|
| `HomeHero` | inline | Eyebrow, H1, lede; aside with this-publish totals (facilities, utilities, counties, chemicals). |
| `SurfacesSection` | inline | Three programmatic surfaces tile: Tier 1 entity, Tier 2 place, Tier 3 neighborhood (deferred). |
| `PrinciplesSection` | inline | Four product principles: trend not totals · equity in plain sight · federal-only sources · methodology open. |
| `FeaturedSection` | inline + `Sparkline` | Three featured entity cards. Headline prefers a flag-derived summary when one exists, else the existing template. Each card routes to its entity / place page via `KIND_HREF`. |
| `EquityBand` | inline | Editorial design block — Harris County EJScreen showcase in static form. Anchored by a CTA into `/methodology#equity`. |
| `HomeCTA` | inline | Live CA links: Kern County, Chevron Richmond Refinery, Stockton city hub. |

`KIND_HREF` map:
- `facility` → `/state/[state]/facility/[slug]`
- `water` → `/state/[state]/water/[slug]` (the PWS entity)
- `city` → `/state/[state]/city/[slug]` (the place hub)
- `county` → `/state/[state]/county/[slug]`

---

## 2. Methodology — `/methodology`

**File:** [`frontend/src/app/methodology/page.tsx`](frontend/src/app/methodology/page.tsx)
**Payload:** none — fully static prose. Future per-source caveats may load from JSON when ingest provenance becomes payload-driven.

Sections (top-down):
1. **Pollutant taxonomy** — five top-level categories (criteria air, HAPs, GHG, drinking water, TRI).
2. **Anomaly engine** — four flag types with formal triggers, calibration commitment, deferred flags. ID `#anomaly-engine`.
3. **Equity overlay** — the deliberate inversion from the crime site. ID `#equity`. **Stale relative to the plan's three-layer rewrite — open follow-up.**
4. **Exclusions** — what we deliberately don't do.
5. **Sources** — federal-only attestation + per-source detail (TRI, SDWIS, EJScreen, data rights).

JSON-LD: `Organization` + `BreadcrumbList` + `Article` for SEO.

---

## 3. State Hub — `/state/[state]`

**File:** [`frontend/src/app/state/[state]/page.tsx`](frontend/src/app/state/[state]/page.tsx)
**Payload:** `state/<slug>.json` (`StatePagePayload`)

`generateStaticParams` enumerates every published state file. Per-state hub aggregating TRI / GHG / SDWIS plus equity at state scale, with full county directory for SEO.

| Section | Component | What it shows |
|---|---|---|
| `StateHero` | inline + `HeroChart` | Eyebrow, H1, lede. Headline pathway hero chart showing the lead pollutant's multi-decade history. Stats: facilities tracked · utilities tracked · counties with data · YoY · long-arc since baseline. |
| `NotableSignals` | shared | State-level long-arc flags. CA shows 0 by current threshold (correct — billion-lb totals don't move ≥50%). |
| `PathwaysSection` | inline + `Sparkline` | One tile per pathway (TRI air / water / land + GHG): label, current, YoY, long-arc, sparkline, deterministic prose. |
| `CountiesSection` | inline | Top-10 counties table: name, population, facilities, total releases, YoY, top chemical. Each name links to `/state/[state]/county/[slug]`. |
| `FacilitiesSection` | inline | Top facilities table: name, city, top chemical, total releases, YoY. Each links to `/state/[state]/facility/[slug]`. |
| `UtilitiesSection` | inline | Sorted to surface utilities serving the most people that still have an unresolved health-based violation. Compliant systems fall to the bottom. Each links to `/state/[state]/water/[slug]`. |
| `EquitySection` | inline + `EquityStub` | ACS demographics + EJ disparity scores at state level. Note that state percentiles wash out — drill down to county for sharper signal. |
| `CountyDirectory` | inline | Alphabetical link grid of every county with TRI data. SEO surface for crawlable internal linking. |
| `SourcesFooter` | inline | Per-source attribution + retrieval date. |

---

## 4. County — `/state/[state]/county/[slug]`

**File:** [`frontend/src/app/state/[state]/county/[slug]/page.tsx`](frontend/src/app/state/[state]/county/[slug]/page.tsx)
**Payload:** `county/<state>/<slug>.json` (`CountyPagePayload`)

| Section | Component | What it shows |
|---|---|---|
| `CountyHero` | inline + `HeroChart` | Eyebrow, H1, lede with facility count + lead-pathway YoY + long-arc. |
| `NotableSignals` | shared | County long-arc flags + county-level `ghg_step`. |
| `PathwaysSection` | inline + `Sparkline` | Per-pathway tiles (TRI air/water/land + GHG county-share). |
| `FacilitiesSection` | inline | Top-10 in-county facilities table. Links to facility entity pages. |
| `UtilitiesSection` | inline | Public water utilities serving the county (when SDWIS county join has resolved). Links to `/state/[state]/water/[slug]`. |
| `EquitySection` | inline + `EquityStub` | ACS county demographics + EJ disparity scores aggregated across county block groups. |
| `RelatedPlaces` | shared | 5 pollution-profile peer counties + 1 deliberate contrast (similar scale, opposite EJ band). Picker lives in `pipeline/src/publish/site.py:pick_related_counties`. |
| `SourcesFooter` | inline | Per-source attribution + retrieval. |

---

## 5. City Hub — `/state/[state]/city/[slug]`

**File:** [`frontend/src/app/state/[state]/city/[slug]/page.tsx`](frontend/src/app/state/[state]/city/[slug]/page.tsx)
**Payload:** `city/<state>/<slug>.json` (`CityHubPayload`)

The Tier-2 place-anchored page. **Distinct from the water utility entity page** at `/water/[slug]`: a city is a place, a PWS is a regulated entity. A PWS can serve multiple cities; a city can be served by multiple PWSes.

Pipeline build: TRI facilities are point-in-polygon-tested against TIGER 2020 place polygons (`spatial.places.assign_facilities_to_places`). Utilities are matched by SDWIS `city_name` → place name.

| Section | Component | What it shows |
|---|---|---|
| `CityHero` | inline + `HeroChart` | Eyebrow, H1 (`{place}, {state}`), lede with in-city facility count + utilities-serving count + YoY/long-arc when applicable. Optional in-city release history chart. |
| `NotableSignals` | shared | City-level flag detection deferred to v2 (same data shape as county); empty-state line renders today. |
| `PathwaysSection` | inline + `Sparkline` | TRI air/water/land tiles (current-year only — per-medium per-place history not reconstructed) + GHG county-share. |
| `FacilitiesSection` | inline | In-city TRI facilities table. Hidden when zero facilities are inside the polygon. |
| `WaterSection` | inline | Compliance-posture lede + 4-stat strip + utilities-serving table linking each row to `/state/[state]/water/[slug]`. Footer note: PWS is the regulated entity, not the city. |
| `EquitySection` | inline + `EquityStub` | ACS place demographics + EJ disparity scores aggregated across the city's block groups. |
| `RelatedPlaces` | shared | 4 same-county sibling cities + 1 statewide profile peer + 1 deliberate contrast. Same-county weighting prevents irrelevant matches (Lodi from Stockton, not Fontana). Picker: `pick_related_cities`. |
| `SourcesFooter` | inline | TRI + SDWIS attribution. |

Eligibility for a city hub: place must have ≥1 TRI facility OR ≥1 utility serving. Places with neither don't get a programmatic page.

---

## 6. Facility (TRI entity) — `/state/[state]/facility/[slug]`

**File:** [`frontend/src/app/state/[state]/facility/[slug]/page.tsx`](frontend/src/app/state/[state]/facility/[slug]/page.tsx)
**Payload:** `facility/<state>/<slug>.json` (`FacilityPagePayload`)

The Tier-1 facility entity page. Per-chemical detail is the load-bearing content here.

| Section | Component | What it shows |
|---|---|---|
| `FacilityHero` | inline + `HeroChart` + `MediaSplitBar` | Eyebrow, H1 (facility name), lede with total releases + YoY + long-arc. Aside: per-medium air/water/land breakdown, chemical count, media split bar. Hero chart is facility-total history. |
| `NotableSignals` | shared | Facility-total long-arc + per-chemical long-arc (top 2) + release_shift cards (capped 3 in pipeline, 4 in render). |
| `ChemicalsSection` | inline + `Sparkline` | One tile per top chemical: category chip (carcinogen / PBT / neurotoxin / respiratory / general), CAS, total pounds, YoY, sparkline, long-arc prose. |
| `EquitySection` | inline + `EquityStub` | County-as-proxy equity overlay (3-mile-buffer aggregation deferred). |
| `SourceFooter` | inline | TRI attribution + "what this is not" rider. |

---

## 7. Water utility (SDWIS entity) — `/state/[state]/water/[slug]`

**File:** [`frontend/src/app/state/[state]/water/[slug]/page.tsx`](frontend/src/app/state/[state]/water/[slug]/page.tsx)
**Payload:** `water/<state>/<slug>.json` (`WaterUtilityPayload`)

The Tier-1 PWS entity page. Compliance posture, MCL detail, EPA SDWIS deep-link. Renamed from `/city/[slug]` during the city-hub migration; the route name now matches the unit of analysis.

Slug derivation: `utility_city_slug()` strips redundant "City Of"/"Town Of" prefixes from the PWS name; falls back to PWSID when the cleaned name is too short.

| Section | Component | What it shows |
|---|---|---|
| `WaterHero` | inline + `HeroChart` | Eyebrow, H1 (`{city} Water Quality` derived from SDWIS `city_name`), lede with PWS name + PWSID + population served + 5-year violation tally. Aside: 5-year stat strip. Hero chart is annual violation count history. CTA to EPA SDWIS deep-link. |
| `NotableSignals` | shared | `violation_event` cards: unresolved > health_based_recent (1yr) > health_based_recent5y. EPA SDWIS link attached per card. |
| `TopContaminantsSection` | inline | Bar list of top contaminants by citation count. |
| `ViolationsSection` | inline | Anomaly-card-styled list of every violation in the analysis window: severity chip, year, rule, description, contaminant code. Unresolved chip when applicable. |
| `EquitySection` | inline + `EquityStub` | Three-tier preference: Place (city) → SDWIS county → state-level fallback. Whichever resolves first gets rendered. |
| `SourceFooter` | inline | SDWIS attribution + "what this is not" rider (compliance against MCLs ≠ tap-water concentrations). |

---

## Component Reference

Reusable components in [`frontend/src/components/site/`](frontend/src/components/site/):

| Component | Used by | Notes |
|---|---|---|
| `Sparkline` | Home, State, County, City, Facility, AnomalyCard | 24-year inline SVG path. Per-pathway color. |
| `HeroChart` | State, County, City, Facility, Water | Multi-year bar/line chart with per-medium media-split bar variant on Facility. |
| `MediaSplitBar` | Facility | Stacked bar showing air/water/land split for the most recent year. |
| `AnomalyCard` | Inside `NotableSignals` | One card per `Flag`. Severity → spike/drop/rare CSS variant. Includes optional sparkline + external link. |
| `NotableSignals` | All four templates | Section wrapper: severity-weighted sort, render cap 4, explicit empty-state. |
| `RelatedPlaces` | County, City | 6-card cross-link grid: 5 pollution-profile peers + 1 deliberate contrast (same scale, opposite EJ band). Selection happens at publish time; the contrast slot is the editorial point — surfaces the wealth-pollution gap rather than echo-chamber navigation. |
| `EquityStub` | All four templates (fallback) | Renders when `isEquityStub(equity)` returns true — i.e., demographics + disparity both empty. |
| `Crumbs` | All non-home pages | Breadcrumbs. Current page is unlinked. |
| `SiteHeader` / `SiteFooter` | All pages | Chrome with five nav items (States · Counties · Cities · Facilities · Methodology). |
| `Brand` | Header | Logotype + wordmark. |
| `Ic` (`icons.tsx`) | All | Single-file inline SVG icon set (`Ic.arrow`, `Ic.trend`, `Ic.shield`, `Ic.layers`, `Ic.doc`). |

## Prose Layer Per Page

Per [`prose_strategy.md`](prose_strategy.md), all customer-facing prose is template-rendered today. No LLM is in the loop.

| Page | Template-driven (everything today) | Future LLM seam |
|---|---|---|
| Home | Hero, principles, featured headlines, equity band, CTAs | Top-traffic place-page hero polish |
| State | Hero, pathways, all tables, equity narrative, anomaly cards | Year-in-review story bodies (deferred) |
| County | Hero, pathways, tables, equity, anomaly cards | High-traffic counties only |
| City hub | Hero, pathways, tables, water posture, equity | High-traffic cities only |
| Facility | Hero, chemicals, equity, anomaly cards | None foreseen — entity content is structurally complete |
| Water utility | Hero, contaminants, violations, equity, anomaly cards | None foreseen |
| Methodology | All static prose | None foreseen — voice consistency / cite-ability matter here |

When the LLM enters, the facts-validator pattern (lift from the crime site's [`pipeline/src/prose/validators.py`](../crime-trend-data/pipeline/src/prose/validators.py)) is non-negotiable. Every numeric and entity name in LLM output must appear verbatim in structured input, else drop and fall back to template.
