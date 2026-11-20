# 0064. Add to a paid order with an order of its own, on the same QR code

- Status: Proposed
- Date: 2026-11-20

## Context

A buyer who has a ticket comes back for a T-shirt or a workshop
([buyer self-service](../specs/0009-buyer-self-service.md), "Buy more"). At the gate the ticket
holder shows one QR code, and the org hands over everything bought for them.

An order is one checkout with one payment, and keeps the prices it was placed at. A paid order
is changed only by an org, in ways that move no money. A QR code is carried by an order through
a row of its own, so several orders of an edition may carry one code.

## Decision

- "Buy more" places a new order, which names the account's own paid order of the same edition
  it adds to. It has its own number, total, payment, hold and emails, and is canceled on its own.
- It sells no ticket and asks nothing of the ticket holder: the ticket holder is the first
  order's. It is priced by the contract's one function
  ([0050](0050-price-a-cart-with-one-function-of-the-contract.md)) against the add-ons and the
  merchandise of the first order's ticket type, whether that type still sells or not, or the
  merchandise alone for an order of merchandise alone.
- An add-on is taken once on a QR code: one the orders on the code hold, a "Buy more" order
  still awaiting its payment among them, is refused. Merchandise is ordered again.
- Once paid, the new order joins the QR code the first one carries at that moment. Where the
  first order no longer carries a code that works, the new order gets one of its own.
- An order whose email an org changed has passed to another person: nothing is added to it, and
  an order started for it before the change gets a QR code of its own once paid. The account the
  order stays on never comes by the code its new holder was sent.
- The row of the order added to is locked before any limit, as every change of an order locks
  it ([0053](0053-lock-the-rows-that-carry-a-limit-in-one-fixed-order.md)).
- A visitor has no "Buy more": buying again is an order with a QR code of its own.

## Alternatives

- **Add lines to the paid order.** Its total would change after it was paid, with a second
  payment for one order and a cancellation that could not undo half of it.
- **A QR code for each order.** The ticket holder would show two codes at the gate, and the org
  would have to know there is a second one.
- **A cart that remembers the buyer across orders.** A place for the same data twice; the order
  added to already says who the ticket holder is and what was bought.
- **"Buy more" for a visitor, by the order link.** Whoever holds a forwarded link could buy on
  another person's QR code.

## Consequences

- The scanner shows every order a code carries that is not canceled, and the code is refused
  once all of them are.
- An order's email changed by an org gives that order a new QR code: what was bought later
  stays on the old one, with the other orders.
- The per-order limit of an item counts each order alone: a buyer may reach it again.
- A payment for a "Buy more" order that comes after its hold is judged as any late payment is.
