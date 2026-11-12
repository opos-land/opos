# 0028. Keep non-binding briefs in docs/briefs

- Status: Accepted
- Date: 2026-11-12

## Context

[0001](0001-record-decisions-and-specify-features.md) gave the repository two kinds of document
beside PRODUCT.md and ARCHITECTURE.md, and both bind: a record holds a decision, and a spec holds a
feature's accepted rules in a fixed shape. Some material binds nothing yet is worth keeping next to
the code: a domain owner's working brief, a review of a running system seen through the browser,
research before a spec. It often states business needs more plainly than the documents, because it
is written without insider knowledge, and it uses its own words. Without a place of its own, it is
forced into the shape of a spec before the needs are understood, or kept outside the repository,
where an agent working in a checkout never reads it.

## Decision

- `docs/briefs` holds material that binds nothing: briefs, reviews, research, drafts before a spec.
  Its [README](../briefs/README.md) states the few rules it keeps.
- A brief has any shape that helps. It keeps only the rules of the whole repository: English, roles
  instead of personal names, no secret and no real person's personal data. It may quote the
  rendering of a term in another interface language, such as Polish, as a proposal for the catalog.
- The documents, the records, the specs and the code hold over a brief. A brief worked toward a spec
  lists where it disagrees with them, for its domain owner to decide; the decision lands in a
  record or a document, never in the brief alone.
- A spec built from a brief links it. No rule rests on a brief: PRODUCT.md, ARCHITECTURE.md and the
  records do not cite one for a rule.
- A brief nobody works from any more is deleted; git keeps its history.

This record extends 0001, which stays in force for records and specs.

## Alternatives

- **Drafts in docs/specs.** A spec needs its template, the glossary and a domain owner's acceptance
  before the needs are clear, and a draft spec lives only in an open pull request.
- **Outside the repository.** The same reason 0001 turned down pull request descriptions: an agent
  in a checkout does not read it, and nothing links it to the work it feeds.
- **A strict requirements layer** with its own template, lifecycle and checks. It would make binding
  what is meant to be rough, and repeat the specs.

## Consequences

- AGENTS.md lists `docs/briefs` beside the documents, the records and the specs.
- The link checker of the `docs-sync` skill and `.claude/agent-docs.test.mjs` do not check briefs;
  a broken link in a brief fails nothing.
- A brief can disagree with the documents for a long time; only work toward a spec settles it.
