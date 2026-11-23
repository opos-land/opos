# 0056. Cancel and decline an order without returning money

- Status: Accepted
- Date: 2026-11-20

## Context

A ticket payment goes to the convention's own payment provider account
([0010](0010-send-ticket-payments-to-the-conventions-own-account.md)): OPOS never holds the
money, and has no part in the convention's contract with its provider. A convention still has to
take a paid order back, when a buyer cannot come or bought twice, and has to settle an order whose
payment did not match it.

Refunds from the panel are beyond the MVP
([PRODUCT.md 11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp)).

## Decision

- An org with tickets write access cancels a "Paid" or a "Paid - manual" order, with a reason, and
  declines an order that needs review, with a reason. Each changes the order alone: it holds
  nothing from then on, so its stock and capacity return, and its buyer is told.
- OPOS returns no money and asks no provider to. Returning it is a matter between the convention
  and the buyer, at the provider or outside it. The panel says so in the modal that confirms a
  cancellation or a decline.
- An order marked paid after a review stays at the total it was placed at, whatever was paid: the
  order's page shows both amounts and the difference, for the convention to settle.
- An order is canceled whole. A canceled order keeps its QR code, so the scanner can say why it
  is refused, and stays on the account it was on.

## Alternatives

- **Ask the provider's module to return the money on a cancellation.** Each provider returns money
  its own way, in full or in part, with fees and delays of its own, and a failed return would
  leave an order canceled and unpaid back. It is the refund module the scope postpones.
- **Only a developer cancels.** The flow of the MVP is done when it works with no manual database
  edits.
- **Change the total of an order marked paid to what was paid.** The order would no longer say
  what was sold at what price, which the convention's accounts rest on.

## Consequences

- A cancellation is a word between the org and the buyer first: the panel gives no way to check
  that the money went back.
- The reason of a cancellation or a decline is kept on the order for the team, and is not sent to
  the buyer.
- A canceled order is not brought back: the buyer orders again.
