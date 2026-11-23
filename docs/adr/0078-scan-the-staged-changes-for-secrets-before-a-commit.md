# 0078. Scan the staged changes for secrets before a commit

- Status: Accepted
- Date: 2026-11-23

## Context

The `secrets` job of CI runs gitleaks over the tree and the history of the checked commit. A finding
there comes after a push, and once a commit carries it, only a rewrite of the branch clears the
history scan: a commit that removes the value leaves it in the commit before. The repository is
public, so a pushed secret is read by anyone at once.

[0077](0077-lock-the-tools-checksums-in-mise-lock.md) gives every developer the gitleaks of CI
through mise.

## Decision

lefthook `pre-commit` runs gitleaks over the staged changes, with the configuration of the
`secrets` job. A finding stops the commit.

The rule is in [ARCHITECTURE.md, CI](../ARCHITECTURE.md#ci).

## Alternatives

- **CI alone.** A finding costs a push, a failed run and a rewritten branch, and a real secret is
  public before the run ends.
- **A `pre-push` scan of the commits to push.** It still lets the secret into a commit, which then
  needs a rewrite.

## Consequences

- A commit needs gitleaks on the path, which `mise install` puts there.
- A false positive is settled before the commit: by changing the code, or by an entry in
  `.gitleaks.toml` that CI then honours as well.
- A commit made with the hooks skipped still meets the `secrets` job.
