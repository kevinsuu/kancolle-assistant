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
clipped. The remaining display area determines the largest complete 1200:720 game scale. The same
scale is applied as soon as the DMM game page loads instead of inheriting an older tab zoom. The
scale uses 0.001 increments and preserves the game's original aspect ratio, so the combined game
and KC3 layout adapts closely to different displays without stretching the game or relying on a
fixed screen resolution.

KC3's `direct.html` is only a launcher, so it is not used for sizing. After the main tab navigates
to the configured DMM game URL, the main process scans the tab's frame subtree for the real
`<canvas width="1200" height="720">`. Only a DMM game navigation starts this scan; unrelated HTTP(S)
pages do not install or run a canvas observer.

The canvas rectangle, parent rectangle, frame viewport, and top viewport must remain stable for
three consecutive measurements after the configured DevTools startup. KanColle Assistant then
applies a zoom factor that fits the rendered canvas within both the final viewport and display work area. One
post-zoom measurement can apply a final correction if the page layout changed during zooming.

The calculated zoom is rounded to two decimal places and clamped to `0.5–1.25`. It is applied only
once per game tab. Later window resizing and manual zoom controls are not overridden. Canvas
detection times out after five minutes; reloading the game page starts a fresh attempt.

The behavior is enabled by default and can be disabled under:

```text
KanColle Assistant Settings → Window → View → Auto-fit KanColle once when the game opens
```

Structured logs use these lifecycle events:

```text
display.startup-detected
display.game-auto-fit-scheduled
display.game-kc3-layout
display.game-window-layout
display.game-auto-fit-waiting-canvas
display.game-canvas-found
display.game-auto-fit
```

They contain display dimensions, scale factor, canvas and viewport dimensions, and the selected
zoom factor. A missing canvas uses `display.game-auto-fit-timeout`; unexpected failures use
`display.game-auto-fit-error`.
