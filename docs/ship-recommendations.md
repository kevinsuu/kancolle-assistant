# Ship Recommendations

The Strategy Room **Ship Recommendations** page ranks only ship families currently present in the
KC3 account against the 85-family, 1–10 priority table in the supplied
[NGA guide](https://bbs.nga.cn/read.php?tid=29107384). The bundled source snapshot records the
guide's pasted update date, 2026-06-09. It is a training reference, not an event-routing solver or
a claim that every entry is required for every account.

## Account matching and ordering

The page uses the same shared account snapshot as normal-map recommendations. It never reads a
separate saved roster and does not change fleet composition, equipment, remodels, locks, or game
state.

Catalog matching uses the Japanese canonical master-data family name, not the rendered ship name.
The result card displays the `ship.name` supplied by KC3, so the page follows KC3's English,
Traditional Chinese, Simplified Chinese, or Japanese display language without language-dependent
false negatives. A small set of remodel paths whose pre-remodel name changes (for example `大鯨` to
`龍鳳`) have explicit canonical aliases.

Only matching owned families that still need training are returned. A family is omitted from the
table as soon as any owned copy reaches one of the guide-listed remodel forms; this also prevents a
second base-form copy from being suggested after another copy is complete. Results are ordered by
guide rating descending and then by the representative ship's level. If multiple unfinished copies
are owned, the card shows the highest-level one and the total held count. The status line retains the
number of omitted, guide-form-complete families for context.

The 1, 5, 8, and 10 minimum-rating selector is a display filter only. It never alters the source
score or the account snapshot.

## Data and localization

The catalog stores the source score, canonical family aliases, expected remodel prefixes, and a
small set of structured capability tags derived from the supplied summary. Each matching ship is
shown in one full-width row: the left-side score is its place in the guide, the **Why prioritize it**
section names the source traits behind that score, and **Recommended roles** translates those traits
into practical fleet use. When the supplied table gives only a score and no trait, the page says so
instead of inferring a role. Interface text, capability labels, priority explanations, and role
descriptions are translated in the four existing Strategy Room catalogs. Ship names themselves
remain KC3 master-data names, which avoids maintaining a second, fallible translation table.

Each card uses the same bundled KC3 ship icon asset as the Ship List, keyed by the owned ship's
master ID. The card links to the source guide and identifies the pasted source update date. When the
guide is updated, update the catalog and this date together; do not silently treat a newer forum edit
as already incorporated.

## IPC and diagnostics

The preload calls the fixed `recommendation:ship-recommendations` channel only from the active KC3
Strategy Room origin. A normal load reuses the shared account snapshot; **Resync ships** requests a
fresh snapshot using the existing invalidation rules.

`ship-recommendation.requested`, `ship-recommendation.completed`, and
`ship-recommendation.failed` record the operation, refresh branch, owned-ship and matched-family
counts, guide-form/training counts, source update date, outcome, stable reason codes, and elapsed
time. They deliberately omit ship names and roster contents.

`packages/shell/test/recommendation-worker-service.test.js` covers canonical-family matching,
renamed pre-remodel aliases, result ordering, and both IPC success and account-snapshot failure
diagnostics.
