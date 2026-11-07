---
name: docs-sync
description: Carry a change of a rule into docs/PRODUCT.md and docs/ARCHITECTURE.md, keep them free of details the code holds, check glossary terms, links and anchors. Use when a change alters product behaviour, a business rule, a permission, tenant isolation, a boundary or a convention the documents state, and before opening a PR that edits either document.
---

# docs-sync

The rules live in [AGENTS.md](../../../AGENTS.md#documents-hold-rules-the-code-holds-the-rest); this
skill is the procedure that applies them.

## 1. Decide whether a document changes at all

A document changes only when a rule it states changes: product intent or a business rule
([PRODUCT.md](../../../docs/PRODUCT.md)), or a rule of the code no single file shows — a boundary,
tenant isolation, an invariant, a permission rule, a convention, something decided but not built
([ARCHITECTURE.md](../../../docs/ARCHITECTURE.md)). A change of implementation that keeps every
stated rule changes no document.

## 2. Write the rule, not the detail

Write the target state, in the place the rule belongs. No column, value, file list, request schema
or screen behaviour the code holds; link a file only where a reader needs to know what enforces the
rule. When a part is built, delete what the document said about it beyond its rules.

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

## 5. Check links and anchors

```bash
node .claude/skills/docs-sync/scripts/check-doc-links.mjs
```

It checks relative links and anchors in AGENTS.md, README.md, docs/PRODUCT.md and
docs/ARCHITECTURE.md, including anchors one file points at in another.

## 6. Report

In the response, say what changed in each document, or that a document needed no change.
