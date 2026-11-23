# 0082. Keep orders for at least five years from the end of their edition

- Status: Accepted
- Date: 2026-11-23

## Context

An order is the convention's sales record: what was sold, to whom, at what price, and how it was
paid. A convention keeps its accounting records for years under Polish law. Everywhere else in OPOS
a row goes with what owns it: an account takes its likes and memberships with it, and a deleted
tenant takes everything. The shop's domain owner set how long orders stay
([brief 0001](../briefs/0001-convention-shop.md), BR-26 and D13).

## Decision

- An order is kept for at least five years from the end of its edition, which is never earlier
  than its payment.
- An account's deletion leaves its orders: they are the convention's records, not the account's.
- An edition that has an order is not deleted, and neither is its convention
  ([0048](0048-keep-what-an-order-names-with-foreign-keys-that-do-not-cascade.md)).
- Nothing in OPOS purges an order, nor what is kept of its emails.

## Alternatives

- **Delete orders with their account or convention.** It loses the convention's sales records.
- **A job of the API that purges orders at five years.** A purge needs rules of its own, what goes
  and what a report still counts, for something that happens rarely; the operators can clean up by
  hand, and nothing is old enough to need it for five years.

## Consequences

- After the five years, orders may be dropped, by a cleanup the operators run by hand rather than
  a job of the API. How, and what becomes of a convention that leaves the platform within the five
  years, which cannot be deleted while it holds an order, are open.

## Sources

- [Brief 0001](../briefs/0001-convention-shop.md) and
  [its review](../briefs/0002-convention-shop-review.md).
