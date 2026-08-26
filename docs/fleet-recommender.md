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
- Routes: 112 canonical strategy templates.
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

The worker keeps a bounded pool of complete candidate loadouts for the shell to verify. In one
KC3 page-context call, the shell clones each candidate ship without changing the account, equips
the proposed instance IDs, and invokes KC3's current visible equipment-bonus, improvement, gun-fit
accuracy, shelling, night, anti-submarine, and anti-installation calculations. The resulting
effective stats and target-specific powers replace the naked-stat heuristic for final ranking.
This uses KC3's dynamically updated equipment-bonus and combat data, including combination
bonuses, instead of maintaining a second static formula table in the application. If KC3 cannot
perform that optional final pass, the bounded solver ranking remains available as a fallback.
The integration points follow KC3Kai's current
[`Ship.js`](https://github.com/KC3Kai/KC3Kai/blob/master/src/library/objects/Ship.js) and
[`Gear.js`](https://github.com/KC3Kai/KC3Kai/blob/master/src/library/objects/Gear.js)
implementations; the application does not persist a copied multiplier table.

The account summary and recommendation requests reuse one normalized snapshot while the same
Strategy Room page remains open. This avoids repeating KC3 compatibility, speed-pattern, and
per-slot air-power extraction before every calculation. The `重新同步` action explicitly reloads
KC3's persisted ship, equipment, HQ, and fleet data, replaces the cached snapshot, and invalidates
recommendations produced from the previous snapshot. Use it after changing ships or equipment in
the game. Completed recommendation results are also reused for an identical map, objective, route,
and current-fleet preference until that explicit resync.

The page reuses KC3 Strategy Room's native page title, help panel, section, control, theme color,
and dense fleet-row conventions. Both the dark and legacy themes are driven by KC3's existing
`bscolor*` and `fcolor*` classes rather than a separate KanColle Assistant palette. Recommended
equipment rows use KC3's equipment-type icon set, keyed by the master record's `api_type[3]`, so
main guns, carrier fighters, and other categories match the equipment encyclopedia. A ship card
shows `base speed → final speed` when its assigned turbine/boiler combination changes speed, rather
than leaving the user to infer the result from the fleet-wide speed label.

Map and route options load and paint before the initial account synchronization. KC3's full
snapshot extraction then yields between short calculation batches, so the native selectors remain
responsive while a large account is being read. Selecting `Generate recommendation` immediately
disables the controls, changes the button label, and displays loading indicators in both the button
and result area. The UI waits for that state to paint before starting
the worker calculation. A short timeout also releases that paint wait when the Strategy Room is in
a background tab where animation frames may be suspended. Account synchronization failures always
restore the controls and show an error, including IPC rejections rather than only structured
service responses.

## Rule data

The catalog is stored in:

- `verified-boss-fleets.json`: exact normal-map fleet skeletons and reviewed numeric thresholds
  taken from the linked current ぜかまし攻略 pages.
- `source-map-recommendations.json`: the retained MIT-licensed legacy base dataset from
  `shichiria/kancolle-browser`; its broad boss constraints are no longer exposed to the solver.
- `strategy-overlays.json`: curated boss, leveling, resource, X-5, and 5-6 strategies.

Every normalized route includes source URLs, confidence, verification date, category, objectives,
tags, and a rule version. Every one of the 112 templates links directly to its current per-map
Kancolle Wiki guide in addition to any farming, leveling, or source-dataset reference. Invalid
source or overlay shapes fail during module initialization.

The standard boss catalog was rechecked on 2026-08-26 and replaces every broad legacy boss rule
with a guide-backed fleet skeleton. Automatic selection first compares templates that are ready for
solver-only use: fixed boss routing for boss objectives, non-experimental data, modeled required
thresholds, and no unresolved support fleet, LBAS, smoke, special-attack, anti-installation, or
other manual combat setup. A modeled external requirement is exempt only when the solver validates
its owned equipment instances and compatible ships. If no matching template passes that complete
audit, automatic selection falls back to every matching route that the fleet and equipment solver
can calculate, ranks the resulting plans, and preserves the unresolved setup as visible warnings.
The user therefore does not need to select a route merely to obtain a fleet, while a warning-bearing
result is never presented as fully validated. Every returned plan fills all regular equipment
slots. When the preferred equipment category is exhausted, the solver uses a lower-ranked,
role-safe compatible item rather
than returning a partial loadout; if the owned inventory cannot fill the complete legal layout, the
plan is rejected. Guide-primary templates rank before heuristic alternatives, so ship firepower
scoring cannot silently substitute a different fleet class.

2-1 has two account-aware boss options. The shortest light fleet remains CL1, DD4, and AV1, while
a guide-primary carrier fallback uses two carriers (including at least one regular/armored
carrier), two CA/CAV, and two CL. Both hard-check the owned air-power threshold before returning a
plan. The separate instant-construction-material objective uses CVL2, SS/SSV3, and AV1 to reach E
after one battle and explicitly tells the user to retreat there. According to the current map data,
2-1 directly provides steel at B and one instant construction material at E; it is not a direct
fuel or bucket node. Fuel and a bucket associated with 2-1 come from the
[once-daily Southwest boss quest reward](https://kamigame.jp/%E8%89%A6%E3%81%93%E3%82%8C/%E5%87%BA%E6%92%83/2-1.html)
rather than map-node drops. The route data follows the current
[Wikiwiki map page](https://wikiwiki.jp/kancolle/%E5%8D%97%E8%A5%BF%E8%AB%B8%E5%B3%B6%E6%B5%B7%E5%9F%9F/2-1)
and [Zekamashi 2-1 guide](https://zekamashi.net/kancolle-kouryaku/2-1/).

Opening ASW routes store a minimum qualifying-ship count when the guide defines a usable threshold.
A ship qualifies only when it carries sonar and reaches the conservative ship-type threshold:
60 ASW for coastal defense ships and 100 ASW for other modeled types. Routes whose opening-ASW
requirement is not quantified retain a manual-check warning and participate only when automatic
selection has no completely validated alternative. Explicitly selected routes retain their source
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
ship-type, ship-count, and named-ship constraints. Partial fleets are discarded when the remaining
ranked ships can no longer fulfill a required exact or minimum count. This preserves legal fleets
on routes with overlapping constraints, such as 2-5's DD, CL, and carrier subtype limits, while
keeping the search bounded.
The equipment solver builds all ship slots as one resource-allocation problem. A piece of equipment
can be assigned only once, must be owned by the account, and must be compatible according to the
compatibility list captured from `KC3Master.equip_on_ship`. On routes with a reviewed air-power
minimum, aviation battleships, aviation cruisers, and seaplane tenders can allocate owned seaplane
fighters instead of assuming that only carriers can supply the required air power. Ordinary
battleships and light cruisers retain their recon/radar combat templates; merely being compatible
with a seaplane fighter no longer causes every remaining slot to be converted into air control.
Equipment matching follows KC3's current master categories: seaplane fighters include category 45,
submarine torpedoes include category 32, Type 3 Shells use category 18, and AP shells use category 19. Current carrier aircraft and jet categories used by KC3 are also recognized. These mappings are
shared by every normal-map route rather than patched per map.

Opened expansion slots participate in the same global allocation. The solver fills each one when
the account has a remaining compatible equipment instance, and leaves it empty only when no legal
unused instance is available. Expansion assignments never duplicate equipment already recommended
in a regular slot or another ship's expansion slot.

Each recommendation request indexes owned equipment by compatibility and requirement once, then
reuses ranked options across overlapping fleet candidates and routes. Fast+ and night-carrier
reservation searches also collapse equivalent equipment-order states before applying their beam
limits. This keeps large KC3 inventories bounded without changing equipment uniqueness or route
validation.

Fleet candidates are equipped in stages. The solver stops as soon as the first three ranked legal
fleets succeed; it expands toward the 18-candidate ceiling only when earlier candidates fail legal
equipment or calculated constraints. For the KC3 exact-combat pass it retains at most 18 ranked
fleet/loadout variants, then collapses them back to three distinct visible fleets after exact
reranking. This avoids fully solving lower-ranked fleets while still allowing ship-specific and
combination equipment bonuses to change the winning loadout.

The exact pass groups equivalent equipment instances by master item, improvement, and proficiency,
so a ship/loadout is evaluated only once even when it appears in several candidate fleets. The
result is reused while the same synchronized account snapshot remains active. It also dispatches
only the formula family required by the route: surface power and gun fit, ASW power, or
anti-installation power. KC3's combined equipment-total/visible-bonus result is read in one pass per
stat instead of recalculating the same bonus table separately. Resynchronizing the account replaces
this cache together with the normal recommendation cache.

Automatic route comparison uses a shallower first pass: it stops at the first legal fleet for each
applicable route and checks at most six candidates when earlier candidates fail. If the pass does
not produce three distinct legal fleets, the solver falls back to the full per-route limits above.
Selecting one route always uses the full search directly. The recommendation worker is also started
during application initialization instead of on the first button press. This keeps broad maps such
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
midget submarine is mandatory, followed by torpedoes. This prevents ships such as Kitakami from
being filled with unrelated radars while omitting their defining opening-torpedo equipment. The
8inch Mk.9 variants are also excluded from torpedo-cruiser gun choices because of their documented
light-cruiser fit concern.

For 4-5 automatic selection, eight routes have explicit anti-installation models. The seven heavy
and carrier templates reserve two or three unique owned KC3 category-18 Type 3 Shell-family items
on compatible battleship or heavy-cruiser-class ships. The flexible Fast+ battleship
route is split into exact `2 battleships + 2 carriers` and `1 battleship + 3 carriers` templates;
each reserves two Type 3 Shells and keeps every selected carrier able to attack installations. The
CL1/DD3 shortest template
instead selects a battleship/carrier pair, reserves one Type 3 Shell, and keeps that carrier able to
attack land installations. Carrier models require each designated carrier to retain at least one
anti-installation-capable attack aircraft and prevent an ordinary dive bomber from occupying its
other attack slot. The snapshot obtains the current anti-land dive-bomber classification from KC3's
dynamically updated `antiLandDiveBomberIds`; torpedo bombers remain valid because they do not block
carrier attacks against land installations. Type 3 Shell-family items are excluded from ordinary
AP-shell candidates, so they appear only when a route explicitly reserves them for anti-installation
duty. Fast+ speed gear reserves only non-protected slots, so turbines and boilers cannot overwrite a
required Type 3 Shell or carrier attack slot. If the complete mixed setup cannot coexist with air
power, LoS, speed, compatibility, and instance uniqueness, the solver returns a specific
no-solution reason. Broader 4-5 routes that require landing craft, rockets, night carriers, or
unmodeled opening ASW remain manual-only.

Night-carrier routes require at least one carrier that KC3 identifies as able to attack at night.
An inherent ship trait can satisfy the condition without reserved equipment; otherwise the solver
must assign an owned and compatible night aircraft/personnel or ship-specific aircraft pattern.
Those items share the same global slot and instance allocation as speed and combat equipment, so a
route is not shown when the complete loadout cannot coexist.

Routes with modeled drum-canister routing reserve one owned drum on each required distinct ship.
The 2-5 northern route requires two drum carriers and a slow fleet, then checks Cn1 LoS 49; it is
eligible for automatic comparison only when the complete fixed-route setup is available. The 5-5
southern drum route similarly reserves four carriers when explicitly selected. Missing drums or
compatible carriers produce a specific no-solution reason instead of a partial fleet. These counts
follow the current [2-5 branching guide](https://wikiwiki.jp/kancolle/%E5%8D%97%E8%A5%BF%E8%AB%B8%E5%B3%B6%E6%B5%B7%E5%9F%9F/2-5).

The 5-5 special-attack routes are solver-ready. The fleet search recognizes Yamato Kai Ni/Juu with
Musashi Kai Ni, Nagato or Mutsu Kai Ni with a battleship helper, and Nelson or Rodney Kai with two
eligible touch helpers. It rejects fleets without a supported activator, then orders the selected
ships into the required flagship, second-ship, or Nelson Touch third/fifth positions before gear
assignment. Fast+ conversion, air power, LoS, equipment compatibility, and instance uniqueness are
validated after that ordering. The result names the attack and formation. The remaining sortie
check is limited to mutable battle state: the attack must still be unused, participating ships must
remain within their activation damage limits, and the displayed formation must be selected at the
intended node.

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
uses KC3's documented coefficients and naked ship LoS values. Initial combat search uses bounded
heuristics, then all normal-map results are reranked with KC3's current complete-loadout formulas:
visible ship-specific and combination bonuses, improvement attack power, gun-fit accuracy,
day/night shelling, ASW synergy, and target-specific anti-installation pre-cap and post-cap
modifiers. Soft-skin normal-map targets use Harbor Princess, while 6-4 averages its pillbox,
isolated-island, and supply-depot target classes and 7-5 conservatively compares all five KC3
installation classes. Resource use remains an estimate. The displayed `/100` value is named
`適配度`; it is not presented as a win probability. Routes with unmodeled LBAS, support,
anti-installation, historical-bonus, or other unmodeled setup requirements show an execution warning
and the source/verification date beside the route. Modeled 4-5 mixed anti-installation requirements
instead show separate passed validations for Type 3 Shell and carrier attack capability, while
modeled 5-5 special attacks show their finalized fleet order and one-line sortie check.

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
