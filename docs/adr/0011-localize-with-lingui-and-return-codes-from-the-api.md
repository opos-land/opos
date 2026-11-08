# 0011. Localize with Lingui, English source messages and codes from the API

- Status: Accepted
- Date: 2026-07-28
- Rationale: reconstructed, to confirm

## Context

The interface speaks Polish and English from the MVP, Czech and Slovak next, and every glossary term
has exactly one rendering per language, following the scene's vocabulary
([PRODUCT.md 3](../PRODUCT.md#3-glossary), [9](../PRODUCT.md#9-languages-markets-and-time-zones)).
The repository is written in English. The API serves two frontends and renders emails; a
convention's content is written in its own language.

## Decision

- Lingui, with English source messages as their own identifiers: a string sits in a macro where it
  is used, and the `pl` catalog translates it in the same commit; `pnpm i18n:check` fails on drift
  or a missing translation.
- Glossary terms are declared once in `packages/i18n/src/glossary.ts`, and every message reuses
  their renderings.
- The API returns error codes, never sentences; the frontends show a code through the catalog, and
  the API renders emails in the recipient's language.
- Dates and numbers go through `Intl` with an explicit time zone; tenant content stays outside
  Lingui, in one language.

The rules are in [ARCHITECTURE.md, Localization](../ARCHITECTURE.md#localization).

## Alternatives

- **Hand-made message keys** (`program.list.empty`). A second name for every string to invent and
  keep in step, and the English text away from the code that shows it.
- **Sentences from the API.** The API would need the reader's language for every error, and the
  frontends could not word an error for the screen it appears on.
- **Translating later.** Untranslated strings pile up and the glossary drifts; the only Polish in
  the repository is the catalog, so it ships with the code.

## Consequences

- Changing an English source text changes its identifier, so its translation is redone.
- A new locale needs a catalog, not a migration.
- The `i18n-reviewer` agent and `pnpm i18n:check` gate user-facing strings.

## Sources

- PR #11, "rework the tenant transaction and ship pl translations".
