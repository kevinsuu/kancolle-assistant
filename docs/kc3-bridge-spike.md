# KC3 Bridge Spike

## Decision

Use Strategy Room `webContents.executeJavaScript` as the account-data bridge. KanColle Assistant
already owns the KC3 Strategy Room `BrowserView`, and KC3 loads its account managers and master data
in that same extension page.

The bridge executes a fixed script from the Electron main process. Renderer input is never
interpolated into the script, and there is no generic eval IPC.

## Confirmed source shape

The implementation was checked against the KC3Kai source on 2026-08-24:

- `KC3ShipManager.list` contains `KC3Ship` instances keyed by roster/instance ID.
- `KC3GearManager.list` contains `KC3Gear` instances keyed by equipment instance ID.
- Ship instance/master IDs are `rosterId` and `masterId`.
- Equipment instance/master IDs are `itemId` and `masterId`.
- Improvement and proficiency are `stars` and `ace`.
- Master ship/equipment records come from `KC3Master.ship` and `KC3Master.slotitem`.
- Regular-slot compatibility is evaluated with `KC3Master.equip_on_ship(... ) & 1`.
- KC3's `fighterVeteran(slotSize)` is captured for every account slot size.
- KC3's `nakedLoS()` and `losStatImprovementBonus()` feed the Formula 33 calculator.

References:

- <https://github.com/KC3Kai/KC3Kai/blob/master/src/library/managers/ShipManager.js>
- <https://github.com/KC3Kai/KC3Kai/blob/master/src/library/managers/GearManager.js>
- <https://github.com/KC3Kai/KC3Kai/blob/master/src/library/objects/Ship.js>
- <https://github.com/KC3Kai/KC3Kai/blob/master/src/library/objects/Gear.js>
- <https://github.com/KC3Kai/KC3Kai/blob/master/src/library/objects/Fleet.js>
- <https://github.com/KC3Kai/KC3Kai/blob/master/src/library/modules/Master.js>

## Security boundary

Only the current KC3 extension ID and exact path `/pages/strategy/strategy.html` may call the two
recommendation IPC handlers. The snapshot whitelist contains ships, equipment, fleet ship IDs,
HQ level, and the master fields required by the solver. Cookies, DMM credentials, localStorage,
and arbitrary page state are not returned.

Structured logs contain only map, objective, result status, elapsed time, and result count.

## Capability and failure handling

The bridge reports capabilities for ships, equipment, master data, and current fleets. It fails
with a user-facing state when KC3 managers are not ready, port data has not been synchronized,
master records are missing, or normalized schema validation fails.

## Runtime validation still required

This repository environment does not contain the user's KC3 profile or active port data. The
source-level bridge and schema are implemented, but Phase 0's live account comparison and
anonymized fixture export cannot be completed here without launching KanColle Assistant against a real KC3
account.

Before release, perform the live sample checks described in `docs/fleet-recommender.md`. Do not
commit a real account snapshot; export an anonymized fixture only after removing account identity
and unrelated inventory fields.
