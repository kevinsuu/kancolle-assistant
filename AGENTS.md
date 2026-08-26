# Repository-specific instructions

## User-facing changes and releases

- Treat GitHub Releases as the per-version changelog. Do not add a duplicate `CHANGELOG.md` or a
  rolling list of commits to the README files.
- Give pull requests a concise, user-readable Conventional Commit title. GitHub generates release
  notes from merged pull request titles, grouped by `.github/release.yml` labels.
- For every user-visible behavior change, update the relevant document under `docs/` in the same
  change. Update the `Current` feature list in all four README files only when a capability is
  added, removed, completed, or materially changed.
- Do not list planned, experimental, or incomplete behavior as a completed feature.
- Keep `README.md`, `README.zh-TW.md`, `README.zh-CN.md`, and `README.ja.md` structurally aligned.
- Keep highlight sections for only the five most recent released app versions in all four README
  files. When adding a sixth, remove the oldest section; GitHub Releases retain the full history.
- Use `skip-release-notes` only for changes with no user-facing or operator-facing value.
- Change the version in `packages/shell/package.json` only while preparing a release. The same
  release change must update the displayed version, date, and source highlights in all four
  README files.
- Before creating a tag, follow `docs/releasing.md`. The tag must be `v` followed by the exact app
  version.
