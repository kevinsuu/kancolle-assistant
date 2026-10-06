# Startup Display Auto-fit

KanColle Assistant captures the primary display work area and scale factor once during application
startup.
Saved window dimensions are clamped to that work area so a window from a larger monitor does not
open outside a smaller display.

The browser tab bar reports its height in physical pixels. KanColle Assistant converts that value
to display-independent pixels before positioning tab content, preventing an extra blank strip on
Retina and other high-DPI displays.

When KC3 DevTools is configured to open docked on the right, KanColle Assistant initially estimates
its width as a proportion of the display work area. After the selected KC3 theme loads, the
application measures the panel's actual content width and adjusts the divider so the panel is not
clipped. The remaining display area determines the largest complete 1200:720 game scale up to the
game's native 1.0 scale, so large displays do not force the startup window to the full available
width. The same scale is applied as soon as the DMM game page loads instead of inheriting an older
tab zoom. The scale uses 0.001 increments and preserves the game's original aspect ratio, so the
combined game and KC3 layout adapts closely to different displays without stretching the game or
relying on a fixed screen resolution.

For KC3 themes that expose the responsive `.module.quests` markup, KanColle Assistant reserves at
least eight rendered quest rows using the theme's own row height and gap. The quest area keeps its
natural height, has no injected upper limit, and grows downward instead of introducing an internal
scrollbar when KC3 renders more rows. Natsuiro's fixed seven-row quest area grows from 126 to 144
pixels, while its horizontal and vertical wrappers grow by the same single 18-pixel row. The existing
background layer remains at 100% of the wrapper, so it follows the extra row without filling the whole
DevTools viewport; unused space below the panel stays visible. In Natsuiro's horizontal layout, the
800-by-450-pixel background image is fitted vertically to the 468-pixel wrapper without repeating, and
the bottom status module moves down by the same 18 pixels while preserving its original bottom inset.
This does not resize or modify the KanColle game page or canvas. Themes with a different quest markup
are left unchanged. The capacity rule is reapplied when the inspected game page navigates while
DevTools is already open, so late-loading KC3 panels receive the same layout.
It also watches the quest container and recalculates after KC3 renders or refreshes accepted quests,
avoiding the smaller line-height fallback used before the first quest row exists. When KC3 keeps
multiple theme frames alive, the visible frame with rendered quests is preferred over hidden
zero-height frames. Capacity is refreshed after KC3 frame navigation and DevTools resizing.

KC3's `direct.html` is only a launcher, so it is not used for sizing. After the main tab navigates
to the configured DMM game URL, the main process scans the tab's frame subtree for the real
`<canvas width="1200" height="720">`. Only a DMM game navigation starts this scan; unrelated HTTP(S)
pages do not install or run a canvas observer.

The canvas rectangle, parent rectangle, frame viewport, and top viewport must remain stable for
three consecutive measurements after the configured DevTools startup. KanColle Assistant then
applies a zoom factor that fits the rendered canvas within both the final viewport and display work area. One
post-zoom measurement can apply a final correction if the page layout changed during zooming.

The startup window zoom uses `0.001` increments and is clamped to `0.5–1.0`. After the initial fit,
shrinking or expanding the window recalculates the game zoom from the current top-level viewport
with the responsive `0.5–1.25` range. The window aspect ratio remains unrestricted: the limiting
width or height determines the scale, and any extra space remains available to the page. Whenever
both dimensions can contain the full canvas at a supported scale, the complete game remains
visible. Below the `0.5` minimum, the zoom stays at `0.5` and the undersized viewport may clip the
game instead of forcing the window to a larger size. A manual zoom remains in effect until the next
window resize. Canvas detection times out after five minutes; reloading the game page starts a
fresh attempt.

Resize calculations are debounced independently from window-state persistence. While a resize is
in progress, the latest non-maximized dimensions remain in memory. Width and height are written to
the persistent configuration together after resize activity settles, with a final flush when the
window closes. This keeps atomic configuration writes out of the high-frequency resize event path.

The behavior is enabled by default and can be disabled under:

```text
KanColle Assistant Settings → Window → View → Auto-fit KanColle when the game opens and window resizes
```

Structured logs use these lifecycle events:

```text
display.startup-detected
display.game-auto-fit-scheduled
display.game-kc3-layout
display.game-kc3-quest-capacity
display.game-window-layout
display.game-auto-fit-waiting-canvas
display.game-canvas-found
display.game-auto-fit
display.game-resize-fit
```

They contain display dimensions, scale factor, canvas and viewport dimensions, the selected zoom
factor, and KC3 quest-capacity measurements when the theme supports them. Quest-capacity logs include
the trigger, measured and visible quest counts, row source and height, reserved height, viewport and
wrapper overflow, and a stable outcome such as `eight-rows-visible` or `viewport-clipped`. Frame
candidate summaries identify hidden zero-height panels without exposing player data. A missing canvas
uses `display.game-auto-fit-timeout`; unexpected failures use
`display.game-auto-fit-error`.

Switching back to the game tab and applying a tab-content layout update also schedule the same
debounced responsive fit. This catches resizes made while Strategy Room is selected and delayed
tab-bar layout updates. Startup stability requires a nonzero top-level viewport; hidden tabs do
not complete fitting using a stale child-frame size. Responsive fits skip an unavailable viewport
with `display.game-resize-fit-skipped` and reason `viewport-unavailable`.
Canvas-fit frame URLs omit query strings and fragments to avoid logging game session tokens.
