# 0040. Number the specs in the order they arrive

- Status: Accepted
- Date: 2026-11-17

## Context

A spec was named after its feature alone, as `platform-administration.md` was: the naming came
with the first spec, when no second one was in sight
([0001](0001-record-decisions-and-specify-features.md)). The tickets module arrives as ten specs
at once, each resting on the ones before it. Read in the folder's alphabetical order, they start
with the buyer's self-service and end with the setup of the shop.

A spec is frozen once its feature is built, and a later change of the feature gets a new spec
([docs/specs/README.md](../specs/README.md)). The specs are a series that only grows, like the
records and the briefs, both named `NNNN-`.

## Decision

- A spec is named `NNNN-<feature>.md`, numbered in the order the specs arrive, with no gap.
- A number never changes. A spec that splits a feature, or follows an earlier one of the same
  feature, takes the next number.
- The first spec, platform administration, is 0001, and the references to it follow.
- [agent-docs.test.mjs](../../.claude/agent-docs.test.mjs) checks the numbering, as it does for
  the records.

## Alternatives

- **The feature's name alone** (the state before). The folder gives no order to read ten specs
  in, and nothing tells an earlier spec of a feature from a later one.
- **A folder a module** (`docs/specs/tickets/`). It groups the specs by the domain owner who
  accepts them, but gives no order inside the folder, and the link check and the shape test read
  only the files directly in `docs/specs`: specs in a folder drop out of both until each is
  taught to descend.
- **The module's name as a prefix** (`tickets-shop-setup.md`). It groups the specs
  alphabetically, with no order and longer names.
- **A number that follows the dependencies**, changed when a spec comes between two. Every
  renumbering breaks the links to a spec from the code, the records and CONTRIBUTORS.md.

## Consequences

- The folder lists the specs in the order they were written, which is close to the order they
  build on each other; where the two differ, a spec says what it builds on.
- A number says nothing of a module: a spec names its module's domain owner in its header.
- Renaming the first spec changed its links in CONTRIBUTORS.md, in
  [0029](0029-ship-four-web-applications.md) and in three code comments.
- Specs written in one change are numbered before it is merged; once merged, a number stays.
