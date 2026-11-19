# 0048. Keep what an order names with foreign keys that do not cascade

- Status: Proposed
- Date: 2026-11-20

## Context

An order is the convention's sales record, kept for at least five years from the end of its
edition ([checkout and orders](../specs/0004-checkout-and-orders.md), A7). It names its edition,
the ticket type, the add-ons and the variants it sold, the custom fields its ticket holder
answered, and the consents accepted with the exact version of each document. The
[catalog](../specs/0003-catalog.md) says such a row is hidden and never deleted (L2).

Everywhere else in OPOS a child row goes with its parent: a tenant table's foreign keys cascade,
so deleting an edition or a tenant removes everything it owns.

## Decision

- The foreign keys from an order's tables to what the order names do not cascade: to its edition,
  to the catalog rows of its lines, to the custom fields of its answers, and to the consents and
  document versions it accepted. The database refuses to delete any of them from under an order,
  whichever route tried and however late the order was placed.
- The API names the refusal by what was being deleted: `catalog.in-use`, `consent.in-use`,
  `edition.has-orders`, and `tenant.has-orders` for the admin's deletion of a suspended tenant.
- A row an order names is hidden instead: no longer offered, and still shown on its orders.
- An order's own rows, its lines, answers, consents, payment attempts, emails and links, go with
  the order.

## Alternatives

- **A check in each route before it deletes.** It reads before it writes: an order placed between
  the check and the deletion would lose what it names, or its row.
- **Copy the names and prices onto the order.** The prices are copied, since an order keeps the
  price it was placed at. A name copied would stay as it was typed when a typo in it is fixed, and
  the order would no longer tell which ticket type it holds a place of.
- **Soft deletion of every catalog row.** A column every query of the catalog has to filter on;
  hiding is the one state an org needs, and it is already there.

## Consequences

- An edition that has an order cannot be deleted, and neither can its tenant. Platform
  administration lets the admin delete a suspended tenant with everything it owns: with orders it
  is refused. What becomes of a convention that leaves the platform inside the five years is the
  domain owner's to say.
- Nothing purges orders past their retention yet.
- A test that deletes its tenant deletes the tenant's orders first.
