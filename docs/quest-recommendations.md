# Quest Recommendations

KC3 Strategy Room includes an independent **任務推薦** page immediately beside **流程表**. The
page lays out every synchronized, unfinished repeatable, normal one-time, or currently available
time-limited quest as a ranked operations board. The ranking follows the complete unlock chain
instead of judging only the open quest's immediate reward. Account feasibility, repeatability,
effective reward value, and task cost
come before remaining time. Plans distinguish curated candidate sorties that can be shared,
objectives that should be run in sequence, prerequisite unlocks, and compatible exercise,
expedition, or arsenal actions without hiding an open quest.

The page follows KC3's configured language and supports English (`en`), Traditional Chinese
(`tcn`), Simplified Chinese (`scn`), and Japanese (`jp`). Controls and quest descriptions remain
localized, while quest titles always use the official Japanese text. A live sync uses the title
returned by the game API; locally stored and locked planning quests use KC3's Japanese quest
metadata. The page is advisory only: it does not accept quests or change quest state. An explicit
**Sync latest status** action reads the current quest list from the game but never performs a quest
action.

## Candidate scope and synchronization

Opening **任務推薦** reads KC3's latest locally stored quest list without a network request.
Pressing **Sync latest status** explicitly requests the complete currently available quest list
from the active game session, applies it through KC3's own quest manager, and then rebuilds the
recommendations. A ranked candidate must be open or active and be either a normal one-time quest,
a currently available time-limited quest, or a KC3 daily, weekly, monthly, quarterly, or yearly
repeatable quest with a future reset timestamp.

If **Sync latest status** fails, the page automatically reads KC3's local quest snapshot once,
just as reopening the page would. It does not repeat the game API request. If local data is
available, the list appears immediately with a warning that the latest status could not be
confirmed. If that read also fails, an already displayed list is retained with the same warning;
otherwise the page shows a retryable error. Sync, ranking, and local-data failures have distinct
messages. A later successful sync clears the warning. Responses arriving after navigation are
ignored, and no background polling or automatic game requests are started.

Renderer diagnostics record `quest-recommendation.load-started`, `local-recovery-started`, and
`load-completed`, with the outcome, fallback source, candidate count, elapsed time, and error codes.
Transport exception messages and quest payloads are not logged.

Quest ranking runs in its own background worker, with a 30-second execution limit and a
separate bounded queue. A stalled ranking is terminated; the next attempt starts a fresh worker.
It never falls back to running the ranking on Electron's main thread, so ranking cannot block
KC3's network/IPC processing or other recommendation workers. This protection covers ranking;
it does not terminate KC3's renderer or reload the game.

The live game API request, including reading its response body, is bounded to ten seconds even
when the network stack does not settle after cancellation. Failure returns a sync error and
re-enables the control for retry.

On Windows, the request uses Electron's streamed `net.request` with the game session, cookies, and
proxy settings. It aborts on timeout and rejects responses above 4 MiB before parsing. This avoids
the `session.fetch` path used by the manual sync in earlier Windows builds. Malformed JSON and
unsuccessful game API responses reject the pending sync inside the response event handler,
instead of throwing an uncaught exception in Electron's main process. A failed response releases
the pending request so another click can retry.

For diagnosing a stalled manual sync, runtime logs mark the live request, the start and result of
applying the returned list through KC3, and the start and completion of the recommendation
snapshot. Ranking also emits `quest-recommendation.ranking-started`, `ranking-completed`, or
`ranking-failed`, with quest counts, elapsed time, and stable worker failure codes. A missing completion after one of these markers identifies the stage that stopped.
These records include quest counts and elapsed time, but no authentication fields or quest payloads.

Japanese quest metadata is loaded asynchronously from KC3's bundled `lang/data/jp/quests.json`,
with a separate three-second limit covering both the response and JSON body. Recommendation
snapshots do not call KC3's synchronous translation loader, which blocks the renderer and can
leave the whole Strategy Room unresponsive while the game remains operable. If metadata fails or
times out, recommendations continue with game API titles or localized cached titles; a later
refresh retries loading the Japanese metadata. This addresses a blocking path consistent with the
reported Windows freeze; Windows-specific reproduction still requires testing on an affected PC.

The page keeps synchronization provenance and current accepted-quest counts internal to the
recommendation process instead of displaying a status summary or acceptance-slot reminder. It does
not accept quests or reserve slots automatically.

The live request uses quest tab `0`, which KC3 treats as the complete available list. KC3 then
marks previously open quests missing from that list as completed, so a claimed quest disappears
after the manual sync. The game API token, version, and start time needed for this request are
captured from that game tab, retained only in process memory for at most 24 hours, and reused with
the same Electron session. They are never persisted, returned to the renderer, or logged. After a
fresh app launch, the user may need to interact with the home port once before live sync context is
available.

Completed quests are excluded from the ranked candidates. Starting from every open candidate, the
snapshot follows KC3's official `unlock` metadata for up to 12 steps and 1,024 bounded graph nodes,
which covers the current KC3 quest catalog. Locked successors are planning data rather than open
recommendations. If a future catalog exceeds the bound, the snapshot keeps all synchronized open
quests and the bounded successor data instead of failing the whole page; diagnostics mark the
successor graph as truncated. Normal one-time quests are included without a reset deadline. KC3
marks time-limited quests with title hashes. Open and active time-limited quests are included even
though KC3 does not provide dependable final end timestamps; their cards explicitly warn that the
final availability deadline is unknown. Locked time-limited successors remain excluded because an
old catalog entry alone does not prove that a seasonal quest is currently available.

KC3 calculates every reset from its own repeatable-quest rules: daily, weekly, monthly, quarterly,
and the twelve month-specific yearly types from `yearlyJan` through `yearlyDec`. Yearly types retain
their exact KC3 reset type for timestamp calculation and are displayed under one **Yearly** label.
The snapshot also reads the clear state of the seven monthly Medal Extra Operations: 1-5, 2-5, 3-5,
4-5, 5-5, 6-5, and 7-5. The page shows these only as compact map-and-status chips, such as
`1-5 Cleared` or `7-5 Not synchronized`.

## Ranking and card layout

Every eligible candidate is returned; the list is not truncated. Verified unavailable quests sort
after feasible or unknown-feasibility quests. The remaining quests use four primary value bands:

1. repeatable quest with a valuable current or locked downstream reward;
2. one-time quest with a valuable current or locked downstream reward;
3. repeatable quest with ordinary rewards;
4. one-time quest with ordinary rewards.

Within one band, the best effective reward sorts by Medal or Remodel Blueprint, Action Report,
Improvement Materials or other rare materials, then ordinary rewards. Explicit cost and account
guidance, the daily deferral, remaining reset time, current reward, progress, active status, and
quest ID act as later tie-breakers. One-time quests have no reset-time tie-breaker.

The controls above the list include a multi-select quest-type filter. **All** is the default and
places no type restriction. In this normal view every quest is shown once, even when it can advance
in several shared actions. Selecting a specific type switches the list to that type; further type
buttons can be added with OR semantics. **Combined** is an explicit group-level view: selecting it
shows every complete suggested shared-action group, regardless of its member quests' KC3 code
families, and retains the group's shared workflow. Types for individual quests follow KC3's stable
quest-code families: fleet composition (`A`), sortie (`B`), exercise (`C`), expedition (`D`), arsenal
(`F`), and modernization
(`G`). Supply or repair (`E`) quests have no dedicated type button and remain visible under
**All**. Unrecognized code families remain available under **Other**. Time-limited quests are
always placed under **Other**, even if their KC3 code resembles a normal A–G quest family, so the
type filter has one predictable location for seasonal tasks.

Independent multi-select filters cover normal-map Chapters 1 through 7. All seven chapters are
enabled by default. A sortie quest remains visible when any normal-map world it mentions is
enabled, and it appears only once even when it spans several worlds. Non-sortie quests, including
exercises and expeditions, always stay above sortie quests and are never affected by the chapter
filters. Sortie scope follows the KC3 quest-code category rather than the presence of exact map IDs;
catalog-backed broad objectives such as Bw6 inherit all five World 4 maps. They therefore stay in
the sortie priority order and respond to the correct chapter filter instead of being fixed above
the list. If a suggested combination contains both sortie and non-sortie quests, the separated
cards no longer claim that they can be completed together.

The same control area can filter for **Medal / Remodel Blueprint**, **Action Report**,
**Improvement Materials**, **equipment / materials**, and the **Flight Deck Catapult**. Reward filters are multi-select and use
OR semantics. Unlike chapter filters, reward filters apply to both sortie and non-sortie quests. A
quest matches when either its current reward or a displayed locked successor matches, so filtering
for a Medal does not hide the prerequisite needed to reach that Medal. Suggested-combination groups
appear only when **Combined** is selected, and only when every member remains visible in the same
sortie scope. A reward, type, or chapter filter that removes a member shows the remaining quests as
individual cards, so the page never claims a partial group is still a shared-action plan.

The default display order is nearest deadline first. The selector can instead order by farthest
deadline, recommendation from high to low, or fewest quest steps; recommendation is the third
option. Recommendation sorting follows the displayed tiers from Highest priority through
Unavailable now, with nearest deadline as its tie-breaker. For a suggested combination, its best
member determines the group's position under the selected mode, and its members follow that same
order. Undated one-time and time-limited quests stay after dated repeatable quests in both deadline
orders. A time-limited quest with a repeatable reset may show that reset, but still warns that its
final event end is unknown. Step sorting treats a matching current reward as zero steps and
otherwise uses the shortest displayed unlock distance to a matching successor; ties use the nearest
deadline. These controls only
reorder the synchronized result in the renderer and do not trigger another KC3 read.

The page saves the selected quest types, chapters, reward filters, and sort order in the Strategy
Room origin's local storage. Returning after switching tabs restores the last valid settings before
the quest list loads. Missing, outdated, malformed, or unavailable storage falls back to the
documented defaults without preventing recommendations from loading.

After the quest data loads, **Export MD** downloads the currently visible list with the active quest
types, chapter filters, reward filters, and sort order recorded at the top. The report includes
monthly Extra Operations, suggested-combination grouping, every visible quest's
completion conditions, guidance, rewards, locked valuable successors, deadline and priority, plus
each shared workflow's participants, fleet, maps, objectives, and instructions. Loading, failed,
and empty views keep the export action disabled so the file cannot silently contain stale or hidden
tasks.

Chapter names are shown only in the upper filter controls; the result list does not repeat chapter
section headings. This keeps the list focused on the recommended completion order while the filter
state communicates which sortie worlds are currently included.

The decorative timeline gutter is not rendered. Each quest uses the available width as three equal
information cells: completion requirements, icon-backed rewards, and deadline plus recommendation.
All controls, labels, annotations, and card content use a minimum 12px font size to match KC3's
side navigation, while quest and recommendation headings remain larger for scanning.
When a weak current quest leads to a valuable locked descendant, the reward cell lists up to three
best targets, their distance in unlock steps, and their reward icons. The recommendation reason
also states that the downstream value raised the rank.
KC3's Medal and Improvement Material images are reused directly; Action Report and miscellaneous
materials use KC3's existing seal and supply-box imagery. Reward rows retain stable visual
categories: gold for Medal or Remodel Blueprint, purple for Action Report, green for Improvement
Materials, and a neutral treatment for other materials.

| Available reward or condition                      | Guidance shown   |
| -------------------------------------------------- | ---------------- |
| Feasible repeatable Medal or Remodel Blueprint     | Highest priority |
| Feasible repeatable Action Report                  | Priority         |
| Feasible repeatable Improvement Materials          | Recommended      |
| Equivalent one-time valuable reward                | Same reward tier |
| Expensive or account-dependent objective           | Conditional      |
| Other materials or low-return objective            | Optional         |
| Missing a verified required ship or task resources | Unavailable now  |

The guidance badge reflects reward value and verified feasibility, so a one-time quest is not
downgraded solely because it has no reset deadline. Repeatability remains a separate ranking
factor: an equivalent repeatable reward still sorts ahead of its one-time counterpart through the
four primary value bands above.

Selectable rewards are marked so the page does not imply that every displayed item is received
together. KC3's structured consumable rewards provide quantities for Instant Construction
Materials, Buckets, Development Materials, and Improvement Materials. Medal, Remodel Blueprint,
Action Report, Skilled Crew, New Aviation Material, Daihatsu, New Rocket Development Material,
New Gun Armament Material, New Armament Material, Prototype Flight Deck Catapult, Reinforcement
Expansion, New Aircraft Design Blueprint, and Overseas Ship Latest Technology detection uses
KC3's localized reward memo. Missing metadata falls back to **Other materials**. The listed rare
materials count as valuable for the four-band ranking; ordinary structured consumables are shown
but do not receive the rare-material ranking boost. A locked descendant lends its best reward
category to an open prerequisite, but an already-open or completed descendant does not: it ranks
independently and cannot duplicate its value across another open branch.

The account-aware phase covers requirements that materially change the reference plan:

- Bq13 requires a Yuubari Kai Ni-class ship or Yura Kai Ni;
- Bq6 requires Naganami Kai Ni plus an eligible Takanami, Okinami, or Asashimo remodel;
- Fq3 requires 18,000 steel.

Bq13 and Bq6 remain visible with a missing-ship reason. Fq3 is conditional when affordable and
unavailable when synchronized steel is below its cost. Bm2, Bq8, Z Operation Latter Part, and other
curated high-cost objectives receive low-return or high-cost guidance from the reference plan.

## Planned quest relationships

A **Suggested combination** is one concrete shared action for at least two currently open or
active quests under the curated objective conditions:

- **Same sortie** means one fleet and result can advance every listed objective when its ship,
  equipment, routing, and battle-result conditions are all met.
- **Same exercise** means one exercise with the strictest displayed fleet and victory-rank
  conditions advances every listed objective.
- **Same expedition** means at least one expedition ID is counted by every listed objective.
- **Same arsenal action** means one verified development, construction, or equipment-discard
  action advances every listed objective.
- **Run in sequence** means the same area should be completed in order with separate fleets.
- **Successor unlock** means a later node is not available until its prerequisite is completed.

Every combination is advisory: the compatibility solver does not read a player's equipment,
line-of-sight, speed, route, or remaining acceptance slots. The plan panel and Markdown export
therefore ask the player to verify those conditions before sortie.

## Co-completion verification status

Each plan stage makes the scope of its evidence explicit. This avoids treating a shared map as a
guaranteed shared sortie:

- **Condition match — sortie** means the synchronized objective catalog and fleet solver found a
  common map and a compatible fleet profile. The player must still verify route, speed,
  line-of-sight, air power, equipment, and owned ships.
- **Condition match — exercise** means the exercise fleet profiles match; victory rank and owned
  ships still need player confirmation.
- **Shared action profile matches** applies to expedition and arsenal actions whose registered
  action profile overlaps. Accepted state and the remaining completion conditions remain the
  player's responsibility.
- **Workflow guidance** identifies unlock and sequence steps. It intentionally does not claim a
  single action completes the listed objectives.

This first evidence layer is deliberately conservative. It records what the current solver has
actually checked; source provenance, route and equipment feasibility, and cost-aware plan ranking
are later phases rather than implied verification.

Locked successors and Extra Operation objectives remain planning context. They do not turn a
single current quest into a one-item **Suggested combination**; valuable locked successors stay in
the quest card's downstream-reward section until they become available.

Different shared actions are always separate groups, even when a repeatable counter can progress
in more than one of them. The repeated quest appears in each relevant group and the group heading
identifies that it also progresses elsewhere; it is not silently hidden as an alternative. A group
uses its nearest finite member reset; one-time nodes retain no deadline.

An **Alternative co-completion plan** is shown only when it adds a distinct shared action. A pair
that is already fully contained in a displayed group with the same action scope is omitted from
both the card and Markdown export, because the larger group already presents that plan.

The first phase of curated plans covers:

| Plan                                | Relationship coverage                                  |
| ----------------------------------- | ------------------------------------------------------ |
| Bd1 / Bd2 / Cm1 / Bm8               | Daily prerequisites into the monthly Bm8 plan          |
| Bm5 / Bq8 / Bw10 / Bw5 / 1-5 EO     | Same-sortie 1-5 milestones                             |
| Bm8 / Bq9 / Bq11 / Bm3 / Bm6 / Bq12 | Dynamic shared maps, Bm8 → Bq11 → Bq12, 4-2 and 4-5 EO |
| Bm1 / Bm7 / 2-5 EO                  | Same-area sequence with separate required fleets       |
| Bq1 / Bq2 / Bq3 / Bq4               | 2-4 shared sortie, Bq3 → Bq4, then 6-3 shared sortie   |
| Bq5 / Bq6                           | Medal → Action Report unlock chain                     |
| Bm4 / Bq7 / Bq13                    | Verified 5-1 combinations when Bq13 is feasible        |

Unlock and sequence rules remain curated because a shared map cannot prove that two objectives are
simultaneously available. Bm8 unlocks Bq11, so they are shown as sequential unlock nodes rather
than a false simultaneous pair. Bm8+Bq9 uses 1-3/1-4/2-1, while Bq9+Bq11 uses
1-4/2-1/2-2/2-3. The two 2-5 monthlies keep separate fleets and are explicitly labeled as a
sequence. The prerequisite flow also carries Bd1 → Bd2 → Cm1 → Bm8 forward; Cm1's seven exercise
wins must still be completed within one quest day even though Cm1 itself is monthly.

Sortie, exercise, expedition, and arsenal combinations share one bounded compatibility engine.
Each category supplies only its atomic objectives and category-specific compatibility check: maps
and fleet constraints for sorties, fleet constraints for exercises, mission IDs for expeditions,
and verified operations or equipment for arsenal quests. The common engine handles open-quest
selection, combination search, caching, the five-quest bound, participant metadata, and plan
de-duplication. Changes to those shared rules therefore apply to all four categories at once.

Co-completion is not treated as transitive. If quest A intersects quest B on 3-3 and quest A
intersects quest C on 1-3, but all three have no common map, the board shows two groups: A+B on
3-3 and A+C on 1-3. Quest A appears in both groups because each requires a distinct action; the
board never implies that one sortie advances the entire connected set. The Markdown export
preserves the same separate groups.

The fleet adapter intersects the action and maps, merges flagship and second-ship requirements,
minimum or maximum ship-type counts, named-ship groups, allowed ship types, and exclusions, then
searches for a legal fleet of at most six ships. A common map alone is insufficient: incompatible
flagship, ship-count, or exclusion rules keep the quests separate. This check also gates every
curated **Same sortie** stage; if one listed quest has no verified sortie-fleet profile, the stage
is withheld rather than inferred from the shared map. B21 and B37 include their four named
destroyers, so each can share 3-1 with Bq5 and B162 while remaining incompatible with By11 and
with each other because the combined named-ship minimum would exceed six ships.

The objective catalog contains only verified synchronized-exercise and normal-map sortie profiles.
New profiles use the same data shape and become eligible for every compatible combination
automatically. Unprofiled exercise and sortie quests remain standalone instead of being guessed
from broad text or category alone. Generic expedition counters still share any success, while
specific expedition quests group only when their mission-ID sets intersect.

Arsenal groups combine verified development and construction pairs with equipment discards whose
type or exact master item advances every grouped quest. Exact-item and exceptional rules remain
curated. Generic discard categories are also derived conservatively from KC3's Japanese quest
metadata, so a newly added arsenal quest can join compatible groups without waiting for a numeric-ID
catalog update. Bounded discard clauses are accepted on either side of the discard verb, with or
without Japanese quotation marks; parsing stops before preparation verbs so completion supplies are
not treated as shared discards. For example, F119 and F131 share their medium-caliber main-gun
discards, while F90, F92, F68, and F108 share discarded 14cm Single Gun Mounts as medium-caliber
main guns.

## Data boundary and diagnostics

The KC3 snapshot reads locally stored quest identities, KC3 successor IDs and time-limited hashes,
seven EO clear states, owned ship master IDs needed for feasibility checks, current steel for the
Fq3 threshold, and the aggregate active-quest count. It retains an in-memory timestamp only after
the current loaded game tab has explicitly synchronized the game quest list. The renderer receives
only bounded quest fields, processed current and downstream reward flags, compact plan participants,
EO states, the active count, synchronization source, and aggregate counts. Raw reward memos,
unlock arrays, and consumable arrays are removed from open recommendation objects after
classification. The bridge does not expose cookies, credentials, or a complete account snapshot.

Runtime diagnostics use the following structured events:

- `quest-recommendation.live-sync-completed` records the selected game web-contents ID, returned
  quest count, elapsed time, and success outcome without authentication data;
- `quest-recommendation.live-sync-failed` and the bounded context-capture failure event record a
  stable context, network, timeout, or response reason code plus a sanitized message, without
  request bodies or authentication data;
- `quest-recommendation.snapshot-completed` records the snapshot source and, when available, its
  in-memory game synchronization timestamp; synchronized, open, active, one-time, time-limited,
  graph, locked and successor planning-node counts; supported KC3 repeatable-type count; aggregate
  account availability and ship count; the seven synchronized EO states; aggregate game-API,
  Japanese-metadata, and localized-fallback title counts; and stable reason codes when bounded
  planning data is incomplete or Japanese title metadata is unavailable (including
  `KC3_QUEST_METADATA_TIMEOUT` and `KC3_QUEST_METADATA_LOAD_FAILED`); metadata errors use fixed
  messages without resource URLs or raw exception details;
- `quest-recommendation.completed` records per-period, time-limited, and per-chapter candidate and
  group counts, the grouping mode, and how many quests and groups overlap across distinct
  simultaneous actions,
  the four value bands, ranking and daily tie-break modes, reward order, downstream-boosted and
  unavailable counts, objective-profiled quest and solver-derived group counts, curated
  same-sortie stages withheld by missing or incompatible fleet profiles (including stable reason
  counts), relation-kind and available-EO counts, and up to ten leading quest IDs with their periods,
  guidance tiers, value bands and effective-reward sources, selected plan IDs, ranking version, and
  elapsed time;
- `quest-recommendation.failed` records the stable `KC3_QUEST_DATA_UNAVAILABLE` reason code and a
  sanitized error message;
- `quest-recommendation-settings-read` and `quest-recommendation-settings-write` record whether
  settings were restored, saved, or replaced by defaults, along with filter counts, sort mode, and
  a stable reason code for invalid or unavailable storage.

Diagnostics are aggregate and bounded; they do not log the full quest list, ship roster, or raw
resource snapshot.

## Domain boundary

Quest ranking and synergy rules are owned by `recommendation-core/src/quests`; the shell adapter
continues to read KC3 data and render the existing results. This separation preserves the current
ranking and grouping behavior while allowing the domain rules to run without Electron or KC3 globals.
