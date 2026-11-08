# 0017. Integrate on `develop` and release through `main`

- Status: Accepted
- Date: 2026-10-22
- Rationale: reconstructed, to confirm

## Context

Dev deploys what the team has merged so it can be tried together; production deploys what a
convention may rely on. Several developers and agents work in parallel, and a branch must not reach
production without its checks and a reviewer.

## Decision

- `develop` is the default branch: every branch starts from it and its PR targets it, and a push to
  it deploys Dev.
- `main` changes only through a PR from `develop`, with the jobs `check`, `e2e` and `secrets` green,
  enforced by a ruleset; a push to it deploys production behind a reviewer. No one pushes to `main`
  directly.
- On a PR into `develop`, CI blocks nothing; the checks report and the author fixes.

The rules are in [ARCHITECTURE.md, CI](../ARCHITECTURE.md#ci) and AGENTS.md, Commits.

## Alternatives

- **Trunk-based on `main`, deploying every merge.** Faster to production, but every merge reaches
  conventions, with no place to try the merged whole first.
- **Release branches.** More control over what ships, more ceremony than a team this size needs.

## Consequences

- Dev may be broken for a while; production may not.
- A release is a PR from `develop` into `main`, which gathers everything merged since the last one.
- The tests-first check runs on PRs into `develop` commit by commit, and not on a release PR, whose
  commits it has already seen.

## Sources

- PR #9, "adopt develop as the working branch".
