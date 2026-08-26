# Expedition Recommendation Planner

The planner is an independent **遠征推薦** item in KC3Kai's Strategy Room expedition menu. It shows
the current account resources and returns one best expedition set from the selected resource and
bucket weights, with an explicit second-to-fourth fleet assignment. The original **Expedition
Scorer** page and its controls are left unchanged.

The feature is advisory. It does not click the game, change a fleet, resupply ships, start an
expedition, or collect expedition rewards.

The menu item, controls, validation, planner states, requirements, and result explanations follow
KC3's configured language. English (`en`), Traditional Chinese (`tcn`), Simplified Chinese (`scn`),
and Japanese (`jp`) are supported; unsupported language codes fall back to English. Reopen or
reload Strategy Room after changing KC3's language. Expedition names are read from KC3 master data
and therefore keep the name supplied by KC3.

## Account synchronization

The current fuel, ammunition, steel, and bauxite values come from
`PlayerManager.hq.lastMaterial` in the loaded KC3 Strategy Room. Before reading them, the planner
calls `PlayerManager.hq.load()` so the Strategy Room tab reloads KC3's latest locally saved resource
state instead of retaining its older in-memory copy. This happens when **遠征推薦** opens, when
**同步資源** is pressed, and before a plan is generated. The sync timestamp and the account
resource cap are available from the **同步資源** button tooltip in the recommendation-page title
bar. The four resource cards show the latest synchronized values directly; there is no separate
synchronization header panel.

The sync button visibly changes through **同步中…** and **同步完成** even when the synchronized
values are unchanged, then returns to its normal action label. A failed sync keeps the failure label
and exposes the error in the button tooltip.

The resource cards are the first planning section below the page introduction and show only the
latest synchronized fuel, ammunition, steel, and bauxite values.

KC3 updates these values from game API traffic. If they are unavailable, the UI asks the user to
return to the home port before synchronizing again. The planner does not poll the game API itself.

## Planning inputs

The recommendation page owns its planning controls so changing them does not affect Expedition
Scorer:

- checked expeditions in worlds 1–5 are the candidate pool;
- **資源與水桶權重** supplies fuel, ammunition, steel, bauxite, and bucket weights from -5 to 20;
- **派遣／收取間隔** supplies the repeated operation interval and selects one, two, or three
  expedition fleets;
- **成功模式** selects normal or great success;
- **大發系裝備** selects zero to four Daihatsu-type equipment items per fleet and displays the
  combined income multiplier, up to 1.8×.

The weight controls use a fixed reading order: fuel and steel on the first row, ammunition and
bauxite on the second row, and buckets on the third row. The bucket slider matches the four resource
sliders and defaults to 5.

The selected success mode and Daihatsu count are applied uniformly to every candidate. Normal
success has a factor of 1.0, great success has a factor of 1.5, and each Daihatsu-type item adds 5%
up to four items (20%):

After the inputs pass validation, **產生最佳配對** changes to a disabled loading state with a
route-calculation indicator while the planner runs. The normal label and enabled state are restored
after either a result or a handled connection error.

```text
success factor = great success ? 1.5 : 1.0
Daihatsu factor = 1 + Daihatsu count × 0.05
gross resource income = floor(base resource income × success factor × Daihatsu factor)
net fuel/ammunition = gross income - Kancepts-style estimated resupply cost
```

Great success with four Daihatsu-type items produces the displayed maximum multiplier of
`1.5 × 1.2 = 1.8`. Great success is treated as occurring on every return when selected; it is not a
probability estimate. The UI therefore also shows KC3's great-success guidance for the selected
expedition. Daihatsu count is a planning assumption: the feature does not inspect or change fleet
equipment, so the user must verify the selected count before dispatch.

Resupply cost follows the Kancepts cost-model method with the currently synchronized KC3 ship
roster:

- use Kancepts' minimum fleet composition for each expedition;
- fill unspecified ships with destroyers, matching Kancepts' default wildcard;
- apply the expedition's fuel and ammunition consumption percentages to each eligible ship;
- apply the level-100 marriage reduction after the percentage and floor operations;
- sort eligible ships by combined fuel and ammunition cost, discard duplicate master ship IDs,
  and take the cheapest required count for each ship-type group.

This makes the result comparable with Kancepts when Kancepts has imported the same ship roster and
uses its default cost configuration. Kancepts also permits a separate stored ship list and custom
per-expedition wildcard, ship-count, or fixed-cost settings. Results cannot be numerically identical
when those inputs differ; the planner displays its estimated fuel and ammunition cost on every
recommended expedition so the differing input can be identified.

Generating a plan reads a new KC3 snapshot and immediately replaces the displayed current resources,
update time, and resource limit with the values used by that calculation. The cards cannot continue
showing an older manual-sync snapshot beside a newly calculated recommendation.

For every candidate set, the planner calculates net hourly income after the configured estimated
resupply cost. When the operation interval is zero, each expedition uses its actual duration, which
models a continuously online user. With a non-zero interval, the effective cycle is the first
operation boundary at or after the expedition returns:

```text
effective cycle = ceil(expedition duration / operation interval) × operation interval
```

For example, when results are collected once per hour, a 90-minute expedition occupies two hours
and a 140-minute expedition occupies three hours. This prevents an expedition from being credited
before the user can actually collect and redispatch it.

All candidate sets use the same comparison horizon: one hour for online mode or the configured
operation interval otherwise. This prevents a long expedition from enlarging only its own comparison
window and artificially increasing the projected income of the other fleets in that set.

The four-resource ranking value follows the same weighted-resource approach as Expedition Scorer:

```text
weighted hourly efficiency = sum(net hourly resource income × resource priority)
```

The planner normalizes each candidate set's fuel, ammunition, steel, bauxite, and bucket rates
separately against the other candidate sets. Each normalized value is then multiplied directly by
its matching slider:

```text
preference score = sum(normalized hourly resource income × resource weight)
                 + normalized bucket potential × bucket weight
```

This makes all five sliders comparable despite their unlike raw units: fuel 20 has four times the
influence of buckets 5. Zero removes that dimension from ranking, while a negative value penalizes
gaining it. Users who merely do not need a resource should select zero; negative values intentionally
avoid expeditions that also earn that resource. Raw weighted resource efficiency, signed bucket
potential, and the existing deterministic tie-breakers resolve equal preference scores.

Bucket rewards come from KC3's expedition master-data item slots. Since that data supplies the
maximum item count but not a drop probability, the result deliberately labels bucket income as
**up to** a count per return and does not present it as an expected value. Great Success does not
multiply item rewards.

Negative priorities penalize that resource, zero ignores it, and positive priorities reward it.
Raw weighted resource efficiency, signed bucket potential, and current-fleet compatibility are
deterministic tie-breakers. These internal tie-breakers do not override the user's five weight
sliders.

## Fleet pairing and conditions

The planner evaluates the actual second, third, and fourth fleets with KC3's expedition requirement
engine, then selects the fleet-to-expedition permutation with the best current fit. Every pairing
shows:

- whether the fleet is currently free, supplied, and condition-compliant;
- the expedition duration, net income per return, and effective income per hour;
- required and current flagship level and type;
- required and current ship count, fleet total level, and ship-type counts;
- required and current ASW, LoS, anti-air, firepower, and torpedo totals when applicable;
- required and current drum count and number of drum carriers;
- the KC3 sample minimum composition when master data provides one;
- the current expedition and return time when the assigned fleet is busy, explicitly separated
  from the expedition recommended for dispatch after its return;
- the selected success/Daihatsu income multiplier, estimated resupply cost, and great-success
  guidance.

The result starts with a large dispatch board such as `第 3 艦隊 → 03 警備任務`, so destination
and fleet assignment appear immediately without a separate score-summary card row. Its state has
five explicit actions:

- `現在可派遣`: the fleet is free, supplied, and passes every known condition;
- `等待返航`: wait for the displayed return time, then perform any listed supply or composition
  action; the current expedition is labeled as fleet status rather than the recommendation. A busy
  fleet always requires collecting its result and resupplying before the next dispatch, regardless
  of the supply value KC3 reports while it is away;
- `領取返航結果`: the recorded return time has passed; collect the result, resupply, and then
  follow any composition action before dispatch;
- `需要補給`: fill fuel and ammunition before dispatch;
- `需要改編`: expand the composition check and resolve the highlighted missing conditions.

Passing composition details are collapsed into a green summary and remain available on demand.
Failed composition details open automatically. Income multiplier, estimated supply cost, sample
fleet, and great-success notes are kept in a separate calculation disclosure so they do not obscure
the next dispatch action. Alternative compositions supported by KC3 are evaluated by the same
requirement engine; the UI lists the matching requirement groups rather than inventing a fleet
composition.

For a busy fleet, hourly resource and bucket values are steady-state rates after the recommended
expedition can be dispatched. The UI labels those rates as excluding the current wait instead of
presenting them as income measured from the current time. A return time that has already passed is
shown as an instruction to collect the result; incomplete mission identifiers, names, or timestamps
fail snapshot validation rather than producing a guessed destination or date.

The success-mode choices, Daihatsu selector, and combined multiplier remain usable on both wide and
narrow views.

The recommendation candidate list covers expedition IDs 1–40 plus A1, A2, A3, and B1. All
candidates participate in **全選**, **推薦**, **水桶**, and **清除** presets. The game does not
expose a simple authoritative list of every unlocked expedition through the data used here, so a
checked but locked expedition can still appear. Users should uncheck expeditions they cannot select
in game. The expanded candidate panel displays this limitation directly above the presets and
candidate checkboxes.

The candidate section is collapsed when the recommendation page opens, and every candidate is
selected by default. Its collapsed summary shows whether all candidates remain selected or the
current selected count.

## Electron boundary

Two fixed IPC commands are accepted only from the currently loaded KC3 Strategy Room origin:

- `recommendation:expedition-summary`
- `recommendation:expedition-plan`

The plan request accepts only integer resource and bucket priorities from -5 to 20, an operation
interval from 0 to 2,880 minutes, one to three fleets, a boolean great-success mode, a Daihatsu count
from zero to four, and unique candidate IDs from 1 to 40 plus the internal IDs 100, 101, 102, and 110
for A1, A2, A3, and B1 respectively. The main process executes a fixed planner function in the KC3
page context; request data is validated before it crosses that boundary.

The income model follows the existing KC3 Scorer and Kancepts weighted-resource approach. Kancepts
is available at <https://javran.github.io/kancepts/> and its source is at
<https://github.com/Javran/kancepts>.
