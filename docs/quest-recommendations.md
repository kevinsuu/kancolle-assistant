# Quest Recommendations

KC3 Strategy Room includes an independent **任務推薦** page immediately beside **流程表**. The
page lays out every synchronized, unfinished repeatable or normal one-time quest as a ranked
operations board. The ranking follows the complete unlock chain instead of judging only the open
quest's immediate reward. Account feasibility, repeatability, effective reward value, and task cost
come before remaining time. Plans distinguish sorties that can be shared, objectives that should
be run in sequence, prerequisite unlocks, and verified shared exercise, expedition, or arsenal
actions without hiding an open quest.

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
recommendations. A ranked candidate must be open or active and be either a normal one-time quest
or a KC3 daily, weekly, monthly, quarterly, or yearly repeatable quest with a future reset
timestamp.

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
marks time-limited quests with title hashes; those quests remain excluded because KC3 does not
provide dependable end timestamps for them.

KC3 calculates every reset from its own repeatable-quest rules: daily, weekly, monthly, quarterly,
and the twelve month-specific yearly types from `yearlyJan` through `yearlyDec`. Yearly types retain
their exact KC3 reset type for timestamp calculation and are displayed under one **Yearly** label.
The snapshot also reads the clear state of the seven monthly Medal Extra Operations: 1-5, 2-5, 3-5,
4-5, 5-5, 6-5, and 7-5.

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

The controls above the list include independent, multi-select filters for normal-map Chapters 1
through 7. All seven chapters are enabled by default. A sortie quest remains visible when any
normal-map world it mentions is enabled, and it appears only once even when it spans several
worlds. Non-sortie quests, including exercises and expeditions, always stay above sortie quests and
are never affected by the chapter filters. If a suggested combination contains both sortie and
non-sortie quests, the separated cards no longer claim that they can be completed together.

The same control area can filter for **Medal / Remodel Blueprint**, **Action Report**,
**Improvement Materials**, and **equipment / materials**. Reward filters are multi-select and use
OR semantics. Unlike chapter filters, reward filters apply to both sortie and non-sortie quests. A
quest matches when either its current reward or a displayed locked successor matches, so filtering
for a Medal does not hide the prerequisite needed to reach that Medal. The filtered cards remain
inside their suggested combination group when every member is in the same sortie scope.

The default display order is nearest deadline first. It can be changed to farthest deadline first
or fewest quest steps first. Undated one-time quests stay after dated repeatable quests in both
deadline orders. Step sorting treats a matching current reward as zero steps and otherwise uses the
shortest displayed unlock distance to a matching successor; ties use the nearest deadline. These
controls only reorder the synchronized result in the renderer and do not trigger another KC3 read.

After the quest data loads, **Export MD** downloads the currently visible list with the active
chapter filters, reward filters, and sort order recorded at the top. The report includes the status
summary, monthly Extra Operations, suggested-combination grouping, every visible quest's completion
conditions, guidance, rewards, locked valuable successors, deadline and priority, plus each shared
workflow's participants, fleet, maps, objectives, and instructions. Loading, failed, and empty views
keep the export action disabled so the file cannot silently contain stale or hidden tasks.

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
| Equivalent one-time valuable reward                | One tier lower   |
| Expensive or account-dependent objective           | Conditional      |
| Other materials or low-return objective            | Optional         |
| Missing a verified required ship or task resources | Unavailable now  |

Selectable rewards are marked so the page does not imply that every displayed item is received
together. Improvement Material quantity comes from KC3's structured consumable rewards. Medal,
Remodel Blueprint, Action Report, Skilled Crew, New Aviation Material, Daihatsu, and New Rocket
Development Material detection uses KC3's localized reward memo. Missing metadata falls back to
**Other materials**. Skilled Crew, New Aviation Material, Daihatsu, and New Rocket Development
Material also count as valuable for the four-band ranking. A locked descendant lends its best
reward category to an open prerequisite, but an already-open or completed descendant does not: it
ranks independently and cannot duplicate its value across another open branch.

The account-aware phase covers requirements that materially change the reference plan:

- Bq13 requires Yuubari Kai Ni, Kai Ni Toku, or Kai Ni Tei;
- Bq6 requires Naganami Kai Ni plus an eligible Takanami, Okinami, or Asashimo remodel;
- Fq3 requires 18,000 steel.

Bq13 and Bq6 remain visible with a missing-ship reason. Fq3 is conditional when affordable and
unavailable when synchronized steel is below its cost. Bm2, Bq8, Z Operation Latter Part, and other
curated high-cost objectives receive low-return or high-cost guidance from the reference plan.

## Planned quest relationships

A **Suggested combination** becomes one branch group only when at least two currently open or
active quests have a useful relationship:

- **Same sortie** means one fleet and result can advance every listed objective.
- **Same exercise** means one exercise with the strictest displayed fleet and victory-rank
  conditions advances every listed objective.
- **Same expedition** means at least one expedition ID is counted by every listed objective.
- **Same arsenal action** means one verified development, construction, or equipment-discard
  action advances every listed objective.
- **Run in sequence** means the same area should be completed in order with separate fleets.
- **Successor unlock** means a later node is not available until its prerequisite is completed.

Locked successors and Extra Operation objectives remain planning context. They do not turn a
single current quest into a one-item **Suggested combination**; valuable locked successors stay in
the quest card's downstream-reward section until they become available.

Every ranked repeatable or one-time quest appears once. When plans overlap, the highest-ranked
ungrouped quest selects the plan containing the most ungrouped ranked quests, then the most
companion objectives and the highest curated plan priority. Weekly quests that reset before
monthly or quarterly companions can anchor the same combination, so they are not duplicated as
standalone nodes. A group uses its nearest finite member reset; one-time nodes retain no deadline.

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

Exercise and normal-map sortie combinations use a fleet-constraint solver rather than a table of
quest pairs. Each profiled quest contributes only its own atomic facts: action type, eligible maps,
flagship and second-ship requirements, minimum or maximum ship-type counts, named-ship groups,
allowed ship types, and exclusions. The solver intersects the action and maps, merges those facts,
and searches for a legal fleet of at most six ships. It can therefore discover combinations of two
restricted exercise quests or up to five accepted quests without a separate entry for every pair
or stack. A common map alone is insufficient: incompatible flagship, ship-count, or exclusion
rules keep the quests separate.

The objective catalog currently covers the synchronized exercise profiles and the normal-map
sortie profiles used by the recommendation plans. New profiles use the same data shape and become
eligible for every compatible combination automatically. Unprofiled or newly added quests remain
standalone instead of being guessed from broad text or category alone. Generic expedition counters
still share any success, while specific expedition quests group only when their mission-ID sets
intersect. Arsenal groups cover verified development and construction pairs, plus equipment
discards whose type or exact master item advances every grouped quest.

## Data boundary and diagnostics

The KC3 snapshot reads locally stored quest identities, KC3 successor IDs and time-limited hashes,
seven EO clear states, owned ship master IDs needed for feasibility checks, and current steel for
the Fq3 threshold. The renderer receives only bounded quest fields, processed current and
downstream reward flags, compact plan participants, EO states, and aggregate counts. Raw reward
memos, unlock arrays, and consumable arrays are removed from open recommendation objects after
classification. The bridge does not expose cookies, credentials, or a complete account snapshot.

Runtime diagnostics use the following structured events:

- `quest-recommendation.live-sync-completed` records the selected game web-contents ID, returned
  quest count, elapsed time, and success outcome without authentication data;
- `quest-recommendation.live-sync-failed` and the bounded context-capture failure event record a
  stable context, network, timeout, or response reason code plus a sanitized message, without
  request bodies or authentication data;
- `quest-recommendation.snapshot-completed` records synchronized, open, one-time, time-limited,
  graph, locked and successor planning-node counts; supported KC3 repeatable-type count; aggregate
  account availability and ship count; the seven synchronized EO states; aggregate game-API,
  Japanese-metadata, and localized-fallback title counts; and stable reason codes when bounded
  planning data is incomplete or Japanese title metadata is unavailable;
- `quest-recommendation.completed` records per-period and per-chapter candidate and group counts,
  the four value bands, ranking and daily tie-break modes, reward order, downstream-boosted and
  unavailable counts, objective-profiled quest and solver-derived group counts, relation-kind and
  available-EO counts, and up to ten leading quest IDs with their periods,
  guidance tiers, value bands and effective-reward sources, selected plan IDs, ranking version, and
  elapsed time;
- `quest-recommendation.failed` records the stable `KC3_QUEST_DATA_UNAVAILABLE` reason code and a
  sanitized error message.

Diagnostics are aggregate and bounded; they do not log the full quest list, ship roster, or raw
resource snapshot.
