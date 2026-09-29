# Master Ship Remodel Materials

KanColle Assistant supplements KC3Kai's Master Ship (`艦娘圖鑑`) remodel-material tooltip.
KC3Kai provides the material icon and required quantity, but its generated tooltip does not include
the material name. The shell turns every material in that tooltip into its own row with an icon,
localized name, and required quantity before it is shown.

The shell uses the Strategy Room page's configured language and a compact table for the remodel
materials KC3Kai can render in this tooltip. This keeps the feature available from Electron's
isolated preload world, which cannot access KC3Kai's page-global metadata directly.

For a newly added remodel whose KC3Kai-derived table is temporarily incomplete, the shell may add
a narrowly scoped fallback keyed by the destination ship's canonical API ID. The current fallback
covers Kitakami Kai San (ID 1071): Arsenal Resources ×5, Development Materials ×55, and Torches
×550. Existing KC3Kai material identifiers are preserved and deduplicated, so a later KC3Kai
update that supplies these values will not display them twice.

KC3Kai replaces Master Ship content while switching ships. The preload therefore observes Strategy
Room changes and reapplies the enrichment to newly generated remodel-material tooltips. It also
initializes when KC3 opens Strategy Room in a separate window after the page is already parsed, and
updates the material markup before KC3 opens a hovered tooltip. It does not modify KC3Kai's
downloaded extension files, so the behavior survives KC3Kai updates.

KC3Kai may store the live tooltip in `titlealt` after its lazy tooltip handler initializes. The
shell updates both `title` and `titlealt`; an absent `title` must not prevent `titlealt` from being
processed.

KC3Kai ships special remodel-material icons from both `useitems` and its higher-resolution
`useitems_p2` directory. Both paths map to the same use-item IDs and localized names.

For diagnostics, the Strategy Room preload reports bounded material-tooltip state to the main
process log: content-root and target counts, whether enrichment occurred, the remodel target ID,
the fallback requirement count, and each displayed icon's recognized material identifier. Icon paths
are shortened and extension IDs are redacted.

## Development troubleshooting

If a newly opened Master Ship page shows only icons and quantities while older Strategy Room tabs
still have Assistant features, check that `.webpack/renderer/browser/preload.js` exists under
`packages/shell`. Electron Forge packaging moves the generated bundles into an architecture
directory such as `.webpack/arm64`, leaving an already running development process pointing to
missing preload files. Newly opened or reloaded pages then lose the Assistant enhancements.

The Forge hooks now protect the checkout before webpack deletes or moves its bundles. Starting
development or packaging creates a process marker outside `.webpack`; another command in the same
checkout stops with `WEBPACK_BUILD_IN_USE` while an owner remains alive. Development also tracks
the Electron child, so exiting Forge alone cannot expose the running app's preloads to packaging.
Dead-process markers are removed automatically when the next command runs. Acquisition and blocked
commands emit `build.guard-*` diagnostics with the operation and owner process IDs.

Close the development app and its Forge process before running `package` or `make` in the same
checkout, or use a separate checkout for concurrent work. After packaging, restart with `yarn start`
and reopen the Master Ship page to regenerate and load the development preloads. An app started
before this guard was installed must first be restarted. This does not require reinstalling KC3Kai
or clearing its data.
