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
- Routes: 108 canonical strategy templates with explicit source references.
- Objectives: balanced, boss clear, low cost, leveling, and resource farming remain internal
  ranking contexts. Strategy Room derives the internal context from the selected guide template
  instead of showing a separate objective selector.
- Output: guide-style summaries with route strategy text, ships to bring, equipment to equip, and
  sortie warnings. The guide selector lists sourced reference templates instead of a blank
  automatic-route choice. The data-status row shows an expandable, deduplicated list of the guide
  pages used by the selected reference template or active plan, while broader map-validation
  sources stay in route metadata. Hard requirements such as air power, LoS, opening ASW, and
  resource estimates are shown only as strategy checks when they apply. Guide selectors place the
  catalog name before source-site labels so the distinguishing name remains visible in narrow KC3
  panels.
- Equipment: recommendations use the full account-owned equipment pool, including items currently
  equipped on ships, and KC3 reranks bounded candidates with its current per-ship equipment bonus
  and combat calculations.

Event maps, quest-specific compositions, combined fleets, land-based air squadron assignment,
support fleets, and automatic equipment changes remain out of scope. Routes requiring other
special equipment retain explicit tags and warnings until the corresponding validator is complete.

## Architecture

`@kancolle-assistant/recommendation-core` owns the normalized domain, validated 5-5 rule, fleet
beam search, global equipment beam search, metrics, internal scoring, and explanations. It has no
access to KC3 globals or Electron.

The shell main process owns the KC3 anti-corruption boundary. Three fixed IPC commands are accepted
only from the currently loaded KC3 Strategy Room origin:

- `recommendation:account-summary`
- `recommendation:map-options`
- `recommendation:recommend`

The preload adds a localized recommendation item to the Strategy Room fleet menu and renders the
result. The map selector opens on 1-1. Account inventory stays behind the main-process boundary.
Fleet and equipment search runs in a lazy worker thread with request correlation, crash recovery,
and a 30-second defensive timeout. Before a successful result crosses IPC, it is reduced to the
route, source strategy text, ship, equipment, metric, reason, and warning fields used by the
Strategy Room UI; internal scores are not sent to the renderer.

The worker keeps a bounded pool of complete candidate loadouts for the shell to verify. In one
KC3 page-context call, the shell clones each candidate ship without changing the account, equips
the proposed instance IDs, and invokes KC3's current visible equipment-bonus, improvement, gun-fit
accuracy, shelling, night, anti-submarine, and anti-installation calculations. The resulting
effective stats and target-specific powers replace the naked-stat heuristic for final ranking.
This uses KC3's dynamically updated equipment-bonus and combat data, including combination
bonuses, instead of maintaining a second static formula table in the application. If KC3 cannot
perform that optional final pass, the bounded solver ranking remains available as a fallback only
for routes without a hard opening-ASW count. A route with a hard opening-ASW count is never emitted
without KC3 successfully validating every proposed ship and its complete loadout.
The integration points follow KC3Kai's current
[`Ship.js`](https://github.com/KC3Kai/KC3Kai/blob/master/src/library/objects/Ship.js) and
[`Gear.js`](https://github.com/KC3Kai/KC3Kai/blob/master/src/library/objects/Gear.js)
implementations; the application does not persist a copied multiplier table.

The Strategy Room account summary reads one normalized account snapshot and reuses it while the
same page remains open. This avoids repeating KC3 compatibility, speed-pattern, and per-slot
air-power extraction before every visible calculation. The `重新同步` action explicitly reloads KC3's
persisted ship, equipment, HQ, and fleet data, replaces the cached snapshot, and invalidates
recommendations produced from the previous snapshot. Use it after changing ships or equipment in
the game. Completed recommendation results are reused for an identical map, selected guide
template, and derived objective until that explicit resync.

Recommendation generation is foreground-only. Opening the game page or synchronizing the account no
longer starts all-map route availability checks or selected-route recommendation preloads. Clicking
`產生推薦` calculates only the currently selected map and guide route through the selected-route fast
path. Three seconds is treated as a slow-operation threshold rather than a foreground cutoff: the
request keeps running so the UI can still receive the final recommendation, while the main process
logs the active phase and completion timings for follow-up investigation. Each bounded completion
summary also records map, route, objective, route/fleet/gear candidate counts, best observed air
power, the required minimum, and stable failure reason codes without logging the account snapshot
or individual player equipment. Fleet-search diagnostics additionally record eligible and retained
ship counts, required-candidate counts, jointly infeasible partial states, maximum completed depth,
complete/constraint-valid state counts, special-attack rejections, and routes with no full
candidate. The worker keeps its 30-second defensive timeout for requests that stop responding
entirely.

The page reuses KC3 Strategy Room's native page title, help panel, section, control, theme color,
and dense fleet-row conventions. Both the dark and legacy themes are driven by KC3's existing
`bscolor*` and `fcolor*` classes rather than a separate KanColle Assistant palette. Recommended
equipment rows use KC3's equipment-type icon set, keyed by the master record's `api_type[3]`, so
main guns, carrier fighters, and other categories match the equipment encyclopedia. A ship card
shows `base speed → final speed` when its assigned turbine/boiler combination changes speed, rather
than leaving the user to infer the result from the fleet-wide speed label.
The result view is intentionally guide-first: the conditions area exposes only the map selector,
guide-template selector, active guide links in the expandable data-status row, and the generate
action. Tabs show route names, the first block shows cataloged strategy text, then the screen lists
ships and loadouts. Fit scores, objective radios, and heuristic-score warnings remain internal
implementation details rather than visible recommendation content. When switching between
generated plans, the data-status source list follows the currently visible plan.

Map and route options load and paint before the initial account synchronization. The generate action
becomes available as soon as a map and guide route are selected, even if the account summary is
still loading; the foreground recommendation request reads the required KC3 snapshot itself. KC3's
full snapshot extraction yields between short calculation batches, so the native selectors remain
responsive while a large account is being read. Selecting `Generate recommendation` immediately
disables the controls, changes the button label, and displays loading indicators in both the button
and result area. The UI waits for that state to paint before starting
the worker calculation. A short timeout also releases that paint wait when the Strategy Room is in
a background tab where animation frames may be suspended. Account synchronization failures always
restore the controls and show an error, including IPC rejections rather than only structured
service responses.
The guide selector always shows the sourced templates in catalog order. Routes are not disabled or
greyed out based on background feasibility checks; if the selected template cannot currently be
built, the foreground recommendation result explains the failing requirements.

## Rule data

The catalog is stored in:

- `verified-boss-fleets.json`: exact normal-map fleet skeletons and reviewed numeric thresholds
  taken from linked current guide pages such as ぜかまし攻略 and 艦娘百科.
- `strategy-overlays/`: one JSON file per map for curated boss, leveling, resource, X-5, and 5-6
  strategies. Add a new map JSON file there, then register its static import in
  `strategy-overlays/index.ts` so packaged builds include it.

Every normalized route includes complete source URLs, display guide URLs, confidence, verification
date, category, objectives, tags, and a rule version. Routes without an explicit map-level or
route-level reference are not normalized into the catalog or shown in Strategy Room. The old
vendored broad-route dataset has been removed from runtime, so map options and recommendations are
built only from the current sourced catalog. Every retained template links directly to the current
English Kancolle Wiki page, the matching Chinese KCWiki page, and the Bahamut normal-map reference
thread in metadata; EO templates also retain the relevant Yui image-guide URL when one is
available. The renderer receives only the route's display guide URLs for the visible data-status
list. Invalid source or overlay shapes fail during module initialization.

The standard boss catalog was rechecked on 2026-08-26 and 2026-08-29 and replaces every broad
legacy boss rule with a guide-backed fleet skeleton. Automatic selection first compares templates
that are ready for solver-only use: fixed boss routing for boss objectives, non-experimental data,
modeled required thresholds, and no unresolved support fleet, LBAS, smoke, special-attack,
anti-installation, or other manual combat setup. A modeled external requirement is exempt only when
the solver validates its owned equipment instances and compatible ships. If no matching template
passes that complete audit, automatic selection falls back to every matching route that the fleet
and equipment solver can calculate, ranks the resulting plans, and preserves the unresolved setup
as visible warnings.
The user therefore does not need to select a route merely to obtain a fleet, while a warning-bearing
result is never presented as fully validated. Every returned plan fills all regular equipment
slots. When the preferred equipment category is exhausted, the solver uses a lower-ranked,
role-safe compatible item rather
than returning a partial loadout; if the owned inventory cannot fill the complete legal layout, the
plan is rejected. Guide-primary templates rank before heuristic alternatives, so ship firepower
scoring cannot silently substitute a different fleet class.

When the user explicitly selects a route, the solver validates matching ships' current KC3
equipment before synthesizing new loadouts. A currently equipped fleet that already satisfies the
route's speed, air-power, Formula 33, opening-ASW, and modeled special-attack checks remains a valid
recommendation candidate instead of being hidden by equipment-search pruning. When another legal
fleet exists, the selected-route search also evaluates a bounded set of synthesized alternatives
before ranking the completed builds; a valid current fleet no longer ends the search by itself.
Required ship and ship-type constraints prune invalid partial fleets but do not add
order-dependent interim scores, so a later low-level candidate cannot displace a stronger ship only
because a named requirement was encountered earlier. Diagnostics and structured completion logs
expose current-loadout acceptance plus alternative candidate and acceptance counts; automatic
multi-route comparison remains unchanged.

1-6 exposes the four KCWiki guide headings as separate selectable templates. `1-6 萌新配置`,
`1-6 常規配置`, and `1-6 制空配置` use the fixed A-E-G-F-B-N fleet of one CL and five DD;
the air-control template asks a compatible CL to fill its aircraft slots with water fighters or
seaplane bombers, checks air parity at 19, and recommends F-node air superiority at 83. The
`1-6 季常配置` template uses two AO and four DD for the quarterly transport quest, checks air power
83, requires at least one Akizuki-class AACI escort plus one other DD capable of opening ASW, and
keeps the source's G-node 75% F / 25% K split as a visible random-routing warning. The
Bahamut heavy quarterly template accepts two BBV, one CL, and any three DD/DE, with Formula 33
coefficient 3 at 30 as the hard M-to-J routing check. Its 89 air-power parity target, 177 J-node
superiority target, and two opening-ASW ships are recommendations rather than account-blocking
requirements; J is a normal carrier battle and D is the air battle. The existing monthly
resource-recovery template remains available separately.

2-1 has two account-aware boss options. The shortest light fleet remains CL1, DD4, and AV1, while
a guide-primary carrier fallback uses two carriers (including at least one regular/armored
carrier), two CA/CAV, and two CL. The shortest fleet keeps boss air superiority 81 as visible advice
instead of blocking accounts below that target. It prefers an owned CL that can equip an available
midget submarine, assigns that opening-torpedo setup, and falls back to an ordinary high-stat CL
when the capability is unavailable; the carrier fallback still hard-checks its owned air-power
threshold before returning a plan. The separate instant-construction-material objective uses CVL2,
SS/SSV3, and AV1 to reach E after one battle and explicitly tells the user to retreat there.
According to the current map data,
2-1 directly provides steel at B and one instant construction material at E; it is not a direct
fuel or bucket node. Fuel and a bucket associated with 2-1 come from the
[once-daily Southwest boss quest reward](https://kamigame.jp/%E8%89%A6%E3%81%93%E3%82%8C/%E5%87%BA%E6%92%83/2-1.html)
rather than map-node drops. The route data follows the current
[Wikiwiki map page](https://wikiwiki.jp/kancolle/%E5%8D%97%E8%A5%BF%E8%AB%B8%E5%B3%B6%E6%B5%B7%E5%9F%9F/2-1)
and [Zekamashi 2-1 guide](https://zekamashi.net/kancolle-kouryaku/2-1/).

2-2 bauxite and transport farming now follows the current C-B-A routing: three carriers force the
western transport node, then the fleet retreats after the bauxite node. The flexible farming route
accepts DD, CL, CLT, CAV, AV, SS, and SSV support ships, so guide variants with an AV or submarine
decoy are not filtered out before scoring. A dedicated carrier3 + SS/SSV3 route is also available
for the common opening-airstrike plus opening-torpedo transport setup. Pure SS/SSV6 is exposed as
a low-cost manual route with a random-routing warning because current 2-2 branching does not make it
fixed boss or fixed bauxite farming.

3-3 keeps both KCWiki A-C-G-M forms as selectable sourced templates: CV/CVB1 + CVL1 + DD2 +
cruiser-class2, and CV/CVB1 + battleship-class1 + DD2 + cruiser-class2. The existing Zekamashi
CV/CVL example remains attached to the CVL template as an additional guide source.

4-2 keeps both current 艦娘百科 guide fleets as separate selectable templates. The regular route is
two carriers, one torpedo cruiser, one light cruiser, and two destroyers on
A-C-L / A-E-G-L / B-D-C-L. The transport-weekly route is two carriers, one battleship or aviation
battleship, one aviation cruiser, and two destroyers on the G→L transport-hunt route set. Both
display the KCWiki 4-2 page as their guide source, while broader map-validation sources remain in
metadata only.

Opening ASW routes store a minimum qualifying-ship count when the guide defines a usable threshold.
KC3 account snapshots probe each owned ship with KC3's current `canDoOASW()` logic and carry the
ship-specific no-equipment and sonar-triggered ASW thresholds into the core solver. This covers
inherent opening-ASW ships and lower ship-specific thresholds before the exact KC3 combat pass runs.
Those thresholds are candidate-generation hints only. After equipment assignment, KC3 re-equips
each cloned ship with the proposed instance IDs and calls `canDoOASW()` again, so sonar, displayed
ASW, equipment ASW, ASW aircraft, special carrier/aviation-battleship conditions, and ship-specific
exceptions are evaluated together. Candidates below the route's required count are discarded; if
none remain, the result reports `OASW_INSUFFICIENT` with KC3's best observed count.
Snapshots that do not expose those rules fall back to the conservative legacy check: sonar plus
60 ASW for coastal defense ships or 100 ASW for other modeled types. Routes whose opening-ASW
requirement is not quantified retain a manual-check warning and participate only when automatic
selection has no completely validated alternative. Explicitly selected routes retain their source
warnings instead of being silently treated as fully validated.
When the current-fleet equipment preservation option is enabled, equipment already carried by a
candidate ship remains available to that same ship, while equipment carried by other current-fleet
ships stays protected from reassignment.

The X-5 guide catalog was rechecked against Kancolle Wiki, 艦娘百科, and the supplied
Yui image guides on 2026-08-29 and explicitly replace the older vendored X-5 routes. Exact-count
constraints prevent a minimum such as “one aviation battleship” from admitting additional
battleships into a fixed composition. The balanced 1-5 selection uses only the four-DE and DD/DE
light fleets; the exact one-BBV/two-CL/one-DD second-shelling fleet is available only when boss
clear is selected. That beginner second-shelling fleet receives normal sonar/depth-charge ASW
loadouts but does not require three opening-ASW ships; only templates whose source explicitly
depends on opening ASW keep the hard count. 2-5 now exposes only sourced guide templates: the KCWiki/Yui middle carrier
route (CV/CVB1, CVL1, CL1, DD3, all fast, Cn1 LoS 34, air power 84), the KCWiki/Yui upper aviation
battleship route (BBV3, CA/CAV2-3, optional CL1, at least two CL/CAV drum-capable carriers, slow
fleet, Cn1 LoS 49, boss air 42/84), and Yui's Fifth Squadron upper route. The two upper-route
templates keep aviation battleships on waterplane-first loadouts so they can reach the guide LoS
line before spending the last slot on an AP shell. Yui 2-5 display names follow the source image
headings, such as `常規EO`, `新手`, and `第五戰隊`. Fifth Squadron additionally balances aviation
battleship waterplanes toward the hard 84 air-power line before accepting a LoS-only waterplane
combination, matching the guide's Ise Kai Ni waterplane carrier examples. For the Water
Counterattack quest fleet, Cn1 LoS 34 remains mandatory but boss air superiority 42 is a preferred
combat target rather than a routing or quest gate. The solver therefore returns an explicit
below-target warning instead of no solution when the account has no compatible air-control setup,
and places a DD in the quest-required flagship position. Exceptional CA/CL seaplane carriers such as
Zara due are selected from KC3's per-ship compatibility list instead of a generic CAV/AV-only
allowlist.

For 3-5, the fixed lower routes check Cn4 LoS 28. KCWiki/Yui lower-route air power from
AV/Night Zuiun/Zuiun is treated as guide advice instead of a hard routing gate for the generic
CL/AV1-DD5 and CL1-DD5 fleets, so those accounts are not rejected solely for having no air power.
Dedicated Yahagi Kai Ni Otsu and Nisshin variants keep the source-named ship; Nisshin additionally
checks the guide's 35/69 air-power line. The Yui image guide is represented by the beginner lower
fleet, the torpedo-squadron lower fleet, and the beginner upper fleet; the guide's G/H-node smoke
notes are kept as recommended sortie advice rather than route requirements.

The KCWiki upper catalog includes the three-carrier surface fleet, the three-carrier submarine
fleet, its Maya/Atlanta-gun variant, Nelson Touch, and the one-battleship/two-carrier fleet. They use
B-D-H-K, Cn4 LoS 40, and either the guide-primary 420 air-power line or the KCWiki final-form
381 minimum/395 sortie recommendation. The generic and Yui submarine templates use three
regular/armored carriers, one CA/CAV, and two SS/SSV. The Yui template prefers a Maya-class AACI
heavy cruiser when owned and multi-slot seaplane-capable submarines such as I-13/I-14 for the
submarine water-fighter role. Nelson Touch uses the existing special-attack ordering and formation
model; Atlanta guns, submarine damage control, and other image-specific refinements remain manual
sortie advice.

KCWiki's mixed lower catalog also exposes CAV3CL2DD, CAV2CL with three light free slots, CL2AV2
with two light free slots, Yubari/CLT five-opening-torpedo, CL2 with three or four AV, Hayasui, the
Hayasui/Yamashio Maru pair, and Yamashio Maru with three AV. These templates check Cn4 LoS 28 and
air power 35/69, but carry `random-routing` because they can start at B or F; CAV variants also note
the 25% F-to-E diversion. They are selectable guide routes but are excluded from automatic route
comparison. Midget-submarine saturation, AACI, long-range wrench, protected aircraft, deliberate
F-start refreshing, and retreat facilities are shown as manual setup notes until those combat roles
are fully modeled.

For 4-5, sourced Yui variants now carry their image-specific compositions and thresholds: the
CVL/CV/CL/DD3 shortest route checks air power 215, but its long-range carrier setup, anti-land DD
loadouts, balloons, and opening ASW are treated as manual guide requirements until those combat
roles are fully modeled. It is no longer rejected solely because the account lacks a night carrier
or solver-recognized anti-installation carrier aircraft. The KCWiki CL/DD heavy shortest route is
also kept as a sourced manual-combat template: it checks the guide fleet shape and air power 215,
but does not add a solver-only Type 3 Shell or land-attack carrier requirement. The beginner chip
fleet is fast battleship
plus two regular/armored carriers, light cruiser, and two destroyers at air power 220, the medium
Fast+ route is battleship plus three carriers, torpedo cruiser, and aviation cruiser at air power
220, the high-air Fast+ route is three carriers, two torpedo cruisers, and one aviation cruiser or
aviation battleship at air power 430, and the beginner final route is battleship, two
regular/armored carriers, and three aviation cruisers at air power 270 with Cn2 LoS 70 and a
K-node smoke-screen recommendation.

Four additional KCWiki image-matched 4-5 templates preserve the guide headings and are modeled as
separate choices instead of changing the existing Yui-derived routes. `高速＋夜母配置（正攻／撈油／戰果衝刺）`
requires two regular/armored carriers including a valid night-carrier setup, one light carrier, two
torpedo cruisers, one aviation battleship, fleet-wide Fast+, air power 414, three land-attack-safe
carriers, and one Type 3 Shell-family finisher. `夜母小船配置` requires two light carriers
including one night carrier, one light cruiser, three destroyers, air power 207, three opening-ASW
ships, and anti-installation gear on two separate surface ships; the source warns that its repair
cost is less suitable for extended farming. `高速＋特攻配置` requires Nelson Kai, three
regular/armored carriers, one heavy cruiser, one torpedo cruiser, fleet-wide Fast+, air power 207,
and a complete anti-installation setup. The solver orders Nelson and two non-carriers in positions
1/3/5 and explains the Double Line formation for Nelson Touch at H. `繞路配置` keeps one fast
battleship, two regular/armored carriers, one light cruiser, and two destroyers at air power 207;
it records both A-B-E-M-R-N-T and C-F-I-J-H-T and is offered only for the balanced/chipping goal.

The 5-5 catalog now keeps sourced Yui templates plus the KCWiki table headings that can be modeled
as current-phase route templates. Yui's `常規EO/中路戰巡流` route requires Yamato Kai Ni and one
listed friend battleship such as Musashi, Iowa, Bismarck, or Richelieu (air power 138, Cn2 LoS 66);
the supply-smoke route uses one auxiliary ship and two destroyers (air power 300, Cn2 LoS 66);
`KCWiki + Yui｜中路水雷退避流` keeps Cn2 LoS 66 with air 1 as advice; `KCWiki + Yui｜潛艇配置` is a
six-submarine low-resource snipe with Cn2 LoS 80; and `新手長陸` checks air power 136 plus Cn2 LoS 66. KCWiki upper-route templates include `上路武大夜母配置`, `上路帶路配置`, `上路納爾遜`,
`上路夜母`, `上路金剛改二丙`, `上路隨機配置1`, and `上路隨機配置2`. Middle-route templates include
`中路武大拉煙流`, `中路武大最矢流`, `中路武大補給流`, `中路納爾遜`, `中轉下摸流`, and
`中路重巡配置`. Lower-route templates include `下路武大4DD`, `下路夜母2CV4DD`, `下路航戰航巡`,
and `下路長陸4DD`. The Bahamut 2014 first-phase 3BB3CV/3BB2CV1CVL reference is retained only
through the KCWiki-compatible `上路六大船隨機` manual template because current second-phase routing
can drift after P. 5-5 advisory OASW tags no longer force every light ship into an anti-submarine
loadout unless the source also provides a modeled opening-ASW minimum. The submarine snipe template
reserves LoS-capable submarine equipment slots so I-13/I-14 water reconnaissance aircraft and
submarine radar/reverse-radar gear can satisfy the guide's LoS line instead of being displaced by
all-torpedo loadouts.

Route strategy descriptions are localized in the Strategy Room when an i18n entry exists for the
selected guide route, while the sourced route description remains the fallback for untranslated
templates.

5-6 stores P1/P2/P3
air and LoS values from the supplied guide and exposes the Yui URL only on image-matched P1
transport, P2 surface, P3 normal, and P3 Fast+ carrier-four templates. 6-5 keeps the supplied
south-route air 165 LBAS plan, and 7-5 keeps only the sourced image-matched P1, P2, and P3 boss
templates.

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
keeping the search bounded. Before applying the global candidate-pool cap, named ships and ship
types required by exact/minimum constraints receive retention priority. Large accounts therefore
cannot lose a lower-scored required ship merely because unrelated high-scored ships fill the bounded
pool first. Remaining-slot pruning solves overlapping named-ship and ship-type requirements as one
combined feasibility problem, so one open slot cannot be incorrectly reserved for two incompatible
ships. Ships already assigned to KC3 fleets receive only a small convenience preference; each
actual six-ship KC3 fleet is evaluated separately as a current-loadout candidate, while legal fleet
shape and combat value remain the primary ranking criteria. When no complete fleet reaches
equipment search, the failure is reported as fleet-candidate exhaustion with those bounded
counters; air power and LoS are reported only after at least one complete gear solution has actually
been measured.
Named-ship constraints normalize common CJK variant characters such as 黒/黑, 蔵/藏, and 奥/奧
before matching KC3 ship names, so localized ship lists can satisfy Japanese guide names.
Routes that need aviation-battleship seaplane support rank those ships by generic capability:
slot count, usable aircraft slots, compatible seaplane air power, compatible seaplane LoS, and
naked LoS. This lets ships such as Ise Kai Ni or Hyuga Kai Ni naturally rank ahead on support-heavy
routes without pinning those names into the rule.
The equipment solver builds all ship slots as one resource-allocation problem. A piece of equipment
can be assigned only once, must be owned by the account, and must be compatible according to the
compatibility list captured from `KC3Master.equip_on_ship`. On routes with a reviewed air-power
minimum, aviation battleships, aviation cruisers, and seaplane tenders can allocate owned seaplane
fighters instead of assuming that only carriers can supply the required air power. Ordinary
battleships and light cruisers retain their recon/radar combat templates; merely being compatible
with a seaplane fighter no longer causes every remaining slot to be converted into air control.
When a route has a modeled Formula 33 LoS gate, reconnaissance aircraft, seaplanes, and radars are
ranked with extra LoS priority inside the same role templates. The solver therefore tries normal
combat shapes such as main-main-seaplane-seaplane, main-main-recon-radar, or
main-main-seaplane-drum before falling back to lower-value fillers, rather than stacking radars
into otherwise nonsensical loadouts just to pass a branching check.
Formula 33 validation matches KC3's current calculation for an unchanged loadout: explicit
equipment-on-ship LoS bonuses are added inside each ship's square-root contribution, while regular
and expansion-slot equipment LoS remains in the coefficient-weighted contribution. The explicit
bonus is reused only when the recommended instance IDs still match the ship's current equipment.
Equipment matching follows KC3's current master categories: seaplane fighters include category 45,
submarine torpedoes include category 32, Type 3 Shells use category 18, and AP shells use category 19. Current carrier aircraft and jet categories used by KC3 are also recognized. These mappings are
shared by every normal-map route rather than patched per map.
For the sourced 4-4 primary route, carrier slots are ranked as a flexible fleet-wide air-control
pool against the reviewed minimum of 80. Ise Kai Ni and Hyuga Kai Ni use two compatible owned
Zuiun-family aircraft in their two largest slots when available, producing a
main-main-Zuiun-Zuiun-AP-shell setup that can trigger Zuiun Multi-Angle Attack at air superiority
or better. With fewer than two compatible Zuiuns or fewer than five regular slots, the solver
keeps the ordinary main-main-recon-AP-shell shape and reports the intentional fallback instead of
adding a lone seaplane fighter.
Route-specific combat roles can add soft guide preferences without turning a named ship into a hard
requirement. For the 3-5 Yui beginner upper route, the surface escort prefers Maya-class AACI shapes
such as main gun plus high-angle/AA gun, recon, and Type 3 Shell, while the submarine pair prefers a
water fighter or seaplane followed by submarine torpedoes. If the named or ideal ships are missing,
the solver still falls back to legal compatible CA/CAV and SS/SSV choices that can satisfy the
route's air power and LoS gates.

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
only the formula family required by the route: surface power and gun fit, normal or opening ASW, or
anti-installation power. Normal ASW templates use `canDoASW()` for attack capability, while hard
opening-ASW templates additionally require `canDoOASW()` on the finished loadout. KC3's combined
equipment-total/visible-bonus result is read in one pass per stat instead of recalculating the same
bonus table separately. Resynchronizing the account replaces this cache together with the normal
recommendation cache.

The core still supports route comparison for non-UI callers that omit `routeId`: it uses a
shallower first pass, stops at the first legal fleet for each applicable route, and checks at most
six candidates when earlier candidates fail. If the pass does not produce three distinct legal
fleets, the solver falls back to the full per-route limits above. Strategy Room does not expose that
blank automatic comparison choice; its guide selector always submits the selected sourced
template's `routeId` and derives the internal objective from that template, so visible
recommendations use the full search for that guide directly. The recommendation worker is also
started during application initialization instead of on the first button press. This keeps broad
maps such as 4-5 responsive without weakening no-solution diagnostics or selected-template
recommendations.

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

For 4-5 automatic selection, three retained routes have explicit anti-installation models. The
automatic modeled templates reserve one unique owned KC3 category-18 Type 3 Shell-family item on a
compatible battleship or heavy-cruiser-class ship, except the high-air Fast+ carrier route where the
surface finisher may instead use a Type 3 Shell-family, tank, or landing-craft item so Yui's
Mogami-class two-water-fighter pattern and KCWiki's aviation-battleship substitute remain searchable.
The manual beginner final route reserves four Type 3 Shell-family items when it is explicitly
selected. Fast+ carrier variants also keep every selected carrier able to attack installations. The
high-air Fast+ carrier route assigns speed gear first, then searches the remaining carrier slots
flexibly instead of reserving the two largest slots for attackers. It keeps both air-power-first
and attack-first beam candidates, requires one land-attack-safe strike aircraft per carrier, and
only prefers additional torpedo or eligible dive bombers after the fleet reaches the route's air
minimum. The KCWiki CL1/DD3 heavy shortest template remains manually selectable, but treats anti-installation
loadout details as source advice instead of solver-only Type 3 Shell or carrier land-attack hard
requirements. Carrier models require each designated carrier to retain a land-attack-safe strike
aircraft: torpedo bombers are valid because they do not block carrier attacks against land
installations, while ordinary dive bombers are rejected unless KC3 classifies them as anti-land
capable through the dynamically updated `antiLandDiveBomberIds`. Type 3 Shell-family items are
excluded from ordinary AP-shell candidates, so they appear only when a route explicitly reserves
them for anti-installation duty. Fast+ speed gear reserves only non-protected slots, so turbines and
boilers cannot overwrite a required anti-installation surface item or carrier attack slot. If the
complete mixed setup cannot coexist with air power, LoS, speed, compatibility, and instance
uniqueness, the solver returns a specific
no-solution reason. Retained 4-5 routes that require smoke, landing craft, rockets, balloons,
long-range carrier tuning, or unmodeled opening ASW remain manual-only.

Night-carrier validation remains available for future sourced templates: a route can require at
least one carrier that KC3 identifies as able to attack at night. An inherent ship trait can satisfy
the condition without reserved equipment; otherwise the solver must assign an owned and compatible
night aircraft/personnel or ship-specific aircraft pattern. Those items share the same global slot
and instance allocation as speed and combat equipment, so a route is not shown when the complete
loadout cannot coexist.

Routes with modeled drum-canister routing reserve one owned drum on each required distinct ship.
The 2-5 northern route requires two CL/CAV drum-capable carriers and a slow fleet, then checks Cn1
LoS 49; it is eligible for automatic comparison only when the complete fixed-route setup is
available. Aviation battleships on this route reserve waterplane slots first, matching the guide
advice to use AP shells only when LoS is already sufficient. On accounts where high-airpower
seaplane fighters would clear air power but miss Cn1 49, the route prefers LoS-bearing
reconnaissance seaplanes or Zuiun-family aircraft while keeping two main guns on the relevant
surface attackers when compatible equipment exists. Missing drums or compatible carriers produce a
specific no-solution reason instead of a partial fleet. These counts follow the current
[2-5 branching guide](https://wikiwiki.jp/kancolle/%E5%8D%97%E8%A5%BF%E8%AB%B8%E5%B3%B6%E6%B5%B7%E5%9F%9F/2-5).

The retained 5-5 middle special-attack route is solver-ready for the Yui Yamato/Musashi fleet. The
fleet search recognizes Yamato Kai Ni/Juu with Musashi Kai Ni, Nagato or Mutsu Kai Ni with a
battleship helper, and Nelson or Rodney Kai with two
eligible touch helpers. It rejects fleets without a supported activator, then orders the selected
ships into the required flagship, second-ship, or Nelson Touch third/fifth positions before gear
assignment. Air power, LoS, equipment compatibility, and instance uniqueness are validated after
that ordering. The result names the attack and formation. The remaining sortie check is limited to
mutable battle state: the attack must still be unused, participating ships must remain within their
activation damage limits, and the displayed formation must be selected at the intended node.

When Strategy Room sends a selected guide template, the solver uses a fast path: it equips at most
the first six fleet candidates and stops after the first legal fleet. The IPC layer also asks KC3 to
perform exact combat reranking on at most three selected-template candidates instead of the broader
eighteen-candidate pool used for automatic route comparison.

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
installation classes. Resource use remains an estimate. Internal ranking scores are not displayed;
the Strategy Room result focuses on ships, equipment, strategy checks, and source URLs. Routes with
unmodeled LBAS, support, anti-installation, historical-bonus, or other unmodeled setup requirements
show an execution warning and the source/verification date beside the route. Modeled 4-5 mixed
anti-installation requirements instead show separate passed validations for Type 3 Shell and
carrier attack capability, while modeled 5-5 special attacks show their finalized fleet order and
one-line sortie check.

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
