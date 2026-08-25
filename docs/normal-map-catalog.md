# Normal Map Strategy Catalog

## Coverage

The catalog contains all 37 normal maps available on 2026-08-25:

```text
1-1 .. 1-6
2-1 .. 2-5
3-1 .. 3-5
4-1 .. 4-5
5-1 .. 5-6
6-1 .. 6-5
7-1 .. 7-5
```

It normalizes 110 canonical strategy templates. A canonical template represents a different routing
condition, phase, or gameplay objective; swapping one ship for another of the same accepted type
does not create another template.

The recommendation-core test suite locks the current map and route counts, rejects duplicate route
IDs and normalized semantic duplicates, and validates every objective and fleet constraint before
solver refactors are accepted. It also requires every template to retain the direct Kancolle Wiki
page for its map, so the UI can expose the current routing reference rather than an untraceable
composition.

## Sources

Base boss-routing constraints are vendored from the MIT-licensed
`shichiria/kancolle-browser/src-tauri/data/map_recommendations.json`, last updated on 2026-03-02.
The original license is retained next to the JSON.

The overlay catalog cross-checks current map and farming guidance from:

- <https://en.kancollewiki.net/>
- <https://wikiwiki.jp/kancolle/>
- <https://m.kcwiki.cn/>
- <https://forum.gamer.com.tw/B.php?bsn=24698>
- <https://zekamashi.net/category/kancolle-kouryaku/sigenkasegi/>
- <https://kankorekore.2-d.jp/5-6_2nd/>

Source priority is current route data first, then dated community compositions. Chinese community
guides from 艦娘百科, Bahamut, and NGA are useful for practical fleet variants, but an older post
does not override a newer routing rule by itself. Every reviewed community variant keeps its page
URL in route metadata. NGA pages that cannot be fetched are not marked as directly verified; their
tables must be supplied or corroborated by another accessible source before being normalized.

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
resource-ammo
resource-steel
resource-bauxite
resource-bucket
resource-devmat
```

Notable overlays include:

- 1-3 fuel farming with AO or AV.
- 1-4 steel farming.
- 2-2 carrier leveling and bauxite farming.
- 2-4 bucket and development-material farming.
- 3-2 ammunition farming.
- 4-3 and 7-4 fuel/bauxite farming.
- 6-3 aerial-reconnaissance material farming.
- 1-5, 5-2, 5-3, 5-5, 6-5, 7-4, and 7-5 leveling.

## Extra Operations

For boss objectives, maps ending in `-5` only expose routes marked `stableBoss` to automatic Top 3
selection. The ranking pass first selects the best fleet from distinct route templates, then fills
remaining slots with fleet variants only when fewer than three distinct legal routes exist.

The 1-5 through 7-5 overlays were rechecked against the current per-map Kancolle Wiki and 艦娘百科
guides on 2026-08-25. They replace the older vendored X-5 routes instead of being merged with them,
so Top 3 cannot select a stale duplicate. Every non-leveling X-5 template retains both guide links
in its metadata. Fixed compositions use exact ship-type counts; flexible compositions separately
record their allowed types and minimum/maximum counts.

For 1-5, the balanced objective is limited to the four-DE or DD/DE light fleets, while the
one-BBV/two-CL/one-DD fleet remains available under boss clear. The 2-5 and 3-5 routes carry their
reviewed route-specific air-power thresholds. The 4-5 catalog distinguishes the two-DD light fleet
that goes through K from the three-DD fleet that goes directly from H to T and retains the Fast+
night-carrier/torpedo-cruiser composition. The stable 5-5 north routes now use exact two-BB/two-CV
cores, and the AO middle route records its H-node smoke-screen requirement. The 6-5 north route is
the exact one-BB/two-CV/CA-class/CL-or-CLT/DD recommendation, with LBAS-adjusted air-power targets.
The 7-5 catalog separately exposes P1, both M-node gimmick fleets, the fast CVL P2 fleet, and P3.

Multi-phase maps expose a route/phase selector in Strategy Room. Selecting automatic comparison
allows cross-route Top 3; selecting a route constrains the solver to that phase/template.

## Known limitations

- Fast+ and Fastest tags are recorded, but final equipment-dependent speed validation is not yet
  implemented for every map.
- Numeric air-power and Formula 33 limits are hard constraints only where the source supplied a
  reviewed value.
- LBAS requirements are notes/tags and are not assigned by the current gear solver.
- Historical bonuses and quest-mandated ships are not exhaustively modeled.
- The 1-3 fuel routes calculate expected gross/net fuel with normal-node Daihatsu and drum bonuses.
  Other resource routes still do not calculate exact per-node resource bonuses and are labelled as
  cost-only estimates.

These limitations are surfaced as route-specific warnings with a direct guide link and verification
date. The `/100` result is suitability, not win probability; the solver does not silently invent
missing game formulas or claim that random combat outcomes are guaranteed.
