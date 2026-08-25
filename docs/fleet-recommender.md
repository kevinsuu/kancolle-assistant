# Normal Map Fleet Recommender

The first fleet recommender vertical slice is embedded in KC3Kai's Strategy Room. It reads the
current KC3 account state and returns up to three deterministic, account-owned fleets for normal
maps 1-1 through 7-5, including 5-6.
It never changes the game or equipment state.

The injected menu, controls, status text, recommendation explanations, warnings, roles, and
resource labels follow KC3's configured language. English (`en`), Traditional Chinese (`tcn`),
Simplified Chinese (`scn`), and Japanese (`jp`) are supported; unsupported language codes fall
back to English. Reopen or reload Strategy Room after changing KC3's language. Ship and equipment
names continue to come from KC3, while map and route names come from the recommendation catalog.

## Scope

- Maps: all 37 currently available normal maps, including multi-phase maps and 5-6.
- Routes: 97 canonical strategy templates.
- Objectives: balanced, boss clear, low cost, leveling, and resource farming.
- Output: exact ship and equipment instance IDs, basic air power, Formula 33 LoS, estimated
  resource use, source links, reasons, and warnings.
- Optional preference: leave equipment used by current fleets out of the recommendation pool.

Event maps, quest-specific compositions, combined fleets, land-based air squadron assignment,
support fleets, and automatic equipment changes remain out of scope. Routes requiring Fast+ or
special equipment are present but retain explicit tags and warnings until the gear-dependent speed
validator is complete.

## Architecture

`@kancolle-assistant/recommendation-core` owns the normalized domain, validated 5-5 rule, fleet
beam search, global equipment beam search, metrics, scoring, and explanations. It has no access to
KC3 globals or Electron.

The shell main process owns the KC3 anti-corruption boundary. Three fixed IPC commands are accepted
only from the currently loaded KC3 Strategy Room origin:

- `recommendation:account-summary`
- `recommendation:map-options`
- `recommendation:recommend`

The preload adds a localized recommendation item to the Strategy Room fleet menu and renders the
result. The map selector opens on 1-1. Account inventory stays behind the main-process boundary. Fleet and
equipment search runs in a lazy worker thread with request correlation, crash recovery, and a
30-second defensive timeout. Before a successful result crosses IPC, it is reduced to the route,
ship, equipment, metric, score, reason, and warning fields used by the Strategy Room UI.

Every account snapshot reloads KC3's persisted ship, equipment, HQ, and fleet data before reading
the managers. The `重新同步` action therefore reflects changes made after Strategy Room opened and
invalidates any recommendation produced from the previous snapshot; the user must generate a new
recommendation after the refresh completes.

The page reuses KC3 Strategy Room's native page title, help panel, section, control, theme color,
and dense fleet-row conventions. Both the dark and legacy themes are driven by KC3's existing
`bscolor*` and `fcolor*` classes rather than a separate KanColle Assistant palette. Recommended
equipment rows use KC3's equipment-type icon set, keyed by the master record's `api_type[3]`, so
main guns, carrier fighters, and other categories match the equipment encyclopedia.

## Rule data

The catalog is stored in:

- `source-map-recommendations.json`: MIT-licensed base route constraints from
  `shichiria/kancolle-browser`.
- `strategy-overlays.json`: curated boss, leveling, resource, X-5, and 5-6 strategies.

Every normalized route includes source URLs, confidence, verification date, category, objectives,
tags, and a rule version. Every one of the 97 templates links directly to its current per-map
Kancolle Wiki guide in addition to any farming, leveling, or source-dataset reference. Invalid
source or overlay shapes fail during module initialization.

Examples of calculated hard constraints:

- Air power: minimum 175, recommended 392.
- Formula 33 LoS: coefficient 2, minimum 81.

The minimum is the legal solver constraint when the source provides a verified threshold. Routes
without a reliable numeric threshold do not invent one; the UI labels the metric as having no hard
minimum.

## Solver behavior

The fleet solver ranks bounded candidates and uses deterministic beam search over generic min/max,
ship-count, and named-ship constraints.
The equipment solver builds all ship slots as one resource-allocation problem. A piece of equipment
can be assigned only once, must be owned by the account, and must be compatible according to the
compatibility list captured from `KC3Master.equip_on_ship`.

Recommendations that fail minimum air power or LoS are discarded rather than penalized with a
score. A route tagged as requiring a fast fleet also rejects a fleet containing a slow ship. If no
legal result remains, the UI reports the observed missing ship type, air power, LoS, speed, or
assignment constraint.

Resource equipment is selected by actual ship compatibility. For normal resource nodes, Daihatsu
and amphibious-tank categories are preferred, drum canisters are the fallback, and landing-craft
variants with no normal-node bonus are excluded from the bonus count. Candidate limits grow with
the number of requested slots, so fleets needing more than ten transport items can use the full
owned inventory instead of leaving later slots empty.

The 1-3 fuel routes have a reviewed resource profile: one-battle fuel and ammo consumption, route
reach probability, average base fuel, Daihatsu bonus, and drum-canister bonus. Their ranking and UI
therefore use expected gross and net fuel rather than the previous generic four-battle cost. Other
resource routes without a complete per-node model are explicitly marked as cost-only estimates.

Air power delegates per-slot calculations to KC3 when the snapshot is captured. Formula 33 LoS
uses KC3's documented coefficients and naked ship LoS values. Combat score and resource use are
heuristics and are labelled as such in every recommendation. The displayed `/100` value is named
`適配度`; it is not presented as a win probability. Routes with unmodeled Fast+, LBAS, support,
anti-installation, historical-bonus, or other special setup requirements show an execution warning
and the source/verification date beside the route.

## Development

Build the core before packaging the shell:

```sh
yarn build:recommendation
yarn build:shell
```

The root `yarn build` command already runs those in the required order.

The shell Webpack configuration emits `recommendation.worker.js` as an explicit main-process
entry for packaged builds. Development startup executes the CommonJS worker source directly, so
Forge watch cleanup cannot remove the running app's worker dependency. Neither path relies on a
child-loader side effect.

Run the deterministic parser, catalog, metric, and solver regression suite with:

```sh
yarn test:recommendation
```

The root `yarn test` command runs these tests before the existing extension suite.

When testing with an account, compare at least five ships and ten equipment instances against KC3,
including master ID, instance ID, improvement, and proficiency. Also confirm that no equipment ID
appears twice within each result.
