---
name: kancolle-stage
description: Analyze KanColle guide URLs, text, and configuration images, then add accurate non-duplicate stage recommendations to this repository. Use when a user provides a web guide or saved page and asks to import its normal-map fleet, routing, quest, leveling, or farming configurations.
---

# KanColle Stage Guide Import

Turn a supplied KanColle guide into maintainable, source-linked recommendation rules without
inventing information that is absent from the guide.

## Accuracy gate

- Read the supplied page, its relevant images, captions, tables, and explanatory text before
  editing rules. Use an attached saved HTML file when the live site is blocked.
- Inspect configuration images visually. Do not rely only on image alt text, filenames, OCR, or the
  surrounding paragraph when the equipment or fleet is shown in the image.
- If the page, a required image, a linked continuation, or essential text cannot be read, tell the
  user exactly what is missing and ask for saved HTML, the original image, or a screenshot. Do not
  infer the missing fleet.
- Ask the user when the source permits multiple materially different interpretations, the pictured
  ship or equipment cannot be identified reliably, or current routing conflicts with the guide.

## Extract the recommendation

Identify each independently useful configuration and record, when present:

- map, objective, route nodes, boss stability, retreat point, and routing probability;
- exact ship-type counts, flexible ship groups, required named ships, flagship/order requirements,
  fleet speed, and quest restrictions;
- air-power target, Formula 33 coefficient and LoS threshold, opening ASW count, radar or drum count,
  landing craft, anti-installation setup, special attack, LBAS, formation, and other sortie setup;
- guide author, direct source URL, and the distinction between hard requirements and preferences.

Cross-check routing and numerical thresholds against current authoritative map documentation. Treat
the supplied composition as the recommendation source, but do not preserve an obsolete route or an
unsafe threshold merely because it appears in an older guide. Explain any material correction in
the route description and documentation.

## Compare before adding

Inspect both per-map catalogs:

- `packages/recommendation-core/src/rules/normal/verified-boss-fleets/<map>.json`
- `packages/recommendation-core/src/rules/normal/strategy-overlays/<map>.json`

Compare normalized fleet shape, named-ship constraints, objectives, nodes, speed, calculated
thresholds, and manually configured requirements. A different ship screenshot or equipment example
does not make a new recommendation when the accepted fleet and route are already equivalent.

- Skip confirmed duplicates.
- If it is unclear whether a source variant is materially distinct, show the overlap and ask the
  user before adding it.
- Never weaken or overwrite a newer existing rule merely to make the imported guide appear unique.

## Model reasonable constraints

- Express actual routing and quest requirements as exact or bounded constraints. Keep genuine
  substitutions flexible rather than pinning the screenshot's particular ships.
- Use current, safe air-power and LoS thresholds. Avoid edge values that depend on a rare enemy
  roll, perfect proficiency, an undocumented slot, or a single exceptional ship unless the source
  explicitly requires that case.
- Hard-require only equipment behavior the solver can validate correctly. Do not translate a
  generic anti-installation picture into an unrelated Type 3 Shell count, or claim radar, speed,
  LBAS, formation, smoke, or special-attack validation that the model does not perform.
- Keep unmodeled but necessary sortie setup in route tags and descriptions so the UI presents a
  manual warning. Add a focused modeled constraint only when its semantics match the guide.
- Prefer a practical recommendation that works across reasonable accounts over a brittle copy of
  one optimized screenshot.

## Store the rule locally by map

- Add boss and quest fleets to the existing
  `verified-boss-fleets/<map>.json` when that per-map file owns the guide fleets.
- Add resource, leveling, gimmick, and other strategy variants to
  `strategy-overlays/<map>.json`. When an existing X-5 map is maintained only in overlays, keep its
  imported boss alternative in that map's existing overlay file.
- Do not create a separate catalog grouped by article or author.
- Put the direct guide URL on each imported route's `sources` field. Do not add it at map level,
  because that would attribute the source to unrelated routes in the same file.
- Give the route a concise source/author-prefixed name that remains understandable after the UI
  derives the website label, for example `巴哈姆特・作者・配置名` for a Bahamut post.

## Verify the change

- Update `docs/normal-map-catalog.md` for user-visible catalog changes; update the four README files
  only when the overall capability materially changes or while preparing a release.
- Add or update focused tests that lock the imported route IDs, direct source, catalog placement,
  duplicate absence, important fleet constraints, calculated thresholds, and manual blockers.
- Validate every changed JSON file, run formatting, then run `yarn test:recommendation`.
- Report how many configurations were added, which were skipped as duplicates, which requirements
  remain manual, and any source material that could not be included.
