# Anomaly Engine v1 — Design Memo

> Companion to `pollution_data_plan.md` §"Anomaly engine: rewrite, do not port". Defines the v1 flag taxonomy for the California POC, the thresholds, the payload shape, and the per-template render rules. To be implemented after this memo is approved.

## Scope

The crime site emits six flag types tuned for crime-data shapes (gradual sustained shifts, sporadic rare events, weak seasonality). Pollution data has different shapes. v1 ships **four** flag types tied to the data already in the pipeline (TRI, SDWIS, GHGRP, EJ). Two more (`smoke_days`, `exceedance_days`) defer until AQS lands.

| Flag | Source | Geography | Cadence |
|---|---|---|---|
| `long_arc_shift` | TRI / GHGRP | facility, county, state | annual |
| `release_shift` | TRI | facility (per chemical) | annual |
| `violation_event` | SDWIS | water utility | event-driven |
| `ghg_step` | GHGRP | facility | annual |

Deferred to v2 (AQS dependency): `smoke_days`, `naaqs_exceedance`, `seasonal_inversion`.

## Per-flag spec

### `long_arc_shift`

The Clean-Air-Act-decadal-arc story, generalized. Computes the percent change between the most-recent reporting year and a baseline year (≥10 yr prior). Emits when the change crosses a magnitude threshold and the baseline value is large enough that a percent change is meaningful.

- **Trigger:** `|recent − baseline| / baseline ≥ 0.50` AND `baseline ≥ 50,000 lb` (TRI) or `baseline ≥ 100,000 mtCO2e` (GHGRP) AND baseline year is ≥ 10 years before recent.
- **Severity:** `improvement` (decline) or `regression` (rise).
- **Geography:** facility (per chemical, plus per facility-total), county (rolled up), state (rolled up).

Editorial frame: "TRI air releases at this facility have fallen 78% since 2005."

### `release_shift`

Year-over-year facility × chemical TRI shift. The crime-site `spike` analog, retuned for facility-level TRI noise (which is high — ±100% YoY at small facilities is routine).

- **Trigger:** `|recent − prior| / prior ≥ 0.50` AND `|recent − prior| ≥ 10,000 lb` (absolute floor against tiny-base noise) AND `prior ≥ 1,000 lb`.
- **Severity:** `surge` (rise) or `drop` (decline).
- **Geography:** facility per chemical only. County / state rollups stay in the long-arc lane — YoY at aggregation level is too noisy to be editorial.

Editorial frame: "Benzene releases at this refinery rose 4.2× year over year (12k lb → 51k lb)."

### `violation_event`

SDWIS health-based or unresolved violation. Event-driven, not statistical — the violation itself is the signal.

- **Trigger:** any `health_based` violation in the trailing 5 years, OR any unresolved violation regardless of date.
- **Severity:** `unresolved` (highest), `health_based_recent` (within 1 year), `health_based_recent5y` (within 5 years).
- **Geography:** water utility.

Editorial frame: "Unresolved Lead and Copper Rule violation cited in 2024."

### `ghg_step`

Facility-level GHG step-changes — typically industrial commissioning or decommissioning, occasionally a fuel switch. GHG totals are clean signals (one number per facility per year), so noise is lower than TRI.

- **Trigger:** `|recent − prior| / prior ≥ 0.30` AND `recent ≥ 10,000 mtCO2e` AND `prior ≥ 10,000 mtCO2e`.
- **Severity:** `surge` (rise) or `drop` (decline).
- **Geography:** facility.

Editorial frame: "GHG emissions at this plant fell 41% year over year — typical of a fuel switch or unit shutdown."

## Calibration target

Mirror the crime site's posture: 1–3 flags per geography per period on average. Initial run will overshoot; tighten thresholds in the second pass. Specifically:

- Per facility: ≤ 3 flags total (across release_shift × top chemicals + long_arc + ghg_step).
- Per county: ≤ 5 flags total (county-level long_arc rollups only — no per-chemical at county).
- Per state: ≤ 8 flags total.
- Per water utility: as many violation_events as the SDWIS record cites (no statistical filter — these are events, not anomalies).

If the first emission produces > 2× these counts, tighten thresholds before shipping. Calibration metrics live in `pipeline/src/flags/calibration.py` (new).

## Payload shape

New types in [`frontend/src/lib/types.ts`](frontend/src/lib/types.ts):

```ts
export type FlagType =
  | "long_arc_shift"
  | "release_shift"
  | "violation_event"
  | "ghg_step";

export type FlagSeverity =
  | "improvement" | "regression"
  | "surge" | "drop"
  | "unresolved" | "health_based_recent" | "health_based_recent5y";

export interface Flag {
  type: FlagType;
  severity: FlagSeverity;
  label: string;          // "TRI air releases", "Benzene", "PWS health-based violation"
  summary: string;        // single-sentence editorial frame, template-rendered
  magnitude_pct: number | null;   // signed percent change (null for events)
  magnitude_abs: number | null;   // raw delta in pathway units (null for events)
  baseline_year: number | null;   // for long_arc and release_shift
  recent_year: number;
  units: string | null;           // "lb", "mtCO2e", null for events
  history?: AnnualPoint[];        // up to 24 years for the card sparkline
  link?: { label: string; href: string };  // external (e.g. EPA SDWIS record)
}
```

Add `flags: Flag[]` to `FacilityPagePayload`, `CountyPagePayload`, `StatePagePayload`, `WaterUtilityPayload`. Empty array is the no-signal case (template handles).

## Pipeline layout

New module tree under `pipeline/src/flags/`:

```
pipeline/src/flags/
  __init__.py
  types.py                # Flag dataclass mirroring the TS shape
  long_arc.py             # detect long_arc_shift across TRI / GHGRP histories
  release_shift.py        # detect release_shift on facility × chemical YoY
  violation_event.py      # promote SDWIS violations to flags
  ghg_step.py             # detect ghg_step on facility-total GHGRP YoY
  prose.py                # template renderers (mirrors lib/prose.ts)
  calibration.py          # count-per-geography sanity checks
```

Wired into `pipeline/src/main.py` after aggregate, before publish: `aggregate → flags → publish`.

## Frontend rendering

New component: `frontend/src/components/site/AnomalyCard.tsx`. Modeled on the crime site's anomaly cards, with the existing `.anomaly-card` CSS class (`spike`, `drop`, `rare` variants). One card per `Flag`.

Per-template placement (insert sections, don't replace):

| Template | Section title | Position | Cap |
|---|---|---|---|
| Facility | "Notable signals" | After hero, before chemicals grid | 4 |
| County | "Notable signals" | After hero, before pathways | 5 |
| State | "Notable signals at the state level" | After hero, before pathways | 6 |
| Water utility | "Active signals" | After hero, before contaminants | 4 |
| Home | "What's moving" | Replaces or augments featured strip | 3 |

Sort order within a section: severity-weighted — `unresolved` > `regression`/`surge` > `improvement`/`drop` > `health_based_recent`. Within severity, by `|magnitude_pct|` desc.

When `flags` is empty, the section renders a single muted line ("No notable signals this reporting year — see pathways and chemicals below for the full picture") rather than disappearing. The crime site disappears empty sections; pollution should not, because absence-of-signal is itself meaningful for facility / utility readers.

## Methodology page

New `/methodology#anomaly-engine` section, top-level, before the per-source caveat blocks. Sections:

1. **Why we surface flags.** Editorial-judgment-encoded rationale (mirrors crime site's framing).
2. **Per-flag formal rules.** Triggers + thresholds + severity definitions, copied from this memo.
3. **What's deferred.** AQS-dependent flags (smoke days, exceedance days) named explicitly.
4. **Calibration commitment.** Target flag counts; honest about tuning the first cycle.
5. **What flags are not.** "A flag is editorial attention, not a regulatory finding. EPA's enforcement actions are linked verbatim where they exist."

## Out of scope for v1

- **Sustained shift / streak break.** Need monthly cadence; TRI is annual. Defer until AQS or a monthly source lands.
- **Zero-event.** Crime-shaped — pollution doesn't have an obvious analog.
- **Forecast-vs-actual flags.** No forecasts shipping yet (Prophet on TRI is editorially fraught per plan).
- **Cross-pathway flags.** A facility that's high TRI *and* near a public water system could produce a composite flag; defer until v2 once each individual lane is calibrated.

## Open questions before implementation

1. **Where does the flag-emission run sit in the publish DAG?** Proposing after aggregate, before publish, with a `--no-flags` escape hatch for ingest-only dev runs. Confirm.
2. **Do flags appear in the home featured strip, or stay below the fold?** Plan implies homepage features the most editorial content; flags are exactly that. Proposing to fold flags into the existing `featured` array on `HomePagePayload`, with a flag-aware kind tag.
3. **First-run calibration:** ship the engine with thresholds intentionally lax, generate a CA-only flag inventory, hand-tune to the per-geography caps above, then ship for real. Confirm the two-pass approach.

## Status

Design. Awaiting sign-off on thresholds + placement before implementation.
