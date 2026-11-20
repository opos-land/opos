# 0053. Lock the rows that carry a limit in one fixed order

- Status: Proposed
- Date: 2026-11-20

## Context

A limit on what is sold holds under concurrent sales
([ARCHITECTURE.md, invariant 9](../ARCHITECTURE.md#invariants)): the capacity of a ticket type and
of an add-on, and the stock of a variant. What is taken of each is the sum over the lines of the
orders that hold, so no counter column exists to decrement. Two orders that count at the same
moment would both find the last ticket free.

The same count decides whether an org may lower a capacity or a stock, whether a payment for an
expired order can take back what the order held, and whether new credentials of a payment
provider may replace the stored ones while a payment is under way.

## Decision

- Placing an order locks the rows that carry the limits its cart touches before it counts: the
  ticket type, then the add-ons, then the variants, each by identifier. A payment that takes back
  what an expired order held locks the same rows, after the order's own.
- A change of a capacity or a stock locks its one row and counts after: it is refused below what
  orders hold.
- No route reads a count first and writes after.
- The provider account has no row the API's role may lock, since it never updates one. An order
  with something to pay shares an advisory lock of the tenant's account while it is placed; a
  change of the credentials takes it alone, then counts the orders awaiting payment.

## Alternatives

- **A counter on each limited row**, decremented by a conditional update. A second place for the
  truth, to be kept equal to the lines through every expiry, review and cancellation.
- **Serializable transactions.** A serialization failure for the buyer to retry, on the busiest
  minute of a sale.
- **One lock a tenant for every sale.** Orders of unrelated ticket types would queue behind each
  other, and behind every write of the convention's team, which holds the tenant's write lock.

## Consequences

- An order waits only for the orders and changes that touch one of its own limits.
- The order is fixed, so two orders never wait for each other.
- A discount code's limit joins the order as the last lock when discount codes are built.
