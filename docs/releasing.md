# Releasing KanColle Assistant

`packages/shell/package.json` is the single source of truth for the KanColle Assistant application
version. The root `package.json` version belongs to the base workspace and must not be used as the
KanColle Assistant release version.

The Settings page displays this application version as `v<version>` in its lower-right corner. It
is read from Electron's `app.getVersion()`, so it follows `packages/shell/package.json` without a
second UI-specific version constant.

## Version selection

Choose the next version from the actual changes since the latest release tag, including the current
working-tree changes. Assess their scope and effect on users rather than relying only on commit
types, labels, or the number of changed files.

- Small fixes, localized behavior adjustments, documentation, and routine maintenance increase
  patch: `0.12.3` → `0.12.4`.
- Substantial fixes that materially change core behavior or workflows, and new completed
  capabilities, increase minor and reset patch to zero: `0.12.3` → `0.13.0`.
- Major normally stays unchanged. Do not automatically increase it for breaking changes; describe
  any compatibility impact and use minor unless the user explicitly requests a major release.

For mixed changes, use the highest applicable level. State the chosen version and the concrete
changes that justify it before preparing release metadata. An explicit user-specified version takes
precedence. Reuse an existing working-tree version bump only when it matches this decision or the
user's explicit version and is newer than the latest release tag. Never reuse an existing tag.

## Prepare a release

Use one release commit for the app version and its user-facing documentation:

1. Update `packages/shell/package.json` to the new semantic version.
2. Update the visible version, date, and completed user-facing highlights in `README.md`,
   `README.zh-TW.md`, `README.zh-CN.md`, and `README.ja.md`.
3. Keep the four README files structurally aligned and retain highlight sections for only the five
   most recent released app versions, including the new release. Remove the oldest section when
   adding a sixth; GitHub Releases retain the full history. Do not list planned or incomplete
   features as released.
4. Run `yarn build` once before committing unless the user explicitly confirms the current changes
   have already been validated and requests that the build be skipped. Building packages the app
   without launching it; do not start the app or run local test suites as part of release
   validation. The tag-triggered release workflow runs its tests and packaging checks before
   creating the GitHub Release. If the build is blocked by a running game or development process,
   leave it running and stop unless the user confirms validation and asks to proceed without it.
   Never close, kill, or restart development apps, Electron/Forge processes, or game processes
   to unblock packaging, even when a build error recommends closing them. Ask about proceeding
   without the build rather than asking the user to close those processes.
5. Commit with a Conventional Commit such as `chore(release): v0.12.0`.

Changing or pushing the package version alone does not create a release. The release starts only
after a matching `v*` tag is pushed.

GitHub Releases are the per-version changelog. Pull request titles should therefore be concise,
user-readable summaries, and each pull request should have the most appropriate release-note
label:

- `feature` or `enhancement` for new capabilities;
- `bug` or `fix` for corrections;
- `documentation` or `docs` for documentation-only changes;
- `dependencies` or `maintenance` for maintenance work;
- `skip-release-notes` only when the change has no value in user or operator release notes.

Unrecognized labels remain visible under **Other changes**. `.github/release.yml` controls these
categories.

The `Validate release metadata` pull-request workflow checks that a version change also changes
all four README files and displays the new version in each one. This is a validation gate; it does
not write or translate documentation automatically.

The Git tag must be exactly `v` followed by the app version. For example, app version `0.12.0`
uses tag `v0.12.0`. A prerelease version such as `0.12.0-beta.1` uses tag
`v0.12.0-beta.1`.

```sh
git tag -a v0.12.0 -m "v0.12.0"
git push origin <release-branch>
git push origin v0.12.0
```

Never push the tag before its release commit is available on the remote branch.

The tagged commit must belong to `main`. If releases use another branch, set the repository
variable `RELEASE_BRANCH` to that branch name. When it is absent, the release workflow uses
`CUSTOM_BRANCH`, then falls back to `main`.

## Automated Windows release

Pushing a matching `v*` tag starts `.github/workflows/release.yml` on a Windows runner. The
workflow:

1. verifies that the tag matches `packages/shell/package.json` and all four README files;
2. installs the locked Yarn dependencies and checks out the KCCacheProxy submodule;
3. builds the workspace dependencies and runs the recommendation and extension test suites;
4. uses Electron Forge to create the x64 Windows installer and portable ZIP;
5. creates a GitHub Release whose categorized notes compare this tag with the previous release,
   then uploads the installer, ZIP, full Squirrel package, and `RELEASES` manifest.

The general `.github/workflows/test.yml` workflow accepts branch pushes and pull requests, but not
tag pushes. A release tag therefore starts only the Windows release workflow instead of launching
a second general CI run for the same commit. The release workflow retains its own blocking tests so
the exact tagged source is still verified before packaging and publishing.

Stable semantic versions create normal releases. Versions containing a prerelease suffix create
GitHub prereleases. Re-running a completed workflow replaces matching assets on the existing
release instead of creating a duplicate.

The generated Windows executable is not code-signed unless signing credentials are configured in
the repository and the Forge build. Windows SmartScreen may therefore warn users before the app
has established reputation.

Local packaging logs a warning and continues when
`packages/kccacheproxy/minimum-cache.zip` is absent, which keeps development packages usable
without a generated cache dump. Release builders should still generate the file with the
KCCacheProxy build script and confirm that it is copied into the packaged resources.

## Application updates

Installed Windows builds use `update.electronjs.org` through `update-electron-app` and read release
assets from `kevinsuu/kancolle-assistant`. The Release must remain public and include the generated
Squirrel `.nupkg` and `RELEASES` files for automatic updates to work.

## Branding compatibility

The public package, executable, installer, and repository use `kancolle-assistant`. Internal
storage identifiers that begin with `damecon` remain unchanged. The legacy `Damecon` home and
application-data directories are also reused so existing user data remains discoverable. Do not
rename those identifiers or directories without an explicit data migration.

A fresh install into a different application directory does not automatically copy a portable
`config.json` stored beside the previous executable. Back up and copy that file when migrating an
existing portable installation. Treat the first renamed Windows release as an installer-identity
migration and verify upgrade behavior from the previous Damecon build before publishing it.
