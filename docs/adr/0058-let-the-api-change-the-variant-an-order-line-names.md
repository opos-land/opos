# 0058. Let the API change the variant an order line names

- Status: Proposed
- Date: 2026-11-20

## Context

The API's role never updates a column that points a row at an account or another row: a pointer
changed in place could move a row to another parent, and a foreign key a migration forgot would
let it cross a tenant. Every relation the API changes so far is a row removed and a row added.

An org swaps a merchandise line's variant for another of the same item
([order management](../specs/0006-order-management.md), C4). The line holds what was sold, at
what price, and whether it was handed out; an order's lines are never deleted, and the role that
writes them has no delete on them.

## Decision

- `opos_app` updates `order_lines.merchandise_variant_id`, and no other pointer of any table.
- The line cannot leave its item, its edition or its tenant by it: the line's foreign key spans
  the variant with the tenant, the edition and the item the line names, a check keeps a variant on
  merchandise lines alone, and the role updates neither the item, the edition, the tenant, the
  order nor the kind of a line.
- The exception is named where the rule is stated and in the list `db:verify` holds the role to.

## Alternatives

- **Delete the line and add another.** The role would need a delete on a table whose rows must
  outlive every change, and the new line would lose the moment and the scanner of its hand-out.
- **A table of swaps beside the lines.** What an order holds would be read from two places, by the
  shop's count of stock, the exports and the scanner alike.
- **A function with the owner's rights that swaps.** One more `security definer` function to keep
  from every runtime role, for a write the constraints already bound.

## Consequences

- The stock a line holds moves with the line: counting what orders hold of a variant needs no
  other write.
- A second pointer the API would change in place needs a record of its own, and the same proof
  that its constraints keep the row where it is.
