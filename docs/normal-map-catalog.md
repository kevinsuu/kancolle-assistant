# Normal Map Strategy Catalog

## Coverage

The catalog contains all 37 normal maps available on 2026-08-29:

```text
1-1 .. 1-6
2-1 .. 2-5
3-1 .. 3-5
4-1 .. 4-5
5-1 .. 5-6
6-1 .. 6-5
7-1 .. 7-5
```

It normalizes 158 canonical strategy templates with explicit source references. A canonical
template represents a different routing condition, phase, or gameplay objective; swapping one ship
for another of the same accepted type does not create another template. Unsourced resource,
leveling, or broad heuristic templates are omitted until a direct guide or map reference is added.

The recommendation-core test suite locks the current map and route counts, rejects duplicate route
IDs and normalized semantic duplicates, and validates every objective and fleet constraint before
solver refactors are accepted. It also requires every retained JSON route to have either a
map-level or route-level source before normalization. Complete route metadata keeps direct English
Kancolle Wiki, Chinese KCWiki, and Bahamut reference URLs for its map; the map selector and
renderer expose only the guide URLs used by the current selection or active plan. EO templates
additionally keep the relevant Yui image-guide URL when one is available. A capable-account
regression also generates the primary balanced route for every one of the 37 maps, preventing a
valid multi-constraint fleet from being lost to bounded search.

## Sources

The older broad boss-routing dataset has been removed from runtime and is no longer vendored in the
normal-map rules. Map options and recommendations are built only from reviewed normal-map guide
skeletons, current X-5 overlays, and the separately reviewed 5-6 phase catalog.

The overlay catalog cross-checks current map and farming guidance from:

- <https://en.kancollewiki.net/>
- <https://zekamashi.net/kancolle-kouryaku/>
- <https://wikiwiki.jp/kancolle/>
- <https://zh.kcwiki.cn/>
- <https://forum.gamer.com.tw/C.php?bsn=24698&snA=14238>
- <https://forum.gamer.com.tw/Co.php?bsn=24698&sn=93259>
- <https://yuikancolle.blog.fc2.com/>
- <https://zekamashi.net/category/kancolle-kouryaku/sigenkasegi/>
- <https://kankorekore.2-d.jp/5-6_2nd/>

Source priority is current route data first, then dated community compositions. Chinese community
guides from 艦娘百科, Bahamut, and NGA are useful for practical fleet variants, but an older post
does not override a newer routing rule by itself. Every reviewed community variant keeps its page
URL in route metadata. NGA pages that cannot be fetched are not marked as directly verified; their
tables must be supplied or corroborated by another accessible source before being normalized.

The selectable routes prefixed with `巴哈姆特・行飛` are the 30 non-duplicate fleet skeletons
reviewed from 行飛's illustrated normal-map guide. Existing catalog compositions with the same
fleet shape were deliberately retained without a second copy. The imported variants cover 1-4
through 6-5; the supplied article only points elsewhere for 5-6 and World 7, so no unsupported
configuration was inferred for those maps. Each variant is stored directly in its map's existing
`verified-boss-fleets` or `strategy-overlays` JSON and carries its own article URL, keeping map
maintenance local without attributing the community source to unrelated routes. Image-specific
sortie requirements remain explicit:
the 3-2 速吸 fleet requires manual Fastest-speed and four-radar confirmation, while anti-installation
and LBAS routes keep manual setup warnings whenever the solver cannot fully validate the pictured
loadout.

5-6 was added after the base dataset. Its three phases are curated separately and marked
`experimental` because routing and preferred compositions are still being refined by the
community.

## Objectives

```text
balanced
boss-clear
low-cost
leveling
resource-fuel
resource-bauxite
resource-burner
```

These remain catalog and solver contexts. Strategy Room no longer renders a separate objective
selector; it derives the internal objective from the selected sourced guide template.

Notable overlays include:

- 1-3 fuel farming with AO or AV.
- 1-6 KCWiki beginner, regular, air-control, and quarterly-quest fleets. The first three use the
  fixed CL1/DD5 lower route; the quarterly AO2/DD4 fleet preserves the 75% F / 25% K split and an
  explicit random-routing warning. Air-control variants check their sourced F-node thresholds.
- 2-1 fixed instant-construction-material farming with two CVL, three SS/SSV, and one AV.
- 2-2 carrier leveling, C-B-A bauxite/transport farming, carrier-submarine transport farming, and
  a manually selectable 6SS low-cost random route.
- 1-5 and 2-2 leveling.

## Extra Operations

For basic boss objectives, automatic Top 3 first compares routes that pass the complete solver-ready
audit. If a map has none, it falls back to its calculable reviewed templates instead of requiring a
manual route selection. Inherently random maps such as 1-1 and 4-3 therefore return a fleet with a
probability warning rather than presenting the route as guaranteed; routes with unresolved LBAS,
smoke, or other sortie setup similarly retain explicit warnings. The ranking pass first selects the
best fleet from distinct route templates, then fills remaining slots with fleet variants only when
fewer than three distinct legal routes exist.

The 1-5 through 7-5 overlays were rechecked against the current per-map Kancolle Wiki, 艦娘百科,
Bahamut, and supplied Yui image guides on 2026-08-29. They replace the older vendored X-5 routes
instead of being merged with them, so Top 3 cannot select a stale duplicate. Every normal-map
template retains its direct guide links in metadata. Fixed compositions use exact ship-type counts;
flexible compositions separately record their allowed types and minimum/maximum counts. 3-3 includes
both KCWiki A-C-G-M variants, one with CV/CVB + CVL and one with CV/CVB + battleship-class.

For 1-5, the balanced objective is limited to the four-DE or DD/DE light fleets, while the
one-BBV/two-CL/one-DD fleet remains available under boss clear. The sourced 2-5 guide templates now
include `萌新中路-推圖推薦`, `老提督-中路洗地流`, and `萌新-上路航戰流`, alongside the existing
`第五戰隊` task fleet. Both middle routes use the fixed C-E-I-O all-fast fleet with one CV/CVB, one
CVL, one CL, three DD, Cn1 LoS 34, and boss air 42/84. The veteran route accepts an ordinary CV/CVB;
a night carrier and opening-torpedo CL are guide options rather than hard requirements. The upper
aviation-battleship route follows the KCWiki shape with
BBV3, CA/CAV2-3, optional CL1, at least two CL/CAV drum-capable carriers, a slow fleet, Cn1 LoS 49,
and boss air 42/84. Upper-route templates keep aviation battleships on waterplane-first loadouts
before AP shells so low-LoS accounts can satisfy the guide line, and Fifth Squadron keeps enough
high-air waterplanes in the candidate pool to reach its hard air-power 84 line. 3-5 lower routes
check air 1 and Cn4 LoS 28, while the Yui
beginner upper image is fixed to three regular/armored carriers and three aviation cruisers. The
KCWiki/Yui upper carrier route remains three regular/armored carriers, one CA/CAV, and two SS/SSV,
with air power 420 and Cn4 LoS 40 as hard gates; the former rule that allowed one battleship plus
two carriers was removed.

4-1 keeps the existing guide-primary fleet and adds the two 艦娘百科 compositions as selectable
alternatives. `KCWiki・常規配置` uses one regular/armored carrier, two aviation cruisers, one
light cruiser, and two destroyers on A-B-D-H-J / C-F-D-H-J. `KCWiki・常規配置改` uses one
regular carrier, one battleship-class ship, one heavy/aviation cruiser, one torpedo cruiser, and
two destroyers on A-B-D-G-J / C-F-D-G-J to avoid the H-node flagship Ri-class ships. Both check
the sourced J-node air-control line of 36 for air superiority and 72 for air supremacy.

4-2 keeps the two 艦娘百科 guide fleets as separate Strategy Room options. The regular route uses
two carriers, one torpedo cruiser, one light cruiser, and two destroyers on
A-C-L / A-E-G-L / B-D-C-L. The transport-weekly route uses two carriers, one battleship or aviation
battleship, one aviation cruiser, and two destroyers, with the listed
A-C-L / A-C-G-L / A-E-G-L / B-D-C-L / B-D-C-G-L / B-D-H-G-L route set.

The 4-5 catalog distinguishes the image-matched CVL/CV/CL/DD3 shortest route at air 215, beginner
chip route at air 220, Fast+ medium/high-air routes at air 220/430, and beginner K-node smoke final
route at air 270 plus Cn2 LoS 70. Its modeled heavy and carrier routes validate unique Type 3 Shell
assignments, while the high-air Fast+ carrier route accepts a Type 3 Shell-family, tank, or
landing-craft surface finisher and prioritizes water fighters on the remaining aviation
cruiser/battleship slots. After reserving Fast+ gear, that high-air route flexibly places one
land-attack-safe strike aircraft per carrier, fills air power to 430, and then uses remaining
capacity for the strongest compatible torpedo or eligible dive bombers instead of locking two
large slots to attackers. The KCWiki CL/DD heavy shortest route remains selectable as a sourced
manual-combat template with air power 215, but it no longer adds solver-only Type 3 Shell or
land-attack carrier requirements beyond the guide fleet shape. Carrier-heavy variants also exclude
ordinary dive bombers that would prevent attacks against land installations.

The catalog also exposes the four KCWiki image headings requested for 4-5 as distinct route
options: `高速＋夜母配置（正攻／撈油／戰果衝刺）` (2CV/CVB, 1CVL, 2CLT, 1BBV; Fast+, night carrier,
air 414), `夜母小船配置` (2CVL, 1CL, 3DD; night carrier, air 207, three opening ASW and two
anti-installation surface ships), `高速＋特攻配置` (Nelson Kai, 3CV/CVB, 1CA, 1CLT; Fast+,
Nelson Touch and air 207), and `繞路配置` (1FBB, 2CV/CVB, 1CL, 2DD; air 207 and chipping only).
All four retain the KCWiki page as their sole source and keep their source-specific fleet ratios
separate from the existing Yui templates.

The 5-5 catalog keeps sourced Yui templates plus current KCWiki alternatives. The Strategy Room list
now includes the KCWiki headings `潜艇配置`, `上路武大夜母配置`, `上路帶路配置`, `上路納爾遜`,
`上路夜母`, `上路金剛改二丙`, `上路隨機配置1`, `上路隨機配置2`, `中路武大拉煙流`,
`中路武大最矢流`, `中路水雷退避流`, `中路武大補給流`, `中路納爾遜`, `中轉下摸流`,
`中路重巡配置`, `下路武大4DD`, `下路夜母2CV4DD`, `下路航戰航巡`, and `下路長陸4DD`, alongside
the existing Yui `常規EO/中路戰巡流`, `補給王煙流`, and `新手長陸`. Upper-route templates check
Cn2 LoS 80 and the current boss air-control line; middle and lower-route templates use their
route-specific Cn2/Cn5 LoS and H/Boss air thresholds. The Bahamut 2014 composition is treated as
historical first-phase heavy-fleet advice and is not marked as a fixed current route. 5-6 exposes
the Yui URL only on image-matched P1 transport, P2 surface, P3 normal, and P3 Fast+ carrier-four
templates. The 6-5 south route records the supplied air 165 LBAS plan, and the 7-5 catalog
separately exposes only the sourced P1, P2, and P3 boss templates, with P3 checking Cn4 LoS 59.

Multi-phase maps expose sourced guide templates in Strategy Room. Selecting a template constrains
the solver to that phase/template, derives the internal objective from that template, and shows only
that template's guide URLs in the expandable data status row. The core API still supports automatic
comparison as a fallback for callers that omit a route id, but the Strategy Room UI no longer
exposes a blank automatic-route option or a separate objective selector.
Selected guide templates use a faster one-result path and aviation-battleship support ships are
ranked by slot count, aircraft capacity, compatible seaplanes, and LoS rather than by hard-coded
ship names.

## Known limitations

- Fast+ routes reserve exact account-owned speed equipment, include compatible opened expansion
  slots, and hard-validate the finished fleet speed. Fastest remains a catalog-only tag where used.
- Night-carrier routes require a KC3-recognized inherent ship capability or an assignable owned
  night-aircraft setup before they can produce a recommendation.
- Numeric air-power and Formula 33 limits are hard constraints only where the source supplied a
  reviewed value.
- LBAS requirements are notes/tags and are not assigned by the current gear solver.
- Historical bonuses and quest-mandated ships are not exhaustively modeled.
- The 1-3 fuel routes calculate expected gross/net fuel with normal-node Daihatsu and drum bonuses.
  Other resource routes still do not calculate exact per-node resource bonuses and are labelled as
  cost-only estimates.

These limitations are surfaced as route-specific warnings with a direct guide link and verification
date. Internal ranking scores are not displayed; the solver does not silently invent missing game
formulas or claim that random combat outcomes are guaranteed.
