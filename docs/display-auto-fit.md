# Startup Display Auto-fit

Damecon captures the primary display work area and scale factor once during application startup.
Saved window dimensions are clamped to that work area so a window from a larger monitor does not
open outside a smaller display.

KC3's `direct.html` is only a launcher, so it is not used for sizing. After the main tab navigates
to the configured DMM game URL, the main process scans the tab's frame subtree for the real
`<canvas width="1200" height="720">`. Only a DMM game navigation starts this scan; unrelated HTTP(S)
pages do not install or run a canvas observer.

The canvas rectangle, parent rectangle, frame viewport, and top viewport must remain stable for
three consecutive measurements after the configured DevTools startup. Damecon then applies a zoom
factor that fits the rendered canvas within both the final viewport and display work area. One
post-zoom measurement can apply a final correction if the page layout changed during zooming.

The calculated zoom is rounded to two decimal places and clamped to `0.5–1.25`. It is applied only
once per game tab. Later window resizing and manual zoom controls are not overridden. Canvas
detection times out after five minutes; reloading the game page starts a fresh attempt.

The behavior is enabled by default and can be disabled under:

```text
Damecon Settings → Window → View → Auto-fit KanColle once when the game opens
```

Structured logs use these lifecycle events:

```text
display.startup-detected
display.game-auto-fit-scheduled
display.game-auto-fit-waiting-canvas
display.game-canvas-found
display.game-auto-fit
```

They contain display dimensions, scale factor, canvas and viewport dimensions, and the selected
zoom factor. A missing canvas uses `display.game-auto-fit-timeout`; unexpected failures use
`display.game-auto-fit-error`.
