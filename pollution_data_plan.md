# Pollution Data Platform: Plan (Historical Design Playbook)

> **This is the original design playbook.** Read it for *why* decisions were made. For what the site is *now*, read the canonical docs:
>
> - [`site_architecture.md`](site_architecture.md) — routes, pipeline → page mapping, what's live (CA POC: 4,769 static pages across 5 page types).
> - [`page_templates.md`](page_templates.md) — per-template section breakdowns.
> - [`prose_strategy.md`](prose_strategy.md) — the no-LLM-in-POC, template-first stance.
> - [`anomaly_engine_design.md`](anomaly_engine_design.md) — flag taxonomy, thresholds, calibration.
>
> Where this plan and the canonical docs disagree, the canonical docs win. This document has been amended once (May 2026) to add "Source Resilience" + the equity-overlay rewrite, but is otherwise preserved as the pre-launch rationale.
>
> **Companion project to the crime trend site.** Reuses pipeline architecture, frontend stack, and page-template patterns from `../crime-trend-data/`. Methodology stance and anomaly engine diverge in specific, deliberate ways documented below.
>
> Cross-references to the crime site:
> - [`../crime-trend-data/crime_trend_plan.md`](../crime-trend-data/crime_trend_plan.md) — the design playbook this project descends from.
> - [`../crime-trend-data/site_architecture.md`](../crime-trend-data/site_architecture.md) — current state of the crime site (six cities live, 346 neighborhood pages, eight page types).
> - [`../crime-trend-data/page_templates.md`](../crime-trend-data/page_templates.md) — per-template structure mirrored here where applicable.
> - [`../crime-trend-data/llm_prose_notes.md`](../crime-trend-data/llm_prose_notes.md) — LLM prose pattern (Sonnet 4.6, fact-validated) — deferred for our POC; see `prose_strategy.md`.

## Positioning

Trend intelligence and narrative platform for environmental data, not a real-time AQI dashboard. The differentiation mirrors the crime site:

- Analytics + storytelling layer on top of public data.
- Methodological discipline (transparent caveats, well-defined pollutant pathways).
- Programmatic SEO at scale, but across **three stacked surfaces** rather than one (see below).
- Anomaly detection as encoded editorial judgment, retuned for environmental data shapes.
- **Prose-from-data first**, LLM only on high-leverage surfaces. The site's scale (50K+ pages) inverts the crime site's prose tradeoff: deterministic templating is the default, LLM is the exception. See "Prose Strategy at Scale" below.

Competitive position vs. existing tools:
- **AirNow** publishes current AQI; no historical narrative.
- **EJScreen** is technical, not consumer-facing; no storytelling.
- **IQAir** is commercial; paywalled history and proprietary sourcing.
- **EPA's facility-level tools** (TRI Explorer, ECHO, FLIGHT) are query interfaces, not narratives.

The moat is the same as crime: storytelling cadence, methodology transparency, programmatic SEO at scale.

## Why This Works

- Pollution data is widely available (free, federal, multi-decade history).
- High user intent across multiple search journeys (real estate, health, environmental justice, school choice, water safety).
- Weak competition in the **analytics + narrative layer** specifically.
- Strong programmatic SEO potential across three location anchors (entity, place, neighborhood).
- Pipeline + frontend stack from crime site is reusable with minimal modification.

## Federal Data Landscape

The big federal datasets, grouped by pollutant pathway, with programmatic-page potential:

| Dataset | Owner | Location unit | Approx US count | Search-by-name? | Strength |
|---|---|---|---|---|---|
| TRI (Toxics Release Inventory) | EPA | Facility (lat/lng) | ~25,000 | Yes | Annual, since 1987, ~800 chemicals. **Strongest single dataset.** |
| GHGRP | EPA | Facility | ~8,000 large emitters | Yes | Climate / GHG angle. |
| eGRID | EPA | Power plant | ~12,000 | Yes | Electricity emissions per kWh. |
| RCRA Info | EPA | Facility | ~50,000 handlers | Sometimes | Hazardous waste. |
| Superfund / NPL | EPA | Named site | ~1,300 | Yes | High name recognition. |
| Brownfields (ACRES) | EPA | Site | Many more | Sometimes | Smaller contaminated sites. |
| SDWIS | EPA | Public water system | ~150,000 | Yes | "Is the water safe in [my city]" intent. |
| ECHO | EPA | Regulated facility | Hundreds of thousands | Sometimes | Cross-cuts air / water / waste enforcement. |
| WQX / STORET | EPA | Sample site | Many | No | Surface water chemistry. |
| BEACON | EPA | Beach | ~6,000 | Yes | Recreational water quality + closures. |
| AirNow / AQS | EPA | Monitor (lat/lng) | ~5,000 | **No** (sparse) | Real-time + historical AQI; aggregates up to city / county. |
| AirToxScreen / NATA | EPA | Census tract | ~84,000 | No, rolls up | Modeled hazardous air pollutant exposure. |
| NEI (National Emissions Inventory) | EPA | Source category × geography | National + regional | Partially | Every 3 years, narrative-grade. |
| EJScreen | EPA | Block group | ~245,000 | No, rolls up | Pre-joined demographic + environmental indicators. |
| Pesticides (USGS NSP) | USGS | County | ~3,100 | Yes | Ag-county coverage where TRI / AQS go thin. |
| RadNet | EPA | Monitor | Sparse | No | Radiation. |
| CDC EPHT | CDC | County / tract | Varies | No | Health outcomes joined to exposure. |
| Lead surveillance | CDC + HUD + EPA | Varies | National | Sometimes | Composite "lead exposure" story. |
| USGS Water Data | USGS | Stream gauge | Many | No | Real-time water quantity + chemistry. |

**Strongest two for site theme, in order:**
1. **TRI.** Facility-level, decades of history, clear anomaly stories ("releases at this plant rose 4× in 2024"). Closest analog to crime data: discrete events, geocoded, programmatic by facility *and* by aggregated geography.
2. **SDWIS.** Drinking water violations per utility, with "is it safe" search intent that drives crime traffic. National coverage, methodologically clean.

A composite of TRI + AQS + SDWIS + EJScreen gives three pollutant pathways (air monitors, facility releases, drinking water) plus the equity overlay. Richer foundation than the crime site's single-source-per-city model.

## Source Resilience

Federal data sources are stable in legal status but not in delivery. The POC has already had to route around two real disruptions; the site's architecture treats source attrition as an operating condition, not an exception.

### EJScreen — EPA deprecated the public tool in 2025

EPA retired the public-facing EJScreen web tool and its prebuilt CSV exports in 2025. The underlying block-group tables that powered it are still maintained by the same EPA team that built EJAM (the open-source successor), published via the **USEPA-clone GitHub organization**. Specifically:
- `USEPA-clone/ejamdata` repo, `data/bgej.arrow` — block-group EJ disparity scores per environmental indicator.
- Same repo, raw indicator columns — block-group values for PM2.5, ozone, NO₂, diesel particulate, RSEI, lead-paint risk, and proximity-to-hazard counts.

The POC ingests `bgej.arrow` and aggregates to state / county / place by population-weighted mean (see [`pipeline/src/ingest/ejscreen.py`](pipeline/src/ingest/ejscreen.py)). The methodology page names this substitution explicitly — readers can verify the upstream file rather than trusting a pipeline-internal blob.

Implication for the equity overlay framing: see "Demographic juxtaposition: flips" below.

### Envirofacts — Bulk CSV is primary, API is fallback

EPA's Envirofacts REST API rate-limits aggressively under burst, with little visibility into the throttle thresholds. For TRI specifically (and most other Envirofacts-fronted datasets) the **annual bulk-CSV release is the primary ingest path**; the API is reserved for incremental updates and ad-hoc lookups. This inverts the obvious "API-first" instinct but matches EPA's own published guidance: bulk downloads are designed to scale, the API is designed for human use of forms.

Operational rules:
- Pull the annual bulk CSV at the start of each ingest run; cache it locally in `data/raw/`.
- Use the API only for the small set of records that change inter-release (re-statements, late filings).
- During Envirofacts outages, use the `--history-cache-only` flag and retry the live update on the next scheduled run, not immediately.

### Implications for site posture

- Every source is treated as potentially substitutable. The pipeline isolates each source behind a single `pipeline/src/ingest/<source>.py` module so swapping the upstream URL never touches downstream code.
- The methodology page documents the *source of record* per dataset, including any mirror or fallback in current use, so readers can reproduce the numbers without needing the pipeline.
- New source dependencies require a written fallback plan before they ship.

## Data Rights & Attribution

All data sources in scope are public-domain federal datasets. Reuse and redistribution rights are unrestricted; the operational rules are about API civility, not licensing.

### Legal status

- **Works of the United States Government** (17 USC §105) are not eligible for copyright in the US. Federal agency datasets (EPA, USGS, CDC, HUD, NOAA) are public domain by statute.
- **EPA's open-data policy** explicitly states that data on EPA websites are "freely available for use and redistribution." This covers TRI, AQS, AirNow, SDWIS, ECHO, NEI, NATA / AirToxScreen, EJScreen, GHGRP, eGRID, RCRA, Superfund, BEACON, and the rest.
- **USGS data** (water data, pesticide synthesis): same federal public-domain status.
- **CDC data** (EPHT, lead surveillance): same. Some health datasets apply small-cell suppression for privacy at the source; the published data is fully reusable as-is.
- **HUD data** (lead-based paint disclosure): same.

No licensing, no royalties, no commercial-use restrictions. Attribution is not legally required but is good practice for credibility and is the editorial norm.

### Operational rules (per-source)

These are API and rate-limit rules, not licensing. They mirror how the crime site handles DataSF, NYPD, OPD, etc.

- **Bulk CSV is the primary ingest path** for every Envirofacts-fronted dataset (TRI, GHGRP, RCRA, Superfund, ECHO, FRS). The REST API rate-limits aggressively under burst with little throttle visibility. APIs are reserved for incremental updates and ad-hoc lookups. See "Source Resilience" above for the rationale.
- **Register an app token** with each source where one is offered (EPA Socrata endpoints, AirNow API). Avoids unauthenticated rate limits.
- **Identify the User-Agent.** Use a descriptive UA string with a contact URL. Standard courtesy and helps debug if the source blocks traffic.
- **Respect rate limits.** AirNow specifically caps real-time queries; AQS bulk downloads are preferred for historical work.
- **Cache aggressively.** Re-ingest only when the source has actually updated (most are quarterly or annual). The pipeline supports a `--history-cache-only` mode for use during upstream outages.
- **AirNow attribution request.** AirNow asks for visible attribution and a link back when displaying real-time AQI. Not a license condition; honor it as standard practice.

### Attribution policy on the site

The crime site's pattern is to credit each source on the methodology page and in per-page footers. Same pattern here:

- **Methodology page.** Per-source block with: source name, originating agency, dataset URL, last-ingest timestamp, license / public-domain statement, known quality caveats. Mirrors the per-city block pattern in [`../crime-trend-data/page_templates.md`](../crime-trend-data/page_templates.md) for `/methodology`.
- **Page footers.** "Source: EPA TRI, retrieved {date}" or equivalent on every page that surfaces data from that source.
- **Linkback to original.** Every source mention links to the canonical EPA / USGS / CDC dataset page so readers can verify.
- **No source-laundering.** Do not relabel federal data as proprietary. The methodology page makes clear that the underlying observations are federal; what we add is normalization, anomaly detection, narrative, and presentation.

### What we do not do

- Do not claim copyright on the underlying federal data.
- Do not paywall federal data behind a login or subscription.
- Do not present aggregated federal data without sourcing back to the agency.
- Do not republish individual-level data that the source has redacted (rare in pollution data, but applies to any small-cell-suppressed CDC health endpoint).

### PurpleAir and other commercial sources: out of scope

Considered and dropped. Commercial / community-driven sources (PurpleAir, IQAir, etc.) introduce licensing, attribution, and redistribution constraints that compromise the "all federal, all public-domain" stance. The federal data alone is sufficient. Revisit only if a specific federal gap emerges that no federal source fills.

## Programmatic SEO Surfaces

The single biggest structural difference from the crime site. Crime has one programmatic surface (neighborhood, ~346 pages live). Pollution has three stacked, all geo-anchored, totaling 50,000+ pages on launch:

### Tier 1: Entity pages

One page per facility / utility / Superfund site. URL shape: `/facility/[state]/[slug]`, `/water/[state]/[utility-slug]`, `/superfund/[slug]`. Search intent is people Googling the name of the plant, refinery, or utility near them. **No analog on the crime site** because crime has no entity dimension.

Approximate page count: ~25,000 (TRI) + ~12,000 (power plants) + ~150,000 (water systems) + ~1,300 (Superfund) = north of 180,000 entity pages, before filtering for activity.

In practice, filter aggressively to active / non-zero / recent data. Realistic launch size is probably tens of thousands.

### Tier 2: Place pages

City and county aggregations of all entity-level data, plus AQS monitor data interpolated up. URL shape: `/city/[state]/[slug]`, `/county/[state]/[slug]`. Direct analog of the crime site's `/city/[slug]`. Search intent: "air quality in [city]", "water quality in [county]".

Approximate page count: ~3,100 county pages + ~1,000–10,000 meaningful city pages.

### Tier 3: Neighborhood pages

Same pattern as crime site, fed by NATA + EJScreen rolled up to neighborhood polygons. URL shape: `/neighborhood/[city]/[slug]`. Only works in cities with curated polygons, additive on top of Tier 1 and Tier 2.

This tier is where the crime site's existing template work transfers most directly. Neighborhood polygons are already curated for the six live crime cities; reusing those gives a head start.

## Methodology Divergence from Crime Site

Three places where the crime site's stance does not transfer, with explicit reasoning.

### Demographic juxtaposition: flips

The crime site **refuses** to overlay race or income with crime data. Reasons documented in [`../crime-trend-data/crime_trend_plan.md`](../crime-trend-data/crime_trend_plan.md) under "Demographic Stance".

For pollution, the **opposite** is the legitimate, well-documented framing. Environmental justice analysis explicitly correlates pollution exposure with race and income. EPA itself publishes EJScreen (now via the USEPA-clone mirror — see "Source Resilience") for exactly this purpose. Refusing the overlay would *undermine* the value of the site.

The methodology page must state this clearly: the demographic-juxtaposition rule is product-specific, not a personal voice rule. For pollution, equity overlay is encouraged and methodologically defensible. The crime site's reasons (correlation-as-causation, reporting bias, ecological fallacy) do not apply the same way to pollution exposure data, which is measured at the receptor, not police-reported.

#### Equity overlay composition (post-EJScreen-deprecation)

With EPA's public EJScreen tool gone, the site is now a primary-source compositor for the equity overlay rather than a re-presenter of EPA-blessed indexes. The overlay composes three layers, in order of prominence on the page:

1. **Demographic context (lead).** Population total + share low-income / people of color / under 5 / over 64, sourced from Census ACS at the geography. This is the "who lives here" surface — the most legible to readers and the most defensible methodologically. Always rendered.
2. **National percentile, per environmental indicator.** Each indicator (PM2.5, ozone, NO₂, diesel particulate, RSEI toxic releases, lead-paint risk, NPL/RMP/TSDF/NPDES proximity) is ranked against the national distribution of all US block groups, population-weighted. Rendered as "in the highest 10% nationally" — the framing EPA's original EJScreen used and the framing readers immediately understand. Computed by the pipeline rather than read from a deprecated EPA file.
3. **EJ disparity score, per indicator (statistical).** EPA's newer disparity-score metric, centered on 100 (population-weighted reference burden), surfaced as a secondary table for readers who want the formal stat. The methodology page over-explains the framing: 100 = reference, 150+ = notable, 200+ = severe. This is what `bgej.arrow` ships from the USEPA-clone today, and what's currently rendered until the percentile layer ships.

Per-page treatment: demographics in the hero of the equity section; percentile table mid-section as the "headline" environmental statistic; disparity-score table at the bottom as supplementary detail with the methodology link adjacent.

This layering replaces the plan's earlier implication of "use EJScreen percentiles directly." We now show *more* than EJScreen ever did, with explicit attribution per layer.

### Anomaly engine: rewrite, do not port

The crime site's six flag types (spike, drop, rare, streak break, sustained shift, zero event) are tuned for crime-data-shaped behavior: gradual sustained shifts, sporadic rare events, weak seasonality. Pollution data has different shapes:

- **Wildfire smoke episodes** (sharp, regional, irregular, dominate West Coast records).
- **Long slow declines from regulation** (Clean Air Act story, decades of progress).
- **Winter inversions** (predictable seasonal spikes, not anomalies).
- **Facility-level emission shifts** (single-event, year-over-year, clean signal in TRI).

The flag taxonomy needs a rewrite. Likely candidates:
- **Smoke day count** as a primary metric, not a flag.
- **Long-arc decline / improvement** (e.g., "ozone here is half what it was in 1995").
- **Facility-release shift** (year-over-year change in TRI releases per chemical per facility).
- **Violation event** (SDWIS Tier 1 violation, ECHO enforcement action).
- **Exceedance day count** (days above NAAQS thresholds).

Some crime-site flags may still apply at the place-page level (e.g., sustained shift on annual ozone), but the engine is not portable as-is.

### Geographic granularity: monitor sparsity

Crime data is point data with lat/lng on every incident, supporting per-neighborhood programmatic pages. AQS air monitors are sparse (3 to 5 per city). This is the only dataset where the crime site's geography model breaks. Mitigations:

1. Aggregate AQS up to city / county / metro, present at Tier 2.
2. Use AirToxScreen / NATA tract-level modeled data for hyperlocal air toxics (Tier 3).
3. Be transparent about monitor placement on the methodology page; do not interpolate beyond what's defensible.

TRI, SDWIS, Superfund, GHGRP, and other facility-level datasets do **not** have this problem. They are *more* location-anchored than crime data.

## Reuse from Crime Site

Direct lift, with light adaptation:

| Layer | Reuse | Adaptation |
|---|---|---|
| Pipeline shape (ingest → normalize → spatial → aggregate → flags → forecast → prose → publish) | Yes | Per-source ingest modules; flag engine rewritten. |
| Frontend stack (Next.js App Router, SSG, `dynamicParams = false`) | Yes | Unchanged. |
| Page template patterns (city hub, neighborhood, archive, year in review) | Yes | Add new "facility" / "utility" page type for entity tier. |
| Components (`Sparkline`, `CityMap`, `MultiYearTrends`, `ForecastChart`, `SubTrends`, `Stack`, `Crumbs`, `Brand`) | Yes | Bucket palette redefined for pollutants. |
| LLM prose layer (Sonnet 4.6, fact-validated, voice rules) | Partially | At pollution scale, template-first. LLM reserved for high-leverage surfaces (top-traffic place pages, year-in-review). See "Prose Strategy at Scale". |
| City registry pattern (`cities.py`, `cities.json`) | Yes | Extends to facility / utility registries at Tier 1. |
| Methodology page structure | Yes | Per-pollutant rather than per-bucket; per-source caveats; equity overlay section. |
| Anomaly cards, TL;DR sections, archive snapshots, year-in-review | Yes | Same patterns; different signals feeding them. |
| Backtest scorecard pattern | Yes | Where forecasts apply (e.g., annual ozone, PM2.5 trend). |

Net-new work specific to pollution:
- Source ingest modules (TRI, AQS, SDWIS, NATA, EJScreen, GHGRP, ECHO, others).
- Pollutant taxonomy normalization (analog to UCR/NIBRS bucket map but messier; chemicals × facilities × pathways).
- Three-tier route map and chrome (entity / place / neighborhood).
- Equity overlay component.
- Smoke-episode detection (regional, not per-place).

## Crime Taxonomy Analog: Pollutant Categorization

Crime site uses 10 UCR Part 1 / NIBRS Group A buckets as cross-city common denominators. Pollution needs a parallel taxonomy. Likely top-level categorization:

- **Criteria air pollutants** (NAAQS): PM2.5, PM10, ozone, NO2, SO2, CO, lead.
- **Hazardous air pollutants** (HAPs): ~187 chemicals tracked under Clean Air Act §112; rolled up by health endpoint (carcinogens, neurotoxins, respiratory irritants).
- **Greenhouse gases**: CO2, methane, N2O, HFCs.
- **Drinking water contaminants**: lead, nitrates, arsenic, disinfection byproducts, microbial.
- **Toxic releases (TRI)**: aggregated by chemical group (carcinogens, persistent bioaccumulative toxins, dioxins).
- **Pesticides** (where covered): grouped by active ingredient class.

Per-pollutant color palette and chart conventions analogous to per-bucket palette on crime site.

## Operational Cadence

Mirror crime site cadence:
- **Daily ingest** where source supports (AirNow, AQS recent, USGS Water Data).
- **Monthly publish** (full re-aggregate → score → forecast → prose → publish).
- **Annual rollup** for year-in-review, especially for TRI / NEI / GHGRP which are annual-native.
- Update cadences vary widely by source (TRI is annual, AirNow is hourly, NEI is triennial); per-source documentation on the methodology page.

## Prose Strategy at Scale

The crime site has 346 pages and uses LLM prose generously (TL;DRs on every neighborhood, headlines + summaries on every city, year-in-review story bodies). At 50,000+ pages, that pattern breaks on cost.

### Cost reality check

Rough math, monthly publish, conservative assumptions:
- Crime site: ~400 LLM generations per publish × $0.005 average ≈ $2 per run, single-digit dollars per month.
- Pollution at this scale: 50,000 pages × ~5 generations each × $0.005 = ~$1,250 per publish. Annualized: ~$15K. With Sonnet 4.6 at full quality: 3–5× that.

That's not catastrophic, but it's a budget item that buys you marginal copy variety on long-tail pages no one reads. Wrong place to spend.

### Architecture: template-first

Default for every page: deterministic prose generated from structured data. The crime site already has the pattern in [`../crime-trend-data/frontend/src/lib/prose.ts`](../crime-trend-data/frontend/src/lib/prose.ts) and [`../crime-trend-data/pipeline/src/prose/`](../crime-trend-data/pipeline/src/prose/). Lift the shape, expand the library.

Components:

1. **Sentence template library.** Each editorial situation has 3–10 phrasings, picked deterministically by data shape (magnitude bucket, direction, recency). Avoids the "string concatenation" feel without an LLM in the loop. Example: a long-arc improvement gets one of "{pollutant} levels in {place} have fallen {pct}% since {baseline_year}", "Air here is {ratio}× cleaner than it was in {baseline_year} for {pollutant}", "Since {baseline_year}, {pollutant} concentrations have dropped from {old_value} to {new_value}."

2. **Snippet system keyed on data patterns.** Named functions like `longArcImprovement()`, `facilityReleaseSurge()`, `nawaqsExceedanceCluster()`, `violationStreak()` each return one of N pre-written variants conditioned on inputs. Editorial work is up-front, not per-page.

3. **Numeric + magnitude language tables.** "+12%" → "rose modestly"; "+250%" → "more than tripled". Same pattern crime site uses for sigma-to-language.

4. **Composition rules.** Each page assembles 3–5 snippets into a TL;DR-shaped paragraph using deterministic ordering rules (worst signal first, then context, then trend). No LLM in this assembly.

This handles ~95% of the page surface deterministically.

### Where LLM stays valuable

LLM use is **gated by tier and traffic**, not blanket per-page:

- **Top-traffic place pages** (large counties, major cities): LLM-polished briefing headline + summary, monthly. Probably ~500–1,000 pages eligible. Cost: $5–10/month with Sonnet, less with Haiku.
- **Year-in-review** at place tier (annual, not monthly). High editorial value, low frequency. Same as crime site.
- **Featured / editorial pages** (handpicked, not algorithmic). Maybe ~50 per year.

Long-tail entity pages (small TRI facilities, small water utilities), county pages with low population, neighborhood pages outside the top cities: pure templates. No LLM.

### Cost-minimizing patterns regardless of tier

- **Prompt caching.** System prompt + style guide cached, only diff is the structured input. ~90% input-token savings on cached portion.
- **Batch API.** Anthropic batch is 50% cheaper than synchronous, fine for monthly publish (no real-time requirement).
- **Haiku 4.5 by default.** Reserve Sonnet 4.6 for the smallest set of pages where tone matters most.
- **Output caching by input hash.** Re-publish runs with identical structured input don't re-bill. Crime site already does this; lift the pattern.
- **Diff-gated regeneration.** Compare structured input to prior month; skip generation if no material change. Many pages will be quiet most months.
- **LLM as polish, not generator.** For the pages that do get LLM, feed the templated draft as input and ask for light rewriting. Faster, cheaper, easier to fact-validate against the input.

### Validation still required

For any LLM-generated text, the crime site's facts-validator pattern (every numeric + entity name in output must appear verbatim in structured input, else drop and fall back to template) is non-negotiable. At this scale, even rare hallucinations across 1,000 pages are a credibility risk. Lift the validator from [`../crime-trend-data/pipeline/src/prose/validators.py`](../crime-trend-data/pipeline/src/prose/validators.py) and extend.

### What this means for the build

The crime site grew template prose first and added LLM later when the scale was small enough to afford it. Pollution should grow template prose first and consider LLM only after launch, only on the highest-leverage pages, and only with cost monitoring in place. The template library is the load-bearing engineering investment.

## What's Excluded (Deliberately)

To establish parallel discipline to the crime site:

- **Real-time alerting / push notifications.** Not a dashboard; not competing with AirNow.
- **Health diagnoses or medical advice.** Reference exposure thresholds, do not interpret for individuals.
- **Per-individual exposure modeling.** Aggregate, not personal.
- **Speculative attribution to specific facilities** beyond what TRI / ECHO publishes directly. No "this facility caused that cancer cluster" claims.
- **Real-estate value framing.** Same reason crime site avoids attractions / tourism: tonal whiplash, decay, hallucination risk.
- **New programmatic page *types* beyond the three tiers** without explicit revisit.

## Open Questions

1. **Geographic launch scope.** National launch (~3,100 counties) is plausible from day one because federal data is national. Crime site went city-by-city; pollution likely starts national at Tier 2 (counties) and Tier 1 (facilities), with Tier 3 (neighborhoods) gated by polygon availability.
2. **Naming / branding.** Companion to Public Analyst.ai, or distinct brand? If companion, what subdomain or routing? If distinct, separate domain entirely.
3. ~~**Equity overlay treatment.** EJScreen is pre-joined; do we surface its scores directly, or compute our own from underlying inputs for transparency?~~ **Resolved 2026-05.** EPA deprecated the public EJScreen tool in 2025. The overlay is now demographic context (lead) + national percentiles computed in-pipeline (mid) + EJ disparity scores from `USEPA-clone/ejamdata` (tail). See "Equity overlay composition" above.
4. **Pollutant taxonomy depth.** How many top-level pollutant categories do we present, and at what aggregation level? Risk of overwhelming readers with chemistry.
5. **Forecasting scope.** Prophet works on AQS time series. Forecasting TRI releases is editorially fraught (can't predict facility behavior). Which dimensions to forecast?
6. **Interaction with crime site.** Do users moving between sites get a unified experience, or are they wholly separate brands?

## Status

**California POC live (2026-05).** See [`site_architecture.md`](site_architecture.md) for the canonical state of the site. Quick reference:

- Pipeline ingests TRI / SDWIS / GHGRP / EJScreen-clone / ACS / TIGER for CA.
- Frontend renders five programmatic page types under `/state/[state]/...` (state hub, county, **city hub** [place-anchored], TRI facility, **water utility** [PWS entity]) plus home and methodology.
- Anomaly engine ships four flag types (`long_arc_shift`, `release_shift`, `violation_event`, `ghg_step`) calibrated against CA data — see [`anomaly_engine_design.md`](anomaly_engine_design.md).
- Equity overlay = ACS demographics (lead) + EJ disparity scores (tail). National-percentile layer pending raw-indicator ingest.
- No LLM prose layer (deterministic templates only — see [`prose_strategy.md`](prose_strategy.md)). No AQS / NATA. No archive / year-in-review yet.

## Next Steps (Rough Priority)

1. **MVP scope decision**: which sources, which tiers, which geography for launch. Recommend starting with TRI (entity tier) + AQS aggregated to county (place tier), as the two strongest single sources, before broadening.
2. **Methodology page draft**: per crime site, the most important non-data artifact for E-E-A-T. Pollutant pathway definitions, source-by-source caveats, equity overlay stance, demographic juxtaposition reasoning (the inversion from crime site).
3. **Pollutant taxonomy**: parallel to UCR/NIBRS bucket map. Top-level categorization, what's in / out, why.
4. **Source ingest priority order**: TRI first (richest single source), AQS second, SDWIS third, EJScreen overlay fourth.
5. **Three-tier route map**: entity / place / neighborhood, with per-tier template definition.
6. **Anomaly engine v1**: smoke days, long-arc decline, facility-release shift, violation events. Calibration loop after first ingest.
