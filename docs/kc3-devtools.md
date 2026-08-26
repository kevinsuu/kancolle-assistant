# KC3 DevTools Integration

KanColle Assistant opens KC3's `KanColle` extension panel inside the Chromium DevTools attached to
the game tab. Whenever the game DevTools opens, KanColle Assistant waits for KC3 to register the
panel, moves it to the first position, persists that order through DevTools, and selects it. The
DevTools locale availability infobar is also dismissed by default.

Chromium does not expose a public API for setting extension panel order or selecting an extension
panel. KanColle Assistant therefore runs a small compatibility integration in the DevTools
frontend after the panel is registered. It updates the live `panel-tabOrder`, uses the DevTools tab model to move the
panel, and calls the inspector view to select it. Restricting the integration to KC3 game pages
keeps normal DevTools behavior unchanged for KanColle Assistant settings and other tabs.

When docked on the right, the KC3 panel initially receives a proportional share of the window. Once
the selected KC3 theme is rendered, KanColle Assistant measures its content wrapper and iframe
viewport, then moves the divider by the measured overflow. The game-window auto-fit uses the final
panel width when calculating the largest complete 1200:720 game viewport that fits the display work
area. This accommodates themes with different minimum widths without tying the layout to a specific
monitor resolution.

This integration depends on Chromium's internal DevTools module paths and tab model, plus
`disableLocaleInfoBar` for the locale notice. Recheck them when upgrading Electron across Chromium
versions.

The DevTools split view can exist before its DOM element is attached. Initial panel selection
retries during that interval; later fit adjustments return an unavailable-layout result instead of
reading dimensions from a null element. This keeps the internal Chromium initialization race from
escaping as an unhandled JavaScript error.
