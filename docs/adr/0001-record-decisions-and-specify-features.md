# 0001. Record decisions in ADRs and specify features before their code

- Status: Accepted
- Date: 2026-11-08

## Context

[0019](0019-documents-hold-rules-the-code-holds-the-rest.md) cut the documents down to the rules
the code cannot state. Two things had no place left: the reasons behind a decision, which the
documents leave out by rule and which used to stay in the conversation, so nobody can tell later
whether a rule still serves its purpose; and the full shape of a feature not built yet, which no
longer fits in ARCHITECTURE.md.

## Decision

- A decision that is hard to reverse or that the code does not explain gets a record in
  [docs/adr](README.md), in the change that makes it. A record is not rewritten; a new one
  supersedes it.
- A new feature starts with a spec in [docs/specs](../specs/README.md), accepted by its domain owner
  and the team before its code. When the feature is merged, its lasting rules move into the
  documents, its decisions into records, and the spec is frozen as `Implemented`.
- PRODUCT.md and ARCHITECTURE.md keep the rules in force and link the records behind them; what is
  decided but not built lives in records and specs.
- The decisions made before this record get records too; those whose reasons were never written down
  are marked `reconstructed, to confirm`.

## Alternatives

- **Reasons in the documents.** Every rule would carry its history and alternatives, and the
  documents would grow back into the plan [0019](0019-documents-hold-rules-the-code-holds-the-rest.md)
  replaced.
- **Reasons in pull request descriptions only.** They are outside the repository, hard to find from
  the code, and an agent working in a checkout does not read them.
- **Specs maintained after the feature ships.** A living spec repeats the code and drifts from it,
  as the plan did; a frozen one cannot mislead, since the code and the documents hold over it.
- **Specs deleted after the feature ships.** The record of what the domain owner asked for would
  live only in git history.

## Consequences

- AGENTS.md, the `docs-sync` skill and the checklist for adding a feature name the step; the link
  checker covers both directories, and `.claude/agent-docs.test.mjs` checks the shape of records
  and specs.
- The table of ARCHITECTURE.md that held the decided but unbuilt deployment gives way to
  [0012](0012-host-each-environment-on-a-vps-with-compose-and-traefik.md),
  [0013](0013-connect-to-postgres-directly-with-verified-tls.md) and
  [0014](0014-back-up-production-beyond-supabase.md).
- Thirteen records carry reconstructed reasons until the team confirms or corrects them.
- A frozen spec can disagree with the code; that is expected and raises nothing.
