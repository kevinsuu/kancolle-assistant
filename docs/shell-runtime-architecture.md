# Shell Runtime Architecture

The Electron main process keeps high-frequency browser work separate from persistent storage and
optional feature workloads. This document records the boundaries that should remain intact when
upstream shell changes are merged.

## Runtime configuration

`browser/config/runtime-config.js` wraps `configstore` with an in-memory snapshot. Reads from
network interception, cookie, window, and proxy code must use this runtime store instead of reading
the JSON file directly. Normal settings writes still use `configstore`'s atomic persistence before
the in-memory value is updated.

Window resize events are a special high-frequency path. The latest non-maximized window size is
kept in memory, width and height are persisted in one batch after resize activity settles, and a
pending size is flushed when the window closes. Do not reintroduce per-event or per-dimension
`configstore.set()` calls.

## Tab-owned WebContents

Every tab owns one content `BrowserView` for its lifetime. The find-in-page `BrowserView` is
optional and is created only when the user first opens find-in-page for that tab. Both views are
destroyed exactly once by `Tab.destroy()`.

Tab collection changes must go through `Tabs.remove()`. In particular, removing KC3 extension tabs
during an extension reload must remove the tab objects from `tabList`; destroying their views while
leaving the objects in the collection creates stale tab state.

## KCCacheProxy boundaries

The shell exposes two KCCacheProxy-facing boundaries:

- `browser/kccacheproxy-api.js` is the only module that imports upstream internals. It is the
  browser-facing facade for the full embedded proxy runtime, cache tools, image tools, and
  interactive Git mod operations.
- `browser/kccacheproxy-worker-api.js` is the updater-worker boundary and contains only the Git mod
  update workflow needed by the shell. It uses the shell's existing `isomorphic-git` dependency and
  does not import the KCCacheProxy submodule.

Worker code must use the worker boundary. Importing the browser facade from a worker bundles the
MITM proxy, Jimp, cache archive tools, and other main-process-only modules into that worker. The
boundary test fails when any other shell module reaches into `packages/kccacheproxy/src`. Keeping
the worker implementation shell-owned also allows the parent repository to build from a clean,
unchanged KCCacheProxy submodule revision.

Long-running cache verification, image processing, and proxy work still execute through the main
facade. A future utility-process migration should preserve these public facades and replace their
implementation with request/response messaging incrementally.

## Recommendation core prerequisite

The shell consumes compiled output from `@kancolle-assistant/recommendation-core`. Direct shell
`start`, `start:trace`, `package`, and `make` commands build that workspace before Electron Forge
runs. `start:skip-build` intentionally bypasses all workspace builds and is suitable only when the
existing artifacts are already current.

## Extension runtime listener ownership

The extension router installs one process-level `web-contents-created` observer and dispatches new
background pages to the router registered for their session. Each extension host also receives at
most one destruction observer per router, regardless of how many Chrome events it subscribes to.
This prevents listener-limit warnings while preserving host cleanup.

On POSIX test hosts, the native-messaging fixture is an executable Node script. Windows retains the
Node single-executable application build. The POSIX path avoids depending on a particular Node
distribution exposing the SEA injection sentinel, which is not guaranteed by every Node 22 binary.

## Validation

Run the shell characterization and boundary tests after changing these areas:

```sh
yarn test:shell
```

Run a packaged shell build when changing worker or preload imports because the test bundle does not
exercise Electron Forge's worker-loader output.
