# 0027. Name the holders of roles in CONTRIBUTORS.md

- Status: Accepted
- Date: 2026-11-12

## Context

The documents, the records and the specs name roles, never people: a decision is the team's, and a
sentence naming a role stays true when the person holding it changes. But the rules of a module
come from its domain owner ([PRODUCT.md 7](../PRODUCT.md#7-modules)), and nothing in the repository
said who that is. An agent asked to build a module could not tell whether its owner exists, and a
reader could not tell whom to ask.

## Decision

- [CONTRIBUTORS.md](../../CONTRIBUTORS.md) at the root says who holds each role the documents name,
  starting with the domain owner of each module.
- It is the one place in the repository that names people. The documents, the records, the specs and
  the briefs keep naming roles.
- It holds names only, no contact details. A role changes hands there, in a change of its own; a
  person leaving the team leaves the file.

## Alternatives

- **Names in the documents.** Every handover would rewrite rules that did not change, and a decision
  would read as one person's.
- **Outside the repository.** An agent working in a checkout could not tell who owns a module, and
  the roster would drift away from the documents that use it.
- **`CODEOWNERS`.** It maps paths to reviewers, not domains to the people who set their rules; a
  module's rules span paths across every package.

## Consequences

- AGENTS.md lists the file and keeps personal names out of everything else.
- A module whose domain owner the file names is no longer waiting for one, though it is still built
  only from its accepted spec.
- The repository holds the names of the people listed, which they agree to by being listed.
