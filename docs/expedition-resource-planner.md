# Expedition Resource Goal Planner

The resource goal planner is an independent **遠征推薦** item in KC3Kai's Strategy Room expedition
menu. It reads the current account resources, compares them with four user-entered targets, and
returns one best expedition set with an explicit second-to-fourth fleet assignment. The original
**Expedition Scorer** page and its controls are left unchanged.

The feature is advisory. It does not click the game, change a fleet, resupply ships, start an
expedition, or collect expedition rewards.

The menu item, controls, validation, planner states, requirements, and result explanations follow
KC3's configured language. English (`en`), Traditional Chinese (`tcn`), Simplified Chinese (`scn`),
and Japanese (`jp`) are supported; unsupported language codes fall back to English. Reopen or
reload Strategy Room after changing KC3's language. Expedition names are read from KC3 master data
and therefore keep the name supplied by KC3.

## Account synchronization

The current fuel, ammunition, steel, and bauxite values come from
`PlayerManager.hq.lastMaterial` in the loaded KC3 Strategy Room. The planner reads them when
**遠征推薦** opens and when **同步資源** is pressed. The sync timestamp and the account resource
cap are available from the **同步資源** button tooltip in the recommendation-page title bar. The
four resource cards show the latest synchronized values directly; there is no separate
synchronization header panel.

The resource cards are the first planning section below the page introduction. Current account
values use a larger numeric treatment, while remaining deficits use a pale-pink warning color.

KC3 updates these values from game API traffic. If they are unavailable, the UI asks the user to
return to the home port before synchronizing again. The planner does not poll the game API itself.

## Planning inputs

The recommendation page owns its planning controls so changing them does not affect Expedition
Scorer:

- checked expeditions in worlds 1–5 are the candidate pool;
- **資源權重** supplies the fuel, ammunition, steel, and bauxite weights from -5 to 20;
- **考慮水桶收益** is checked by default and prioritizes bucket acquisition potential;
- **操作條件** supplies the offline time and selects one, two, or three expedition fleets;
- **收益假設** selects normal or great success and zero to four Daihatsu-type equipment items.

The weight controls use a fixed two-by-two reading order: fuel and steel on the first row,
ammunition and bauxite on the second row.

The income assumption is deliberately visible beside the resource goals and is applied uniformly
to every candidate. Normal success has a factor of 1.0, great success has a factor of 1.5, and each
Daihatsu-type item adds 5% up to four items (20%):

After the inputs pass validation, **產生最佳配對** changes to a disabled loading state with a
route-calculation indicator while the planner runs. The normal label and enabled state are restored
after either a result or a handled connection error.

```text
success factor = great success ? 1.5 : 1.0
Daihatsu factor = 1 + Daihatsu count × 0.05
gross resource income = floor(base resource income × success factor × Daihatsu factor)
net fuel/ammunition = gross income - Kancepts-style estimated resupply cost
```

For example, great success with three Daihatsu-type items is `1.5 × 1.15 = 1.725`. Great success
is treated as occurring on every return when selected; it is not a probability estimate. The UI
therefore also shows KC3's great-success guidance for the selected expedition. Daihatsu count is a
planning assumption: the feature does not inspect or change the fleet's equipment, so the user
must verify the selected count on every assigned fleet before dispatch.

The multiplication remains in the same order as Kancepts instead of first storing a combined
floating-point factor. This matters for values such as `30 × 1.5 × 1.2`: it must be floored to 54,
not to 53 because a precomputed `1.5 × 1.2` happened to be represented slightly below 1.8.

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

Fuel and ammunition default to 50,000; steel and bauxite default to 55,000. Each value is limited
by the account resource cap. A target at or below the current value has no deficit and receives
zero priority. Synchronizing again preserves targets that the user has edited.

For every candidate set, the planner calculates net hourly income after the configured estimated
resupply cost. When AFK time is zero, each expedition uses its actual duration, which models a
continuously online user. With a non-zero AFK time, the effective cycle for an expedition is the
greater of its duration and the AFK time, so a short expedition is not credited as if it had been
collected repeatedly while the user was away.

All candidate sets use the same comparison horizon: one hour for online mode or the configured AFK
duration for AFK mode. This prevents a long expedition from enlarging only its own comparison window
and artificially increasing the projected income of the other fleets in that set.

The four-resource ranking value follows the same weighted-resource approach as Expedition Scorer:

```text
weighted hourly efficiency = sum(net hourly resource income × resource priority)
```

When **考慮水桶收益** is checked, the planner first maximizes the selected expeditions' combined
bucket potential per effective hour, then applies weighted resource efficiency and the existing
tie-breakers. Unchecking it restores the original four-resource ordering. Bucket rewards come from
KC3's expedition master-data item slots. Since that data supplies the maximum item count but not a
drop probability, the result deliberately labels bucket income as **up to** a count per return and
does not present it as an expected value. Great Success and Daihatsu multipliers do not multiply
item rewards. If all four resource targets are already met, keeping this option checked still
allows the planner to return the best bucket-oriented pairing.

Negative priorities penalize that resource, zero ignores it, and positive priorities reward it.
Estimated time to fill all current target deficits, common-window goal coverage, and current-fleet
compatibility are deterministic tie-breakers in that order. Target deficits remain visible on the
four resource cards, but the result does not add a separate score, operation-mode, bottleneck, or
ETA summary row. These internal tie-breakers do not override the user's **資源權重** sliders.

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
- the current expedition and return time when the assigned fleet is busy;
- the selected success/Daihatsu income multiplier, estimated resupply cost, and great-success
  guidance.

The result starts with a large dispatch board such as `第 3 艦隊 → 03 警備任務`, so destination
and fleet assignment appear immediately without a separate score-summary card row. Its state has
four explicit actions:

- `現在可派遣`: the fleet is free, supplied, and passes every known condition;
- `等待返航`: wait for the displayed return time, then perform any listed supply or composition
  action;
- `需要補給`: fill fuel and ammunition before dispatch;
- `需要改編`: expand the composition check and resolve the highlighted missing conditions.

Passing composition details are collapsed into a green summary and remain available on demand.
Failed composition details open automatically. Income multiplier, estimated supply cost, sample
fleet, and great-success notes are kept in a separate calculation disclosure so they do not obscure
the next dispatch action. Alternative compositions supported by KC3 are evaluated by the same
requirement engine; the UI lists the matching requirement groups rather than inventing a fleet
composition.

The income-assumption controls use four columns on wide views, two columns on medium views, and one
column on narrow views so the Daihatsu selector and calculated multiplier remain fully operable.

The recommendation candidate list covers expedition IDs 1–40 plus A1, A2, A3, and B1. All
candidates participate in **全選**, **推薦**, **水桶**, and **清除** presets. The game does not
expose a simple authoritative list of every unlocked expedition through the data used here, so a
checked but locked expedition can still appear. Users should uncheck expeditions they cannot select
in game.

The candidate section is collapsed when the recommendation page opens, and every candidate is
selected by default. Its collapsed summary shows whether all candidates remain selected or the
current selected count.

## Electron boundary

Two fixed IPC commands are accepted only from the currently loaded KC3 Strategy Room origin:

- `recommendation:expedition-summary`
- `recommendation:expedition-plan`

The plan request accepts only integer targets from 0 to 350,000, integer resource priorities from
-5 to 20, an AFK duration from 0 to 2,880 minutes, one to three fleets, boolean bucket-priority and
great-success assumptions, a Daihatsu count from zero to four, and unique candidate IDs from 1 to
40 plus the internal IDs 100, 101, 102, and 110 for A1, A2, A3, and B1 respectively. The main
process executes a fixed planner function in the KC3 page context; request data is validated before
it crosses that boundary.

The income model follows the existing KC3 Scorer and Kancepts weighted-resource approach. Kancepts
is available at <https://javran.github.io/kancepts/> and its source is at
<https://github.com/Javran/kancepts>.
