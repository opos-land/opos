# 0055. Record a sale made outside the shop as a manual order

- Status: Accepted
- Date: 2026-11-20

## Context

A convention sells at its desk during the edition, for cash or by card terminal, issues an invoice
to a company that sends several people, and gives a ticket to a guest or a volunteer. None of
these goes through the shop's checkout: there is no buyer at a browser, no payment for OPOS to
confirm, and often no email address to send anything to. Yet each takes a ticket's place or a
T-shirt from the stock the shop sells from, and the convention counts it with the rest.

[Order management](../specs/0006-order-management.md) asks for such sales in the MVP. The product's
scope had named "tickets without a purchase" as beyond it.

## Decision

- A sale made outside the shop is an order like any other, recorded by an org with tickets write
  access: "Paid - manual", with a reason, a desk sale, a sale by invoice or a complimentary one,
  and an optional note.
- It takes stock and capacity under the locks an order placed in the shop takes, and is priced by
  the function that prices a cart
  ([0050](0050-price-a-cart-with-one-function-of-the-contract.md)), against the offer as the shop
  would make it at that moment were it open. A complimentary one costs nothing.
- A sale outside the shop does not wait for the shop: it is recorded while the shop is closed, and
  sells merchandise alone whatever the shop lets a buyer do.
- It asks for no email, stores no consent and requires neither a name nor an answer. Its lines are
  marked handed out as it is recorded: it has no QR code, sends no email and is on no account.
- A person who should hold a QR code ahead of the edition gets a 100% discount code and places
  the order in the shop. A ticket issued ahead with no order stays beyond the MVP.

## Alternatives

- **Every such sale through the shop's checkout**, by an org at the desk with a 100% code. The
  queue at a desk does not wait for an email typed twice, a consent and a payment page, and a
  buyer paying in cash has no reason to give an address.
- **A table of desk sales beside the orders.** Two places to count a ticket type's capacity and a
  variant's stock from, and two lists for the exports and the production numbers to read.
- **A QR code for a manual order.** It would need an address to send it to, and the person stands
  at the desk: what they bought is handed over there.

## Consequences

- A manual order has no email, so its ticket holder's name may be empty, and nothing tells its
  buyer of a correction or a cancellation.
- The desk sells at the price tier in force, so a convention that charges more on site sets a tier
  for the days of the edition.
- A complimentary order is a ticket without a payment, for a person at the desk. The scope of
  [PRODUCT.md 11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp) says so, and keeps the ticket issued
  ahead with no order beyond the MVP.
