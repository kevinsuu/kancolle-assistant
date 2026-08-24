# Keeping the Fleet Fork in Sync

The fork uses two long-lived branches so upstream code and custom features remain separate:

```text
planetarian/damecon-browser:electron25
                    │
                    ▼
origin/electron25                 clean, fast-forward-only mirror
                    │
                    ▼ pull request
origin/fleet-main                 custom release branch
                    │
                    └── feature/* day-to-day feature work
```

Do not commit custom work to `electron25`. Keeping that branch clean allows the sync workflow to
fail safely with `--ff-only` if the branch ever diverges.

## One-time GitHub setup

1. Commit the current recommender work and create/push `fleet-main` from it.
2. Change the fork's default branch to `fleet-main` in GitHub repository settings. Scheduled
   workflows only run from the default branch.
3. Keep the existing `electron25` branch as the official mirror.
4. In repository Actions settings, allow workflows to create pull requests.
5. Protect `fleet-main` and require the build check before merging.

If the custom branch uses another name, create the repository variable `CUSTOM_BRANCH` with that
branch name.

The workflow in `.github/workflows/sync-upstream.yml` runs daily and can also be started manually.
It fast-forwards `electron25` from `planetarian/damecon-browser:electron25`, then opens a pull
request from `electron25` into the custom branch.

No local `.env` file or GitHub Environment is required. The workflow uses GitHub's built-in
`GITHUB_TOKEN` by default.

Pull requests created with `GITHUB_TOKEN` can require a one-time **Approve workflows to run** action
before their CI starts. For fully unattended CI, create a fine-grained personal access token scoped
only to this fork with **Contents: read/write** and **Pull requests: read/write**, then store it as
the repository Actions secret `UPSTREAM_SYNC_TOKEN`. The workflow automatically prefers that
secret and safely falls back to `GITHUB_TOKEN` when it is absent.

## Optional automatic merge

The safe default is to leave the generated pull request open for CI and review. To merge it
automatically after required checks pass:

1. Enable auto-merge in the GitHub repository settings.
2. Create a repository variable named `UPSTREAM_AUTO_MERGE` with value `true`.
3. For no manual CI approval, configure the `UPSTREAM_SYNC_TOKEN` secret described above.

Conflicts cannot be auto-merged. GitHub leaves the pull request open so only the small shell
integration points need manual resolution. The recommendation engine and rule data remain in their
own packages and normally do not overlap upstream changes.

## Local equivalent

```sh
git fetch upstream --prune
git switch electron25
git merge --ff-only upstream/electron25
git push origin electron25
git switch fleet-main
git merge electron25
```

The installed application updater is separate from this source sync. A custom installer should use
its own application identity and update feed so the official binary updater cannot replace the
fleet-enabled build.
