# 0104. Ask the provider once more about each payment attempt of an expired order

- Status: Proposed
- Date: 2026-11-25

## Context

A payment is taken in three steps: a transaction that decides, the provider module's settlement
outside every transaction, a transaction that writes the outcome
([0047](0047-take-a-payment-in-three-steps-around-the-providers-call.md)). Nothing is written
before the settlement answers. A settlement that reached the provider and whose answer was lost,
to a timeout, a dropped connection or a process restarted between the steps, leaves the money
with the convention and nothing in OPOS. 0047 counts on the provider's repeat of its
notification, and Przelewy24 repeats one only until the transaction is verified
([Przelewy24](../specs/0005-przelewy24.md), N5): once the verification reached it, nothing comes
again.

For an order that still awaits payment the expiry job repairs it: at the end of the hold it asks
the provider about the order's open attempts and takes a payment it finds
([checkout and orders](../specs/0004-checkout-and-orders.md), Y6). For an order that already
expired nothing did. The expiry reads only the orders awaiting payment, and no attempt starts
for an expired one. A payment made after the hold is foreseen: a buyer finishes paying a moment
after the hold ended, and a late payment pays its order or sends it to review
([0081](0081-take-ticket-payments-into-the-conventions-account-and-review-one-that-does-not-match.md)).
Such a payment, settled with its answer lost, left an expired order, an attempt with no amount
and no transaction number, and no email to the buyer or to an org, against the rule that no
payment passes unnoticed (checkout and orders, Y11).

A review of the shop's code found this. The window is narrow, and what falls into it is money a
convention holds for a ticket nobody got, with nothing to show for it. This record is the team's
proposal after that review. When a provider is asked about a payment is a business rule of the
tickets module: its domain owner confirms it.

## Decision

- Each payment attempt of an expired order that nobody confirmed is asked about at its provider
  once more. The API's expiry job does it after each of its runs, with the question the expiry
  itself asks.
- An attempt is asked about from an hour after the end of its order's hold. An order keeps no
  moment of its expiry, and a payment attempt starts only within the hold, so the hour runs from
  there, as the day of
  [0093](0093-change-a-provider-account-under-a-payment-only-where-the-payment-loses-nothing.md)
  does.
- A payment the provider reports is handed to the same three steps as a notification: it is
  settled, which a provider answers well a second time, and it pays the order while what the
  order held is still there, or sends it to review, as every late payment does.
- An attempt the provider answered about is marked with the moment, after a payment it reported
  was taken, and is not asked about again: a provider gets one more question an attempt. The
  mark is the only thing written, and it is written last: a process that dies before it leaves
  the attempt to the next run.
- A provider out of reach, or a payment found that could not be settled, leaves the attempt for
  the next run, for no longer than 24 hours from the end of the hold. An attempt whose provider
  the convention no longer holds an account of has nobody to ask, and is marked.
- The attempts are found across tenants by identifiers alone, of tenants not suspended, and each
  is judged again in its own tenant's transaction.

## Alternatives

- **A state of its own on the attempt between the steps**, written before the settlement and
  cleaned up after. Turned down in 0047, and it stays turned down: asking once more needs no
  state that a dead process leaves behind.
- **Leave it to the provider's repeats.** They stop at the verification, which is the very call
  whose answer was lost.
- **Ask when the buyer starts another attempt**, as an order awaiting payment does. No attempt
  starts for an expired order.
- **Ask at every run for the whole day.** Some 1 400 questions an attempt, nearly all of them
  about an attempt nobody paid, against a provider that limits its API.
- **Ask once, at the end of the day.** A buyer who paid would wait a day for the ticket. An hour
  covers the time a provider lets a buyer finish a payment started within the hold.
- **Ask at once when the order expires.** The expiry already asks then; the payment this is for
  comes after.
- **Mark the attempt first, then ask.** One question for certain, also with several API
  processes, but a process that dies between the two never asks.
- **Let an org ask from the panel.** Nothing tells the org there is anything to ask about.

## Consequences

- A payment attempt gains a column and an index over the attempts still to ask about. The role
  that works across tenants reads the order, the confirmation and the mark of an attempt, and
  nothing a provider said of a payment; the application role writes the mark. A cross-tenant
  query joins the documented ones
  ([ARCHITECTURE.md, Tenant isolation](../ARCHITECTURE.md#tenant-isolation)).
- Every attempt of an expired order costs its provider one more question, and nearly all are
  answered as not paid.
- With several API processes, two that find the same attempt at the same moment may each ask.
  The payment is taken once: the order's lock lets one of them write it.
- A provider account is kept for 24 hours from the end of the hold of an expired order with an
  attempt nobody confirmed (0093), which is the time this question may be asked in.
- What stays open: a payment made later than an hour after the hold whose settlement answer is
  lost, an attempt of an order the expiry left waiting for more than 24 hours past its hold, and
  the other attempts of an order a payment already paid or sent to review, which is expired no
  more. Each needs a second failure on top of the one this record repairs.
- That Przelewy24 reports a transaction it verified, whose answer never arrived, as a payment
  made rests on its documentation (Przelewy24, N6), not on its sandbox.
- 0047 and 0081 stand: no state between the steps, and a payment found late is decided as they
  say.

## Sources

- The review of the shop's code of 2026-11-25: the finding on a payment settled at the provider
  that leaves no trace once its order has expired.
- [Checkout and orders](../specs/0004-checkout-and-orders.md), Y5-Y11 and H3;
  [Przelewy24](../specs/0005-przelewy24.md), N5 and N6.
