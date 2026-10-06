# Resource Center and Ledger Summary

The integration keeps KC3Kai's existing **Resource History**, **Consumables**, and **Resources
Ledger** pages intact. It adds two read-only views without modifying the downloaded KC3 extension:

- **Resource Center** is a dedicated Strategy Room dashboard placed before Resource History. It
  combines current holdings, separated acquisition and consumption, hourly activity,
  inventory sparklines, and categorized sources.
- **Ledger Summary** remains embedded above KC3's Resource History chart as a compact alternative.

Resource Center covers fuel, ammunition, steel, bauxite, instant construction, instant repair,
development materials, and improvement materials. The four primary materials appear as dashboard
cards; the four consumables remain grouped together but can also drive the main chart.

Both added views follow KC3's configured language for menu items, controls, resource labels,
periods, metrics, chart descriptions, source categories, status text, and errors. English (`en`),
Traditional Chinese (`tcn`), Simplified Chinese (`scn`), and Japanese (`jp`) are supported;
unsupported language codes fall back to English. Reopen or reload Strategy Room after changing
KC3's language.

## Dashboard behavior

The main flow chart uses a fixed zero line. Gross acquisition rises above the line and gross
consumption falls below it, so simultaneous acquisition and consumption remain visible instead of
cancelling each other. Selecting any resource or consumable updates both this chart and the source
breakdown. The chart uses hourly buckets for Today, Yesterday, and Last 24 hours, and daily totals
for Last 5 days.

Source rows group KC3 ledger types into sortie, PvP, expedition, quest, repair, arsenal, disposal,
land-base, natural-recovery, item-use, and other categories. Each row uses a diverging bar with
consumption on the left and acquisition on the right. Its number is the category's net change.

The small background line on each primary resource card is inventory history from KC3's hourly
`resource` table. Consumable history comes from the corresponding `useitem` table. Missing hourly
samples are carried forward only after an earlier snapshot exists; the dashboard does not invent a
zero balance for missing history.

Buttons at the bottom of Resource Center open KC3's original Resource History, Consumables, or
Resources Ledger pages for long-range graphs and advanced filtering.

## Period and metric options

Resource Center offers four fixed periods, all evaluated in Japan Standard Time:

- **Today**: midnight JST through the current hour;
- **Yesterday**: the previous JST calendar day;
- **Last 24 hours**: the current partial hour and the preceding 23 hours;
- **Last 5 days**: today and the four preceding JST calendar days, with one acquisition/consumption
  total per day. Today accumulates through the current hour; days without entries remain zero.
  Chart labels show calendar dates, and resource-card inventory curves retain hourly snapshots
  across the same selected period.

Resource Center uses **1 hour** buckets except for the five-day view, which uses **daily totals**.
The embedded Ledger Summary remains hourly. KC3's ledger
usually stores only the hour of an action, so finer chart intervals would place those entries
at the start of each hour without providing more precise activity times. Resource Center does
not offer minute-level interval controls. Changing the period also updates the inventory curves.

Each period can display gross consumption, gross acquisition, or net change. Gross consumption is
the absolute sum of negative ledger values, gross acquisition is the sum of positive values, and
net change is their signed sum. Gains and spending therefore do not cancel each other until net
change is selected.

Each compact summary card also shows the latest KC3-held amount and an hourly activity strip. The
embedded summary remains hourly.

## Data source and limitations

The views read KC3's existing `navaloverall` Dexie table. That ledger records supported actions
such as sorties, resupply, repairs, expeditions, quests, construction, development, improvement,
land-base operations, and natural regeneration. Instant-repair bucket use is the sixth value in
the ledger's eight-value material array.

Both Resource Center and the embedded Ledger Summary reload `PlayerManager.hq` and KC3's
consumable state when reading a fresh snapshot. Recent snapshots for the same Strategy Room time
window are reused briefly to avoid repeating the same IndexedDB reads.
Their **Refresh** buttons bypass this short cache and re-read the current account and latest
locally synchronized holdings. The displayed values can still only be as current as the latest game
API update that KC3 has received and saved.

The summary is only as complete as the KC3 ledger. Activity performed while KC3 was not recording,
or an API action KC3 does not classify, cannot be recovered by KanColle Assistant. Current holdings
come from `PlayerManager.hq.lastMaterial` and `PlayerManager.consumables` after KC3's local
consumable state is loaded.

## Electron boundary

The preload mounts both views only inside KC3's `/pages/strategy/strategy.html`. They invoke one
fixed IPC command:

```text
recommendation:resource-ledger-summary
```

Resource Center requests `hourly` granularity; the summarizer automatically uses `daily` for
`rolling5days` and reports that effective granularity to the UI and diagnostic logs. The shared IPC
retains its existing granularity compatibility. The main process accepts only `today`, `yesterday`,
`rolling24`, or `rolling5days`, plus the whitelisted chart granularities `minute`, `fiveMinute`,
`tenMinute`, `thirtyMinute`, and `hourly`, and only from the currently loaded KC3 Strategy Room
origin. It executes a fixed reader in the KC3 page context; arbitrary script, table, player, and
date-range input are not accepted.

## Runtime isolation

This calculation runs in its own lazy worker lane, separate from fleet recommendation and other
resource tools. A different operation timing out does not cancel this calculation. Waiting queues are
bounded; idle workers are reclaimed after one minute. See [shell runtime architecture](shell-runtime-architecture.md).

Summary diagnostics record the selected period and granularity, entry and bucket counts, and
elapsed time. Failures include a stable reason code without logging player holdings.
