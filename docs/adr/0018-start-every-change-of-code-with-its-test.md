# 0018. Start every change of code with its test, enforced by tooling

- Status: Accepted
- Date: 2026-10-25
- Rationale: reconstructed, to confirm

## Context

Most code here is written by agents, fast and in volume, and the platform's worst failures —
a tenant leak, a permission that does not hold — look fine in a diff. Tests derived from the catalog
and the contract found gaps of exactly that kind in code that had passed review. A rule that only
asks to write tests first is skipped under pressure, by people and agents alike.

## Decision

- Every change of code starts with its test: the test is written or changed first and watched to
  fail for the reason the change addresses; a rule that already holds gets a test that is broken on
  purpose once.
- `scripts/tests-first.mjs` maps each area of code to its tests and refuses a change of code
  without a test of its area: as a Claude Code hook before an `Edit` or `Write` and after a `Bash`,
  in lefthook `commit-msg`, and in CI on every PR into `develop`, commit by commit. The hooks fail
  closed.
- A change that needs no test says why in a `No-Test-Reason:` trailer; an agent the hook refuses
  asks the user instead of working around it.

The table of areas is in AGENTS.md, Tests first.

## Alternatives

- **Tests first as a written rule only.** Nothing notices when it is skipped.
- **A coverage threshold.** It counts lines run, not whether a test would fail when the rule breaks,
  and it is checked after the code, not before.
- **Tests first for tenant isolation and permissions only** (the first version). It left the rest of
  the code without the habit, and a test of one area could unlock another.

## Consequences

- Every commit carries its own test; a later test does not cover an earlier untested commit.
- The hooks stand aside during a merge, a rebase, a cherry-pick or a revert, and a broken script is
  restored by the user.
- An edit that truly needs no test costs a trailer or a question to the user.
- The script itself is held to full coverage, since a hole in it is a hole in every area.

## Sources

- PR #35, "cover rls and rbac and require a test with every change".
- PR #41, "harden tests-first and require a test with all code".
