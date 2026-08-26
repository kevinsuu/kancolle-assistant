# Keeping the Fleet Fork in Sync

The fork uses two long-lived branches so upstream code and custom features remain separate:

```text
planetarian/damecon-browser:electron25
                    │
                    ▼
origin/electron25                 clean, fast-forward-only mirror
                    │
                    ▼ pull request
origin/main                       custom release branch
                    │
                    └── feature/* day-to-day feature work
```

Do not commit custom work to `electron25`. Keeping that branch clean allows the sync workflow to
fail safely with `--ff-only` if the branch ever diverges.

## One-time GitHub setup

1. Commit the current recommender work and create/push `main` from it.
2. Change the fork's default branch to `main` in GitHub repository settings. Scheduled
   workflows only run from the default branch.
3. Keep the existing `electron25` branch as the official mirror.
4. In repository Actions settings, allow workflows to create pull requests.
5. Create a fine-grained personal access token scoped only to this fork with **Contents:
   read/write** and **Pull requests: read/write**, then store it as the repository Actions secret
   `UPSTREAM_SYNC_TOKEN`.
6. Protect `main` and require the `Test (ubuntu-latest)` and `Test (windows-latest)` checks
   before merging.

If the custom branch uses another name, create the repository variable `CUSTOM_BRANCH` with that
branch name.

The workflow in `.github/workflows/sync-upstream.yml` runs daily and can also be started manually.
It fast-forwards `electron25` from `planetarian/damecon-browser:electron25`, then opens a pull
request from `electron25` into the custom branch.

No local `.env` file or GitHub Environment is required. `UPSTREAM_SYNC_TOKEN` is required because
GitHub suppresses most workflow events created with the built-in `GITHUB_TOKEN`. Using the personal
access token for both the mirror push and pull request allows the normal push or pull-request event
to run CI for the synchronized commit. The workflow fails before changing the mirror when the
secret is absent instead of opening an unvalidated pull request.

## Optional automatic merge

The safe default is to leave the generated pull request open for CI and review. To merge it
automatically after required checks pass:

1. Enable auto-merge in the GitHub repository settings.
2. Create a repository variable named `UPSTREAM_AUTO_MERGE` with value `true`.

Conflicts cannot be auto-merged. GitHub leaves the pull request open so only the small shell
integration points need manual resolution. The recommendation engine and rule data remain in their
own packages and normally do not overlap upstream changes.

## Source synchronization versus releases

The workflow follows commits on the upstream `electron25` branch. It does not copy upstream tags,
GitHub Releases, release notes, or binary assets. If upstream publishes a release for an existing
commit without changing the branch, there is nothing for this workflow to synchronize. After an
upstream source change is merged into `main`, prepare and tag a separate fork release when a
new custom installer is needed.

## Electron runtime baseline

The application, shell, and bundled Chrome extension bridge target Electron 25.9.8. Keep these
package declarations aligned when syncing upstream changes. APIs introduced after Electron 25 must
have an Electron 25-compatible path before they are merged into the custom branch. Shared preload
modules must also tolerate execution before the page document element exists.

## Local equivalent

```sh
git fetch upstream --prune
git switch electron25
git merge --ff-only upstream/electron25
git push origin electron25
git switch main
git merge electron25
```

The installed application updater is separate from this source sync. A custom installer should use
its own application identity and update feed so the official binary updater cannot replace the
fleet-enabled build.

For supported installed builds with automatic updates enabled, the application checks when it
starts, whenever a tab enters the DMM KanColle game page, and every six hours while it remains open.
Consecutive navigations within the DMM game page do not start duplicate checks; leaving and opening
the game again starts a new check.
