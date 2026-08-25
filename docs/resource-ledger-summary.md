# Resource Center and Ledger Summary

The integration keeps KC3Kai's existing **Resource History**, **Consumables**, and **Resources
Ledger** pages intact. It adds two read-only views without modifying the downloaded KC3 extension:

- **Resource Center** is a dedicated Strategy Room dashboard placed before Resource History. It
  combines current holdings, separated acquisition and consumption, hourly activity, inventory
  sparklines, and categorized sources.
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

The main hourly chart uses a fixed zero line. Gross acquisition rises above the line and gross
consumption falls below it, so simultaneous acquisition and consumption remain visible instead of
cancelling each other. Selecting any resource or consumable updates both this chart and the source
breakdown.

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

The summary offers three fixed periods, all evaluated in Japan Standard Time:

- **Today**: midnight JST through the current hour;
- **Yesterday**: the previous JST calendar day;
- **Last 24 hours**: the current partial hour and the preceding 23 hourly buckets.

Each period can display gross consumption, gross acquisition, or net change. Gross consumption is
the absolute sum of negative ledger values, gross acquisition is the sum of positive values, and
net change is their signed sum. Gains and spending therefore do not cancel each other until net
change is selected.

Each compact summary card also shows the latest KC3-held amount and an hourly activity strip. KC3's
ledger stores timestamps as whole UTC hours, so neither view implies minute-level precision.
Existing history cannot be reconstructed at five-minute granularity.

## Data source and limitations

The views read KC3's existing `navaloverall` Dexie table. That ledger records supported actions
such as sorties, resupply, repairs, expeditions, quests, construction, development, improvement,
land-base operations, and natural regeneration. Instant-repair bucket use is the sixth value in
the ledger's eight-value material array.

Both Resource Center and the embedded Ledger Summary reload `PlayerManager.hq` and KC3's
consumable state before every request. Their **Refresh** buttons therefore re-read the current
account and latest locally synchronized holdings instead of reusing the Strategy Room's in-memory
player snapshot. The displayed values can still only be as current as the latest game API update
that KC3 has received and saved.

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

The main process accepts only `today`, `yesterday`, or `rolling24` and only from the currently loaded
KC3 Strategy Room origin. It executes a fixed reader in the KC3 page context; arbitrary script,
table, player, and date-range input are not accepted.
