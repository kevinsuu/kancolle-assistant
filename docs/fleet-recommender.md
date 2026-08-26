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
- Routes: 109 canonical strategy templates.
- Objectives: balanced, boss clear, low cost, leveling, and resource farming.
- Output: exact ship and equipment instance IDs, basic air power, Formula 33 LoS, estimated
  resource use, source links, reasons, and warnings.
- Optional preference: leave equipment used by current fleets out of the recommendation pool.

Event maps, quest-specific compositions, combined fleets, land-based air squadron assignment,
support fleets, and automatic equipment changes remain out of scope. Routes requiring other
special equipment retain explicit tags and warnings until the corresponding validator is complete.

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
result. The map selector opens on 1-1. Account inventory stays behind the main-process boundary.
Fleet and equipment search runs in a lazy worker thread with request correlation, crash recovery,
and a 30-second defensive timeout. Before a successful result crosses IPC, it is reduced to the
route, ship, equipment, metric, score, reason, and warning fields used by the Strategy Room UI.

The account summary may reuse its normalized snapshot while the same Strategy Room page remains
open. Every recommendation request, however, reloads KC3's persisted ship, equipment, HQ, and fleet
data before calculation, replaces the cached snapshot, and returns its generation time to the UI.
The result therefore cannot silently use an older equipment or fleet assignment. The `重新同步`
action still reloads the summary explicitly and invalidates any recommendation produced from the
previous snapshot.

The page reuses KC3 Strategy Room's native page title, help panel, section, control, theme color,
and dense fleet-row conventions. Both the dark and legacy themes are driven by KC3's existing
`bscolor*` and `fcolor*` classes rather than a separate KanColle Assistant palette. Recommended
equipment rows use KC3's equipment-type icon set, keyed by the master record's `api_type[3]`, so
main guns, carrier fighters, and other categories match the equipment encyclopedia.

Selecting `Generate recommendation` immediately disables the controls, changes the button label,
and displays loading indicators in both the button and result area. The UI waits for that state to
paint before refreshing the account snapshot and starting the worker calculation. A short timeout
also releases that paint wait when the Strategy Room is in a background tab where animation frames
may be suspended. Account synchronization failures always restore the controls and show an error,
including IPC rejections rather than only structured service responses.

## Rule data

The catalog is stored in:

- `verified-boss-fleets.json`: exact normal-map fleet skeletons and reviewed numeric thresholds
  taken from the linked current ぜかまし攻略 pages.
- `source-map-recommendations.json`: the retained MIT-licensed legacy base dataset from
  `shichiria/kancolle-browser`; its broad boss constraints are no longer exposed to the solver.
- `strategy-overlays.json`: curated boss, leveling, resource, X-5, and 5-6 strategies.

Every normalized route includes source URLs, confidence, verification date, category, objectives,
tags, and a rule version. Every one of the 109 templates links directly to its current per-map
Kancolle Wiki guide in addition to any farming, leveling, or source-dataset reference. Invalid
source or overlay shapes fail during module initialization.

The standard boss catalog was rechecked on 2026-08-26 and replaces every broad legacy boss rule
with a guide-backed fleet skeleton. Automatic selection only considers templates that are ready for
solver-only use: fixed boss routing for boss objectives, non-experimental data, modeled required
thresholds, and no unresolved support fleet, LBAS, smoke, special-attack, anti-installation, or other
manual combat setup. A route that does not pass this audit remains available by explicit selection
and is labeled as requiring a manual check. If a map has routes but none are safe for automatic
selection, the result explains that distinction instead of claiming that the rule is missing.
Automatic results also reject partially empty regular equipment layouts. Guide-primary templates
rank before heuristic alternatives, so ship firepower scoring cannot silently substitute a
different fleet class.

Opening ASW routes store a minimum qualifying-ship count when the guide defines a usable threshold.
A ship qualifies only when it carries sonar and reaches the conservative ship-type threshold:
60 ASW for coastal defense ships and 100 ASW for other modeled types. Routes whose opening-ASW
requirement is not quantified remain manual-only. Explicitly selected routes retain their source
warnings instead of being silently treated as fully validated.

The X-5 boss and gimmick catalogs were rechecked against Kancolle Wiki and 艦娘百科 on 2026-08-25
and explicitly replace the older vendored X-5 routes. Exact-count constraints prevent a minimum
such as “one aviation battleship” from admitting additional battleships into a fixed composition.
The balanced 1-5 selection uses only the four-DE and DD/DE light fleets; the exact
one-BBV/two-CL/one-DD second-shelling fleet is available only when boss clear is selected. For 4-5,
fleets that pass node K require Cn2 LoS 71 and air power 112/252 (minimum/recommended); routes that
skip K use air power 92/207. The CL1/DD3 shortest route therefore requires at least one carrier in
its two battleship/carrier slots; the documented two-battleship variant concedes air control and is
not compatible with that hard threshold. The 5-5 north and middle constraints exclude compositions
that take a different branch, and the AO route warns that its optimized version requires an H-node
smoke screen. 6-5 stores route-specific air-power targets after LBAS, while 7-5 exposes P1, two
M-node gimmick choices, both P2 recommended fleets, and P3 independently. Every non-leveling X-5
template also retains its direct 艦娘百科 guide link.

For 3-5, the current guide-primary upper route is exactly three regular/armored carriers, one CAV,
and two SS/SSV on B-D-H-K. Air power 410 and Formula 33 coefficient-4 LoS 40 are hard gates. The
former broad rule that admitted one battleship plus two carriers was removed, so combat scoring can
no longer promote Musashi into this route.

Examples of calculated hard constraints:

- Air power: minimum 175, recommended 392.
- Formula 33 LoS: coefficient 2, minimum 81.

The minimum is the legal solver constraint when the source provides a verified threshold. Routes
without a reliable numeric threshold do not invent one; the UI labels the metric as having no hard
minimum.

## Solver behavior

The fleet solver ranks bounded candidates and uses deterministic beam search over exact/min/max
ship-type, ship-count, and named-ship constraints.
The equipment solver builds all ship slots as one resource-allocation problem. A piece of equipment
can be assigned only once, must be owned by the account, and must be compatible according to the
compatibility list captured from `KC3Master.equip_on_ship`. On routes with a reviewed air-power
minimum, compatible battleships and cruisers also allocate owned seaplane fighters instead of
assuming that only carriers can supply the required air power.

Opened expansion slots participate in the same global allocation. The solver fills each one when
the account has a remaining compatible equipment instance, and leaves it empty only when no legal
unused instance is available. Expansion assignments never duplicate equipment already recommended
in a regular slot or another ship's expansion slot.

Each recommendation request indexes owned equipment by compatibility and requirement once, then
reuses ranked options across overlapping fleet candidates and routes. Fast+ and night-carrier
reservation searches also collapse equivalent equipment-order states before applying their beam
limits. This keeps large KC3 inventories bounded without changing equipment uniqueness or route
validation.

Fleet candidates are equipped in stages. The solver first evaluates six candidates for a route and
stops after three distinct fleets succeed; it expands toward the previous 18-candidate ceiling only
when early candidates fail legal equipment or calculated constraints. This avoids fully solving
lower-ranked fleets that cannot appear in the three-result response.

Automatic route comparison uses a shallower first pass: it evaluates at least two and at most six
fleet candidates for each applicable route, stopping after the minimum when one succeeds. If the
pass does not produce three distinct legal fleets, the solver falls back to the full per-route
limits above. Selecting one route always uses the full search directly. This keeps broad maps such
as 4-5 responsive without weakening no-solution diagnostics or single-route recommendations.

Recommendations that fail minimum air power or LoS are discarded rather than penalized with a
score. Routes tagged as requiring a fast or slow fleet reject candidates with the wrong base fleet
speed. Fast+ routes use KC3's current ship-specific speed rules to reserve exact owned turbine and
boiler instances for every ship. Compatible opened expansion slots are included in the assignment,
and a ship is excluded before fleet search when none of its patterns can be fulfilled by the owned
compatible equipment. Candidate ranking subtracts the regular-slot cost of the conversion; for a
battleship, losing the two-main-gun combat structure is penalized again after equipment assignment.
The finished loadout is rejected unless every ship actually reaches Fast+. The UI shows both each
ship's base speed and the equipped fleet's final speed. If no legal result remains, it reports the
observed missing ship type, air power, LoS, speed, or assignment constraint.

Torpedo cruisers receive a coherent combat loadout instead of independent per-slot scoring: a
midget submarine is mandatory, followed by torpedoes for ordinary routes or main guns for
anti-installation routes. This prevents ships such as Kitakami from being filled with unrelated
radars while omitting their defining opening-torpedo equipment. The 8inch Mk.9 variants are also
excluded from torpedo-cruiser gun choices because of their documented light-cruiser fit concern.

Night-carrier routes require at least one carrier that KC3 identifies as able to attack at night.
An inherent ship trait can satisfy the condition without reserved equipment; otherwise the solver
must assign an owned and compatible night aircraft/personnel or ship-specific aircraft pattern.
Those items share the same global slot and instance allocation as speed and combat equipment, so a
route is not shown when the complete loadout cannot coexist.

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
`適配度`; it is not presented as a win probability. Routes with unmodeled LBAS, support,
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
