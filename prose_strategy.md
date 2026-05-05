# Prose Strategy — POC Stance

> Companion to `pollution_data_plan.md` §"Prose Strategy at Scale". Captures the in-effect rule for the California POC and the conditions under which an LLM enters.

## In effect today: deterministic templates only

Every line of customer-facing prose on the site is rendered from structured payload via [`frontend/src/lib/prose.ts`](frontend/src/lib/prose.ts) — magnitude language, long-arc framing, severity labels, disparity readings, formatting helpers. No LLM is in the loop, no LLM has ever been in the loop, and the publish step does not call any model.

The site is currently four programmatic surfaces (state / county / facility / water utility) for California only — well under a thousand pages. The crime site at six cities ships ~400 pages and uses LLM prose generously. We could afford the same here at POC scale. We're choosing not to. Two reasons:

1. **The site is going to grow into a 50K+ page surface as states beyond CA come online.** Building a template-first habit at hundreds-of-pages scale is what makes ten-thousands-of-pages scale tractable. Bolting on LLM prose now and ripping it out at scale would be the more painful path.
2. **The plan section "Prose Strategy at Scale" already commits to template-first.** This doc is the operationalization of that, not a new decision.

## What the templates cover

Today's library handles, deterministically:

- **Magnitude language.** `+12%` → "rose modestly"; `+250%` → "more than doubled"; `±<5%` → "held roughly steady". See `magnitudeLanguage()`.
- **Long-arc framing.** "{pollutant} concentrations have fallen 42% since {baseline_year}" / "more than halved since" / "roughly unchanged from". See `longArcLanguage()`.
- **Severity labels.** SDWIS violation severity → chip class + readable label.
- **Equity readings.** EJ disparity score → "well above the reference burden" / "near the reference" / etc.
- **Number formatting.** Pounds → "1.2M lb" / "240k lb"; percent-signed; population formatting.

This covers the entire body of every facility, county, water-utility, and state page that ships today. Hero ledes, pathway-tile descriptions, facility breakdowns, equity narrative bullets — all template-rendered.

## Where the seams will be when an LLM enters

Eventually, three surfaces are likely candidates. Each is gated by tier and traffic, not blanket per-page:

1. **High-traffic place pages — county / state hero summaries.** Top counties by population (LA, Cook, Harris, Maricopa…) and large-state hubs (CA, TX, FL, NY) get LLM-polished hero summaries instead of pure templates. Cap probably ~1,000 pages eligible. Gated by traffic data, not editorial discretion.
2. **Year-in-review narratives.** Annual rollup per state, modeled on the crime site's seven-chapter pattern. Low frequency, high editorial value. The right place to spend tone budget.
3. **Featured / editorial pages.** Handpicked stories — a Cancer Alley investigation, a Flint-style water-quality deep-dive — where narrative voice is the entire point. Maybe ~50/year.

Long-tail entity pages (small TRI facilities with quiet histories, small water systems with no violations), county pages with low population, neighborhood pages outside major metros — pure templates, indefinitely.

## What stays deterministic regardless

Even after LLM enters, these are template territory by rule:

- **Flag chips, labels, and badge text** ("SUSTAINED DROP · BENZENE", "HEALTH-BASED · NITRATE").
- **All numeric callouts** (% change, lb / kg, ppb, percentile values).
- **Methodology page.** Voice consistency over variety — readers cite this page, regeneration must not redrift it.
- **Source attribution lines.** "Source: EPA TRI, retrieved {date}" — never paraphrased.
- **Archive headline / excerpt fields** (when archive ships) — frozen at publish time, never regenerated.

## When the LLM enters, the rules are

These mirror the crime site's pattern verbatim — well-validated, no need to re-invent.

- **Sonnet 4.6 by default; Haiku 4.5 for cost-sensitive tiers.** Reserve Sonnet for the smallest set of pages where tone matters most.
- **Prompt caching.** System prompt (style guide + voice rules + examples) cached. Per-page incremental cost is structured input + output only.
- **Batch API where latency permits.** 50% cheaper than synchronous; fine for monthly publish.
- **Diff-gated regeneration.** Compare structured input to prior month; skip generation if no material change. Most pages will be quiet most months.
- **Output caching by input hash.** Re-runs with identical structured input don't re-bill.
- **Facts validator.** Every numeric and entity name in LLM output must appear verbatim in structured input; otherwise drop and fall back to template. Lift the validator from the crime site's [`pipeline/src/prose/validators.py`](../crime-trend-data/pipeline/src/prose/validators.py). Non-negotiable.
- **LLM as polish, not generator.** Feed the templated draft as input and ask for light rewriting. Faster, cheaper, easier to fact-validate.
- **Voice rules baked into the system prompt:** plain English, lead with the human-readable change, no σ / z notation in customer copy, no specific ethnic groups in equity narrative, no trailing periods on headers.

## Status

Deferred. Revisit when (a) the site is live in five-plus states, (b) the anomaly engine ships and there are flags worth narrating across many pages, or (c) the template library starts producing visibly repetitive copy on high-traffic pages. Until any of those, the template library is the load-bearing investment.
