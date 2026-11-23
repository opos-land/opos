# 0083. Hold at most one ticket in an order

- Status: Accepted
- Date: 2026-11-23

## Context

A shop usually sells several tickets in one checkout. In the convention shop a ticket is issued to
a ticket holder, with an age band, custom field answers and consents of its own, and the QR code
admits whoever holds it. The shop's domain owner set what an order is
([brief 0001](../briefs/0001-convention-shop.md), BR-20 and D5).

## Decision

- An order holds at most one ticket, for one ticket holder, with its add-ons and merchandise, or
  merchandise alone.
- One email address can hold several orders, each with its own ticket holder and QR code.

## Alternatives

- **Several tickets in one order.** One payment for a family, but one QR code for several people,
  or several codes and holders inside one order. Correcting, canceling and handing out one ticket
  of several would each need rules of their own.

## Consequences

- A family of four is four checkouts, four payments and four QR codes.
- Every rule about a ticket is a rule about an order: a correction, a cancellation, a hand-out and
  a new email that passes the ticket on.
- A partial unique index enforces it (ARCHITECTURE.md, invariant 15).

## Sources

- [Brief 0001](../briefs/0001-convention-shop.md) and
  [its review](../briefs/0002-convention-shop-review.md), point 17.
