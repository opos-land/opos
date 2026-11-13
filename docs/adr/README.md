# Architecture decision records

A decision record keeps one decision with its context, the alternatives turned down and its
consequences: the reasons that [PRODUCT.md](../PRODUCT.md) and [ARCHITECTURE.md](../ARCHITECTURE.md)
leave out. The documents state the rules in force; a record says why they are so and stays as it
was written. Where a record and a document or the code disagree, the document and the code hold.

## When to write one

A decision that is hard to reverse, or that a reader of the code cannot reconstruct, gets a record
in the change that makes it:

- a part of the stack, a dependency the architecture leans on, a hosting or deployment choice;
- a boundary, the shape of tenant isolation, a security mechanism, a data model choice;
- a business decision with consequences for the code;
- a way of working the tooling enforces;
- an alternative turned down that would otherwise be proposed again.

A decision a [spec](../specs/README.md) makes that meets this bar gets a record too, and the spec
links it.

## Rules

- One decision per record, in `NNNN-<slug>.md`, numbered in order; the title states the decision.
- English and the glossary terms; roles, never personal names; a decision made at a meeting is the
  team's.
- `Proposed` marks a record waiting for the team in an open PR; a record enters `develop` as
  `Accepted`. A decision accepted but not built is `Accepted` and says so in its consequences.
- An accepted record is not rewritten. A changed decision gets a new record, and the old one changes
  only its status, to `Superseded by [NNNN](NNNN-<slug>.md)`; a decision dropped with no successor
  becomes `Deprecated`. Fixing a broken link or spacing a table is allowed.
- A record whose reasons were not written down when the decision was made carries
  `- Rationale: reconstructed, to confirm`: its context and alternatives were inferred later from the
  code, the documents and the pull requests. Confirming or correcting them, and dropping the line, is
  the one rewrite an accepted record takes.
- The document that states a rule a record decides links the record; the record cites the documents
  by file and heading.
- `.claude/agent-docs.test.mjs` checks the numbering, the status and the sections.

## Template

```markdown
# NNNN. <The decision, as a statement>

- Status: Proposed | Accepted | Deprecated | Superseded by [NNNN](NNNN-<slug>.md)
- Date: YYYY-MM-DD
- Rationale: reconstructed, to confirm  <- only on a record whose reasons were not recorded

## Context

The requirement, the constraint and what was there before.

## Decision

What was decided, in the target state.

## Alternatives

Each option turned down, and why.

## Consequences

What follows, good and bad: what the code must do, what becomes easy or hard, what is not built yet.

## Sources

Optional: the pull requests, commits and documents the record rests on.
```
