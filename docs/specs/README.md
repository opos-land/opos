# Feature specs

A spec describes one feature before its code: the business rules its domain owner set, its shape
and how it will be tested, for the team and the domain owner to accept before the work starts. Once
the feature is built, the code and its tests describe it, and the spec stays as a record of what was
decided.

## When to write one

A new module, a new table, a group of routes or a flow across screens starts with a spec; a change
inside a feature's existing rules does not. A module waiting for its domain owner gets a spec only
with the owner's rules ([PRODUCT.md 7](../PRODUCT.md#7-modules)).

## Lifecycle

| Status | Meaning |
|---|---|
| `Draft` | in an open PR; open questions allowed |
| `Accepted` | merged before the code, in a PR of its own or as the first commit of the feature's PR, once the domain owner and the team have accepted it; corrected while the feature is built when the work proves it wrong |
| `Implemented` | the feature is merged; the spec is frozen |

The PR that completes the feature:

1. carries the lasting rules into [PRODUCT.md](../PRODUCT.md) and
   [ARCHITECTURE.md](../ARCHITECTURE.md), through the `docs-sync` skill;
2. writes a [decision record](../adr/README.md) for each decision of the spec that meets the bar of
   a record, and links it from the spec;
3. sets the status to `Implemented`.

An implemented spec is not edited again, but to fix a broken link. It holds what was decided at its
date: where it disagrees with the code or the documents, they hold, and the disagreement needs no
report. A later change of the feature gets a new spec when it meets the bar above.

## Rules

- One feature per spec, in `<feature>.md`, kebab case; English and the glossary terms; roles, never
  personal names.
- Details the documents keep out — tables, columns, routes, screens — belong in a spec: the code
  takes them over once built.
- A spec follows the [checklist for adding a feature](../ARCHITECTURE.md#adding-a-feature) and keeps
  every rule of [ARCHITECTURE.md](../ARCHITECTURE.md); a rule it needs to break is a decision record
  first.
- A spec built from a [brief](../briefs/README.md) links it; the brief binds nothing, the spec does.
- `.claude/agent-docs.test.mjs` checks the status.

## Template

```markdown
# <Feature>

- Status: Draft | Accepted | Implemented
- Domain owner: <role>
- Decisions: [NNNN](../adr/NNNN-<slug>.md)

## Goal

What the feature delivers and for whom; the step of the MVP flow (PRODUCT.md 2) it serves.

## Business rules

The rules the domain owner set, each one testable.

## Shape

Tables and their level (tenant or edition), routes with the permission each needs, screens and
flows.

## Tenant isolation and permissions

The tables under RLS, a cross-tenant query and its bound, the invariants the feature adds or keeps.

## Tests

The acceptance criteria as tests: integration cases and e2e scenarios.

## Out of scope

What the feature does not do, and where that goes (PRODUCT.md 11).

## Open questions

Only in a draft; an accepted spec has none.
```
