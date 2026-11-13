---
name: docs-sync
description: Carry a change of a rule into docs/PRODUCT.md and docs/ARCHITECTURE.md, record a decision in docs/adr, keep a spec in docs/specs in step with its feature, keep the documents free of details the code holds, check glossary terms, links and anchors. Use when a change alters product behaviour, a business rule, a permission, tenant isolation, a boundary or a convention the documents state, makes a decision, starts or completes a feature, and before opening a PR that edits a document, a record or a spec.
---

# docs-sync

The rules live in [AGENTS.md](../../../AGENTS.md#documents-hold-rules-the-code-holds-the-rest); this
skill is the procedure that applies them.

## 1. Decide what changes

| The change                                                                                                                   | Changes                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| alters product intent or a business rule                                                                                     | [PRODUCT.md](../../../docs/PRODUCT.md)                                                            |
| alters a rule of the code no single file shows — a boundary, tenant isolation, an invariant, a permission rule, a convention | [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md)                                                  |
| makes a decision that is hard to reverse or that the code does not explain                                                   | a new record in `docs/adr` ([when](../../../docs/adr/README.md#when-to-write-one))                |
| reverses or changes the decision of an accepted record                                                                       | a new record; the old one's status becomes `Superseded by` it                                     |
| starts a new module, table, group of routes or flow across screens                                                           | a new spec in `docs/specs`, accepted before the code                                              |
| completes the feature of a spec                                                                                              | the spec's lasting rules into the documents, its decisions into records, its status `Implemented` |
| keeps every stated rule                                                                                                      | nothing                                                                                           |

A record marked `reconstructed, to confirm` whose real reasons the user gives is corrected, and the
line dropped. An accepted record and an implemented spec are otherwise never edited, but to fix a
broken link.

## 2. Write the rule, not the detail

In the documents, write the target state, in the place the rule belongs. No column, value, file
list, request schema or screen behaviour the code holds; link a file only where a reader needs to
know what enforces the rule. When a part is built, delete what the document said about it beyond its
rules. A rule a record decides links the record.

A record follows the template of [docs/adr/README.md](../../../docs/adr/README.md#template), with
the next free number; a spec the one of [docs/specs/README.md](../../../docs/specs/README.md#template).

## 3. Read the other document

Search the other document, and AGENTS.md when the change touches a rule it states, for sentences the
change makes untrue:

```bash
grep -n -i -E '<name>|<other name>' docs/PRODUCT.md docs/ARCHITECTURE.md AGENTS.md
```

## 4. Check the terminology

Every domain word is a term of the [glossary](../../../docs/PRODUCT.md#3-glossary), with no synonyms:

```bash
git diff -U0 -- docs AGENTS.md | grep '^+' | grep -n -i -E 'event|participant|presenter|lecturer|session|accreditation|customer|purchase|organiser|team member'
```

A hit is not always wrong; each one needs a look. A new domain concept goes into the glossary first,
and into `packages/i18n/src/glossary.ts` with its `pl` rendering before its first use in the
interface.

## 5. Check links, anchors and shapes

```bash
node .claude/skills/docs-sync/scripts/check-doc-links.mjs
node --test .claude/agent-docs.test.mjs
```

The first checks relative links and anchors in AGENTS.md, README.md, docs/PRODUCT.md,
docs/ARCHITECTURE.md and every file of docs/adr and docs/specs, including anchors one file points
at in another. The second checks, among others, the numbering, status and sections of the records
and the status of the specs.

## 6. Report

In the response, say what changed in each document, which records and specs were added or changed,
or that nothing needed a change.
