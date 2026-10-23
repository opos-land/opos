---
name: docs-sync
description: Carry an agreed change into docs/PRODUCT.md and docs/PLAN.md together, slim the parts the change builds, check glossary terms, links and anchors. Use whenever a change touches product behaviour, the schema, the contract, configuration or anything else the two documents describe, and before opening a PR that edits either document.
---

# docs-sync

The rules live in [AGENTS.md](../../../AGENTS.md); this skill is the procedure that applies them.
Read the sections it names before you start, they win over anything below.

## 1. Place the change

Read "What goes where" in AGENTS.md and decide which document the change belongs to. Apply it there
first, written as the target state: no history, no "we changed", no rationale.

## 2. Read the other document

Open the other document and search it for every sentence the change makes untrue. Search by the
names the change touches: table and column names, endpoints, error codes, environment variables,
file paths, script names, glossary terms.

```bash
grep -n -i -E '<name>|<other name>' docs/PRODUCT.md docs/PLAN.md AGENTS.md
```

A change that lands only in PLAN.md still needs this pass over PRODUCT.md, and the other way round.
AGENTS.md counts too when the change touches a rule it states (commits, scopes, tests, the seed).

## 3. Slim what the change builds

When the change builds a part of PLAN.md, follow "PLAN.md shrinks as the code grows" in AGENTS.md:
every detail now present in the code becomes a relative link to the file (relative to `docs/`,
e.g. `../packages/db/src/schema`), and only the rules stay. Update the tree in PLAN.md 3: a built
file leaves the "still to be built" list.

## 4. Check the terminology

Every domain word must be a term from the glossary in PRODUCT.md 3, with no synonyms. Read the
glossary, then check the new text for words that name a glossary concept differently:

```bash
git diff -U0 -- docs AGENTS.md | grep '^+' | grep -n -i -E 'event|participant|presenter|lecturer|session|accreditation|customer|purchase|organiser|team member'
```

A hit is not always wrong ("purchase" can be a verb), but each one needs a look. A new domain
concept goes into the glossary first, and into `packages/i18n/src/glossary.ts` with its `pl`
rendering before its first use in the interface.

## 5. Check links and anchors

```bash
node .claude/skills/docs-sync/scripts/check-doc-links.mjs
```

It checks relative links and anchors in AGENTS.md, README.md and both documents, including anchors
one file points at in another. A renamed or renumbered heading also needs its table-of-contents
entry and every `(#anchor)` pointing at it updated; the script finds the ones left behind.

## 6. Check the style

- English only; the only Polish in the repository is the `pl` catalog. No emoji.
- Tables where the content has structure; specifics (names, codes, paths, limits) for parts not
  built yet.
- No personal names: roles instead.
- `pnpm format:check` stays green (prettier skips `*.md`, so this checks the rest of the change).

## 7. Report

In the response, list what changed in each of PRODUCT.md, PLAN.md and AGENTS.md, and say
explicitly when a document needed no change after the review in step 2.
