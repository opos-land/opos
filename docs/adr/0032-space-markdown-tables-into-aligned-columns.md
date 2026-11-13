# 0032. Space Markdown tables into aligned columns

- Status: Accepted
- Date: 2026-11-13

## Context

The documents, the records, the specs, the briefs and the agent files are read as plain text as
often as rendered: in a terminal, in a diff, in an agent's context. A table written compactly, with
`|---|---|` under its header, renders well but reads in plain text as a run of pipes whose columns
do not line up. `.prettierignore` leaves every Markdown file to its author, so nothing formatted the
tables, and compact and aligned tables grew side by side.

## Decision

- Every table of a Markdown file in the repository is spaced into aligned columns: each cell padded
  with spaces to the width of its column, one space inside each pipe, the dashes of the delimiter
  row filling the column and keeping its alignment colons. The text of a cell never changes.
- [scripts/markdown-tables.mjs](../../scripts/markdown-tables.mjs) spaces the tables with
  `--write`, which `pnpm format` runs, and refuses a table that is not spaced: in lefthook
  `pre-commit` for the staged Markdown files, and over every tracked one in `pnpm format:check`,
  which the CI `check` job runs.
- A row whose number of cells differs from its header's fails the check: it cannot be aligned
  without changing its content.
- A table inside a fenced code block is an example and is left as written.
- Spacing a table changes no content, so it applies to accepted records and implemented specs too,
  as fixing a broken link does.

The rule is in [AGENTS.md, Document style](../../AGENTS.md#document-style).

## Alternatives

- **Prettier on Markdown**, by dropping `*.md` from `.prettierignore`. It spaces tables the same
  way, but it formats the whole file: it adds blank lines in the agent files, collapses the double
  spaces of the licence text and, unless told otherwise, reformats the code inside fences. The gate
  would then enforce a style of the prose that nobody chose.
- **A Markdown linter** with a table rule: a new dependency of the toolchain, under the 7-day
  release age, for one rule, beside the other gates that are scripts tested in `scripts/`.
- **Compact tables everywhere.** A change to one cell would stay a change to one line, but the
  plain text would stay hard to read.

## Consequences

- A cell that grows wider than its column re-pads the whole column, so a diff shows every row of the
  table changed.
- The padding makes a document longer in an agent's context, most in a table with one long cell.
- An update of the vendored shadcn skill brings its tables as published; `pnpm format` spaces them
  before the commit.
