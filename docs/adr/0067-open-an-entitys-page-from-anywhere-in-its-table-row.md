# 0067. Open an entity's page from anywhere in its table row

- Status: Proposed
- Date: 2026-11-20

## Context

A table that lists entities with a page of their own opened that page in two ways. The editions and
the team opened it from anywhere in the row. The ticket types, the merchandise, the orders, the
programme and the admin application's conventions opened it only by the one word that was a link:
the name or the number in the first column. The rest of the row looked the same and did nothing, so
a press beside the word was a miss, and the two kinds of table taught different habits.

## Decision

- A table row whose entity has a page of its own opens that page from anywhere in it. The row is
  the `LinkRow` of the application's `shared/ui`, and the entity's name in it a `RowLink` to the
  same page.
- The link stays the way a keyboard and a screen reader reach the page: the row itself takes no
  focus and no role, so the table reads as a table.
- A control inside the row, such as a button or another link, keeps its own press; a press that
  ends a text selection opens nothing; with Ctrl or Cmd the page opens in a new tab.
- A row whose entity has no page, or whose page the member may not open, is a plain row and does
  not light up under the pointer.
- `src/app/tables.test.ts` of the panel and of the admin application refuses a plain link in a
  table cell and a `RowLink` outside a `LinkRow`.

## Alternatives

- **The link in one cell alone**, as five tables had it. A small target, and nothing told the two
  kinds of table apart.
- **A link stretched over the row** by a positioned pseudo-element. It would cover the controls a
  row holds, which then need lifting above it one by one, and it leans on a table row being the
  containing block of that element, which browsers have not always agreed on.
- **Every cell a link.** One entity becomes as many stops for the keyboard and as many links for a
  screen reader as the row has columns.
- **The row as a link itself**, with a role and a tab stop. It takes the row out of the table a
  screen reader announces.

## Consequences

- A new table of entities with a page uses `LinkRow` and `RowLink`; a list that is no table is not
  covered by this record.
- The middle button and the browser's menu open a new tab from the link only, not from the rest of
  the row.
- The admin application holds its own copy of the row, as it does of every component of
  `shared/ui`.

## Sources

- docs/ARCHITECTURE.md, Frontends.
