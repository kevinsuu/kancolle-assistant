---
name: kancolle-release
description: Prepare and publish a KanColle Assistant release from the current repository changes.
---

# KanColle Assistant Release

Use this skill when the user asks to release the current repository changes. The explicit release
request authorizes one release commit, its matching annotated tag, and pushes to `origin`. Never
force-push, rewrite remote history, or replace an existing tag.

## Prepare

1. Read `AGENTS.md` and `docs/releasing.md`. The app version comes only from
   `packages/shell/package.json`.
2. Review `git status --short --branch`, staged and unstaged diffs, and untracked files. Include all
   current changes by default. Stop for conflicts, secrets, generated build output, or accidental
   files; never silently omit or discard changes.
3. Use the configured `RELEASE_BRANCH`, then `CUSTOM_BRANCH`, otherwise `main`. Fetch the branch
   and tags from `origin`. Stop if the current branch differs, or if local and remote have diverged
   or the remote is ahead.
4. Use a valid working-tree version bump if it is newer than the latest release tag. Otherwise
   choose the next semantic version from the changes: breaking change = major, new completed
   capability = minor, fixes/docs/maintenance = patch. Update the app package and all four README
   versions, dates, and completed highlights; keep them aligned with only the five newest release
   sections. Never reuse an existing tag.

## Validate

- If the user explicitly confirms the current changes have already been validated and asks to
  skip build, accept that confirmation and do not run tests or build.
- Otherwise run `yarn build` once. It packages the app without launching it. Never run `yarn test`,
  `yarn start`, or an Electron development command during this release workflow.
- If the build fails, stop before committing or publishing. Do not close running game processes,
  create a temporary checkout, or retry without a source fix. Report the concise failure.
- Run the release metadata check and `git diff --check`. Review the final diff, stage all reviewed
  changes with `git add -A`, and inspect the complete staged diff before committing.

## Publish

1. Commit as `chore(release): v<version>`.
2. Confirm the matching `v<version>` tag does not exist locally or remotely, then create it as an
   annotated tag.
3. Push the release branch to `origin` first, then the tag. If a push fails, report which refs
   succeeded; never force-push or rewrite history.
4. Verify the worktree is clean and the remote branch and tag point to the release commit. The tag
   starts the automated GitHub Release workflow; do not create a separate release manually.

Report the version, commit, tag, validation performed or user-confirmed, pushed refs, and any
pending CI result.
