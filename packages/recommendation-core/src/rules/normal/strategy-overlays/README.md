# Per-map strategy overlays

New normal-map guide templates can live here as one JSON file per map, such as `5-5.json`.

After adding a file, import it from `index.ts` and add it to `perMapStrategyOverlays`. The explicit
import keeps the source bundled into `@kancolle-assistant/recommendation-core`, so packaged builds
do not depend on scanning the filesystem at runtime.

Each file may export either one map object or an array of map objects using the normal overlay map
shape: `area`, optional map `sources`, and a `routes` array.
