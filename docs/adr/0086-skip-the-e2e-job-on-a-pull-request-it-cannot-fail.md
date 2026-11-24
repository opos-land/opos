# 0086. Skip the e2e job on a pull request it cannot fail

- Status: Accepted
- Date: 2026-11-24

## Context

The `e2e` job of CI sets up the local stack, migrates and seeds the database, installs Chromium,
starts the API and the three frontends, and runs every scenario of `e2e/specs`. It ran on every pull
request, so a change only to the documents, the deployment in `infra/`, the agents' configuration,
another workflow or a tooling script paid that time for a result it could not change.

The ruleset of `main` requires `e2e` to pass
([0017](0017-integrate-on-develop-and-release-through-main.md)), and `release` on a push to
`develop` waits on it ([0075](0075-release-dev-from-ci-through-a-signed-webhook.md)).

## Decision

On a pull request, a `scope` job diffs the changes against the base branch with
`scripts/e2e-scope.mjs`, and `e2e` runs only when a changed path is one it reads. The script names
what it does not read: Markdown at the root, `docs/`, `infra/` but `infra/local/`, `.claude/`,
`.github/` but `.github/workflows/ci.yml`, `scripts/` but `scripts/stack-init.mjs`, and the
configuration of the hooks, commitlint, gitleaks and the Docker context. Any other path runs it.

`e2e` runs unless `scope` answered `false`: on a push, and when `scope` failed. A job skipped by its
condition reports success, so the ruleset's required check passes.

The rule is in [ARCHITECTURE.md, CI](../ARCHITECTURE.md#ci).

## Alternatives

- **`paths-ignore` on the workflow.** It skips `check` and `secrets` too, and a workflow that never
  starts reports no status, so a pull request into `main` waits forever on its required checks.
- **turbo's cache with the job's `inputs`.** turbo decides only after the stack, the seed and
  Chromium are set up, which is most of the job's time; `@opos/e2e` does not depend on the
  applications it drives, so its inputs would list them by hand, and a cached pass from another
  branch would stand in for a run of the code under review.
- **A list of what needs the job.** A new directory would be left out until someone remembers to
  add it; the list of what does not need it errs towards running.
- **A third-party action to filter paths.** Another dependency pinned and updated for a
  `git diff` that a script of the repository does, with its tests.

## Consequences

- A pull request confined to the paths above finishes without the e2e scenarios.
- A new path the e2e job reads outside `apps/`, `packages/`, `e2e/` and the root's configuration,
  such as a script that `stack:init` starts calling, goes into the script's rules in the same change.
- A push to `develop` or `main` runs `e2e` always: `scope` runs there without a step, because a
  skipped job would skip `release` behind it.
