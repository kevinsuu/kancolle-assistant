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

It normalizes 167 canonical strategy templates with explicit source references. A canonical
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
- <https://zekamashi.net/kancolle-kouryaku/nitieibei-batubyou/>
- <https://zekamashi.net/kancolle-kouryaku/naganami-kaini/>
- <https://kankorekore.2-d.jp/s089/>
- <https://kankorekore.2-d.jp/5-6_2nd/>

Source priority is current route data first, then dated community compositions. Chinese community
guides from 艦娘百科, Bahamut, and NGA are useful for practical fleet variants, but an older post
does not override a newer routing rule by itself. Every reviewed community variant keeps its page
URL in route metadata. NGA pages that cannot be fetched are not marked as directly verified; their
tables must be supplied or corroborated by another accessible source before being normalized.

The selectable routes prefixed with `巴哈姆特・行飛` are the 34 non-duplicate fleet skeletons
reviewed from 行飛's illustrated normal-map guide. Existing catalog compositions with the same
fleet shape were deliberately retained without a second copy. The imported variants cover 1-4
through 6-5; the supplied article only points elsewhere for 5-6 and World 7, so no unsupported
configuration was inferred for those maps. Each variant is stored directly in its map's existing
`verified-boss-fleets` or `strategy-overlays` JSON and carries its own article URL, keeping map
maintenance local without attributing the community source to unrelated routes. Image-specific
sortie requirements remain explicit: the 3-3 北方海域警備 variant preserves its required light
cruiser instead of merging it into the generic two-cruiser route; the 3-4 carrier sweep and 3-5
Hayasui fleet preserve their pictured ship-type counts; the 5-3 Mikawa variant requires four
eligible quest ships instead of relying on a matching cruiser silhouette;
both Bahamut 5-4 三一駆 quest variants enforce the M-to-P Formula 33 coefficient 2 LoS 45 gate
in addition to any listed boss air-power target;
the 3-2 速吸 fleet requires manual Fastest-speed and four-radar confirmation, while anti-installation
and LBAS routes keep manual setup warnings whenever the solver cannot fully validate the pictured
loadout.

The supplied ぜかまし 5-4 三一駆 examples add the distinct fast central fleet and the legacy upper
fleet. The 三川兼用 screenshot matches the existing Bahamut route's fleet, named-ship constraints,
and A-D-E-H-I-J-M-P routing, so its article URL is merged into that route instead of creating a
semantic duplicate. All three require 長波改二 plus one remodeled 高波, 沖波, or 朝霜. The central
route enforces Formula 33 coefficient-2 LoS 45 and advises air 65 with 142 recommended without
making air power a hard gate; the upper route enforces LoS 60 and air 320. The article marks the
upper fleet as an old, non-recommended option, and its C-node ASW loadout, formation, and AACI
remain manual sortie checks.

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
- 3-1 includes two carrier-free `日英米合同水上艦隊、抜錨せよ！` C-F-G alternatives in
  addition to its general carrier fleets. The 艦これこれくと fleet uses BBV1, CA/CAV2, CL1,
  and DD2 at air power 85; the ぜかまし fleet uses CAV1, CLT1, CL2, and DD2 at air power 45.
  Both require at least three eligible US/UK ships, and the latter also satisfies the CL condition
  for `北方海域警備を実施せよ！`. Named-ship constraints compare both KC3's localized display
  name and the canonical master-data name, so changing the KC3 language does not affect eligibility.
- 1-6 KCWiki beginner, regular, air-control, and quarterly-quest fleets. The first three use the
  fixed CL1/DD5 lower route; the quarterly AO2/DD4 fleet preserves the 75% F / 25% K split and an
  explicit random-routing warning while requiring an Akizuki-class AACI escort and another DD
  capable of opening ASW. Air-control variants check their sourced F-node thresholds.
  The Bahamut heavy quarterly fleet uses BBV2/CL1/DD-or-DE3 and hard-checks only the M-to-J Formula
  33 coefficient-3 score of 30; air power 89/177 and two opening-ASW ships remain visible advice.
- 2-1 shortest CEH boss routing with CL1/DD4/AV1 treats boss air superiority 81 as advice rather
  than an account-blocking requirement. It prefers a CL with an account-compatible midget submarine
  for opening torpedo, but retains ordinary CL fallback. Fixed instant-construction-material farming
  separately uses two CVL, three SS/SSV, and one AV.
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
high-air waterplanes in the candidate pool to reach its hard air-power 84 line. The Water
Counterattack quest fleet keeps Cn1 LoS 34 as a hard routing requirement, while boss air superiority
42 is advisory: accounts without a compatible Zara/Pola-class cruiser or waterplane still receive a
legal fleet, with a DD placed as the quest-required flagship. When KC3 reports compatible seaplanes
for an exceptional CA or CL, equipment search can use that ship-specific compatibility instead of
rejecting the aircraft by generic ship type. 3-5 lower routes
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

4-4 keeps the sourced A-E-I-K fleet skeleton and air-power minimum of 80, but allocates carrier
aircraft flexibly across the whole fleet instead of converting every carrier slot after two attack
slots into a fighter slot. When the selected battleship is Ise Kai Ni or Hyuga Kai Ni and the
account owns two compatible Zuiun-family aircraft, the primary guide route prefers the five-slot
main-main-Zuiun-Zuiun-AP-shell setup for Zuiun Multi-Angle Attack while retaining ordinary
artillery spotting. If either aircraft or the full five slots are unavailable, it falls back to a
main-main-recon-AP-shell combat setup rather than inserting a redundant seaplane fighter.

### 4-5 and 5-5 requirement review (2026-09-15)

The existing 11 templates for 4-5 and 25 templates for 5-5 were reviewed in place; no new
configurations were added. Fleet counts define the selected guide strategy, while actual routing
conditions remain mandatory. A pictured ship or equipment count is not automatically a routing rule.

| Condition    | Required for the selected route/strategy                                                                                             | Flexible advice                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Air power    | No hard air-power constraint in these two maps                                                                                       | Show actual / recommended; retain the numerical air-state line and warn below the target   |
| Routing      | Fleet composition, Fast+ where applicable, Formula 33 LoS, four distinct drum carriers in the modeled lower 5-5 route                | Source-backed substitutions within those limits                                            |
| Combat roles | Night carrier or supported special attack when integral to the selected strategy; explicitly modeled minimum anti-installation roles | Additional finishers, carrier escort-clearing roles, opening ASW, AACI, smoke, and support |
| Named ships  | Activators/helpers required by the selected special-attack template                                                                  | Mogami/Yahagi and other pictured examples where the guide permits same-type substitutes    |

Air-state lines are values **at the battle node**; sortie targets add a margin for aircraft losses.
The solver aims for the recommended value but can return a lower-air fleet with a warning. The player
can trade air control for attack power; passing the modeled minimum roles does not guarantee a kill.

#### 4-5

- H→T accepts a Fast+ fleet with battleships plus all carriers at most four, or CL1/DD3 without a
  speed or LoS requirement. K→T retains Cn2 LoS 70 at HQ level 120; the routing reference advises one
  extra point below HQ 120. The displayed threshold is the HQ-120 baseline, so check that margin
  manually on lower-level accounts.
- Boss chipping air superiority/supremacy is 207/414; the strongest final fleet is 167/333. K-node
  superiority is at most 252. Thus 215/220, 270, and 430 remain **recommendations for different
  routes**, rather than universal entry requirements. Fast+ supremacy templates can instead aim
  near 220–230 for superiority when prioritizing boss-clear firepower over farming stability.
- The beginner K-node final template accepts CA/CAV3 and requires one Type 3 Shell finisher as its
  modeled minimum. Two or three finishers are advised for the final kill and can be added manually;
  the inspected Yui image has three shell ships and one smoke specialist, not four shell ships.
- Carrier-heavy modeled templates require at most one designated anti-installation carrier. Other
  carriers may use ordinary dive bombers to clear escorts. The medium Fast+ and chip templates rely
  on their surface shell finisher and no longer require every carrier to attack the installation.
- The KCWiki small night-carrier template keeps two separate surface anti-installation ships, which
  may be compatible DD/CL using tanks or landing craft. Three opening-ASW ships are advisory; the
  guide explicitly allows reducing ASW for the final kill. The generic small/heavy CL1/DD3 templates
  retain manual anti-installation checks where their combat roles are not fully modeled.
- The Fast+ night-carrier template accepts CAV or BBV in its surface-finisher slot. The high-air
  template permits replacing one CLT with CVL when using CAV, while enforcing the four-large-ship
  limit; with BBV that extra carrier is not allowed. The medium template permits replacing CLT with
  CA/CAV for more final-kill firepower. Nelson's template accepts CA/CAV and light carriers.
- The Yui beginner chip template is chipping/balanced only. Its alternative paths are
  A-B-E-M-R-N-T and C-F-I-J-H-T; R is included and the template is no longer offered for boss-clear.

Routing and air-state checks use the
[Japanese wiki 4-5 reference](https://wikiwiki.jp/kancolle/西方海域/4-5). Combat tradeoffs and practical
air targets use [Zekamashi 4-5](https://zekamashi.net/kancolle-kouryaku/4-5/),
[KCWiki 4-5 text](https://m.kcwiki.cn/wiki/西方海域/4-5), and the visually inspected
[Yui 4-5 configurations](https://yuikancolle.blog.fc2.com/blog-entry-184.html).

#### 5-5

- O→S retains Cn2 LoS 66 and P→S Cn2 LoS 80. The middle-to-south template replaces Cn5 162 with
  Cn2 66, and the Bahamut CV4 template replaces Cn1 43 with Cn2 80. Having sufficient LoS does not
  remove the roughly one-third P-node diversion for five-or-more-large-ship or submarine fleets.
- H-node enemy air power can be 46, 125, or 204. Air 138 grants supremacy only against the weakest
  fleet; parity against the strongest needs 137, so middle templates advise 140 instead of the
  unsafe 136 or a misleading universal 138 supremacy line. H superiority against the strongest
  fleet needs 306. Nelson's 188 target covers H superiority only against the middle enemy fleet;
  it also exceeds the strongest boss parity line of 175.
- The strongest pre-clear boss needs 392 for superiority, 175 for parity, and 88 to avoid air
  incapability. Upper carrier templates advise 410 with loss margin; middle/south strategies can
  target roughly 140 or 90 and accept a lower air state. A 300/306 H-oriented setup does not promise
  superiority against the strongest boss. These values remain visible even when not achieved.
- Middle Nelson permits at most one CLT: BB2/CLT2 would instead branch B→K. The Mogami/Yahagi middle
  templates accept other CAV/CL, with opening torpedoes as a preference; their required special
  attack pair and Cn2 66 remain enforced. The upper Yamato night-carrier example treats the night
  carrier as backup-firepower advice, while explicitly night-carrier strategies keep that role.
- The lower BBV/CAV drum strategy still assigns a drum to each of four distinct ships. The wiki also
  permits four ships carrying eligible landing-craft variants, but arbitrary drum/craft mixtures
  and excluded variants are not equivalent. This template validates only the drum alternative;
  the landing-craft alternative remains a manual configuration.
- Smoke, support fleets, opening ASW, AACI, and the example count of four seaplane fighters are
  strategy advice, not universal solver rejection conditions. Damage state, formation, unused
  special-attack state, and unmodeled retreat equipment must still be checked before sortie.

Routing and air-state checks use the
[Japanese wiki 5-5 reference](https://wikiwiki.jp/kancolle/南方海域/5-5). Composition flexibility and
combat tradeoffs use [Zekamashi 5-5](https://zekamashi.net/kancolle-kouryaku/5-5/),
[KCWiki 5-5 text](https://m.kcwiki.cn/wiki/南方海域/5-5), and the visually inspected
[Yui 5-5 configurations](https://yuikancolle.blog.fc2.com/blog-entry-185.html). The historical Bahamut
first-phase heavy-fleet reference remains a manual, random-route strategy under current routing.
KCWiki's configuration image CDN returned HTTP 403 during this review; equipment corrections rely
on accessible source text and the inspected Yui images, not inferred contents of those blocked images.

5-6 exposes
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
- Formula 33 routing limits remain hard constraints. Air power is hard only when the catalog
  explicitly requires it; all 4-5 and 5-5 air-power targets are advisory.
- LBAS requirements are notes/tags and are not assigned by the current gear solver.
- Historical bonuses and quest-mandated ships are not exhaustively modeled.
- The 1-3 fuel routes calculate expected gross/net fuel with normal-node Daihatsu and drum bonuses.
  Other resource routes still do not calculate exact per-node resource bonuses and are labelled as
  cost-only estimates.

These limitations are surfaced as route-specific warnings with a direct guide link and verification
date. Internal ranking scores are not displayed; the solver does not silently invent missing game
formulas or claim that random combat outcomes are guaranteed.
