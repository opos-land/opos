# 0067. List entities in a table whose row opens the entity's page

- Status: Proposed
- Date: 2026-11-20

## Context

The panel listed entities in three ways. The editions and the team were tables whose row opened the
entity's page from anywhere in it. The ticket types, the merchandise, the orders, the programme and
the admin application's conventions were tables that opened it only by the one word that was a
link, the name or the number in the first column: the rest of the row looked the same and did
nothing, so a press beside the word was a miss. The add-ons, the discount codes, the custom fields,
the consents and the documents were no tables at all, but cards under each other, each repeating
its own labels, which nothing lined up for the eye to compare.

## Decision

- A list of entities is a table: a row an entity, a column each thing the list tells of it, and
  for a member who may change the entities a last column of the changes the list reverses by itself
  ([0066](0066-add-and-change-an-entity-on-a-page-of-its-own.md)).
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
  table cell and a `RowLink` outside a `LinkRow`. That a list is a table no test checks.

## Alternatives

- **Cards under each other**, as five lists had them. Each card names its own values, so the list
  grows long and no two values stand in one line to be compared; a table says the names once, in
  its headings.
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

- A new list of entities is a table with `LinkRow` and `RowLink`; what a card could hold beyond a
  few values, such as a description or the versions of a document, is read on the entity's page.
- A table wider than a narrow screen scrolls sideways in its own box, as the table of `shared/ui`
  does.
- The middle button and the browser's menu open a new tab from the link only, not from the rest of
  the row.
- The admin application holds its own copy of the row, as it does of every component of
  `shared/ui`.

## Sources

- docs/ARCHITECTURE.md, Frontends.
