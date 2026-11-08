# 0019. Documents hold the rules; the code holds the rest

- Status: Accepted
- Date: 2026-11-07

## Context

The implementation plan had grown to about 286,000 characters: every table, route, screen and test
of the platform, in detail. Agents read the code and its tests, which already say how the platform
works, so the plan repeated them, drifted from them and took the context an agent needs for the
work. It also specified modules whose rules nobody with that knowledge had set: reviews, tickets
with payments and the scanner, attendee registrations.

## Decision

- Two documents: [PRODUCT.md](../PRODUCT.md) for the product's intent and business rules,
  [ARCHITECTURE.md](../ARCHITECTURE.md) for the rules of the code that no single file shows. A
  detail the code holds never enters them.
- A document changes only when a rule it states changes; a disagreement between a document and the
  code is raised, never settled silently.
- Every module has a domain owner who sets its rules. A module still waiting for its owner gets no
  code, and the documents keep only the rules any shape of it keeps.

## Alternatives

- **Keeping the full plan.** A second description of the code, always behind it.
- **No documents, only the code.** The intent, the business rules and the rules that span many files
  would be lost.
- **Designing the waiting modules ourselves.** Rules guessed without knowing how conventions run
  that area, built and then rebuilt.

## Consequences

- The plan's citations left the code; comments keep what they say on their own.
- The MVP cannot close before the waiting modules get their owners' rules.
- The reasons behind decisions and the shape of unbuilt features had no place left, which
  [0001](0001-record-decisions-and-specify-features.md) gives them.

## Sources

- PR #55, "replace the plan with a short architecture document".
