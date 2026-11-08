# 0016. License the code under PolyForm Internal Use 1.0.0

- Status: Accepted
- Date: 2026-10-22
- Rationale: reconstructed, to confirm

## Context

OPOS is free for conventions, and the attendee accounts it gathers are the base for later products
([PRODUCT.md 1](../PRODUCT.md#1-what-opos-is)). The code may be read, and conventions or partners
may want to run or audit it, but a copy of the platform run by someone else would split the scene's
accounts and compete with the products built on them.

## Decision

The code is source-available under the PolyForm Internal Use License 1.0.0: it may be used and
modified for an organization's internal operations, not distributed, in its original or a modified
form. `LICENSE.md` holds the text, the README the notice, and `package.json` points at the file.

## Alternatives

- **An open-source licence.** Anyone could run a competing platform on the same code.
- **No licence, the repository closed.** No one outside the team could read or audit the code.
- **A source-available licence that allows distribution with limits** (such as a non-compete
  clause). More room for others, and more to police.

## Consequences

- An organization may run and change the code for itself; nobody may distribute it or a fork of it.
- The licence has no SPDX identifier, and GitHub shows it as "Other".

## Sources

- PR #4, "add polyform internal use license".
