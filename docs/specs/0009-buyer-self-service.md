# Buyer self-service

- Status: Draft
- Domain owner: the domain owner of tickets ([CONTRIBUTORS.md](../../CONTRIBUTORS.md))
- Brief: [0001](../briefs/0001-convention-shop.md), F9 and P1.7
- Decisions: [0063](../adr/0063-open-an-order-link-by-a-token-after-the-hash-found-across-tenants.md)
  and [0064](../adr/0064-add-to-a-paid-order-with-an-order-of-its-own-on-the-same-qr-code.md),
  proposed; what the owner still has to confirm is among its [open questions](#open-questions)

## Goal

What a buyer does after the order is placed, without writing to the convention: a visitor opens
the order from a link in the email, and a signed-in account sees its orders in a convention, pays
one still unpaid, gets the QR code sent again and buys more for the same ticket. It serves step 6
of the MVP flow ([PRODUCT.md 2](../PRODUCT.md#2-mvp-goal-and-end-to-end-flow)).

## Business rules

The **Brief** column names where a rule comes from; "new" marks a rule this draft adds for the
domain owner to confirm.

### The order link

| #   | Rule                                                                                                                                                    | Brief                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| K1  | An order link is an emailed link that opens one order without a sign-in. It carries a secret nobody can guess.                                          | UR-08, PRODUCT.md 7                            |
| K2  | The order's page shows its lines, its status, the QR code when it is paid, and the edition's pick-up information. Nothing on it can be changed.         | F9.1                                           |
| K3  | An order link is valid until 30 days after its edition ends.                                                                                            | new; the brief leaves the validity to the spec |
| K4  | An expired link shows nothing of the order and offers to send a fresh link to the order's email. The answer is the same whether a link was sent or not. | F9.2; the second sentence is new               |
| K5  | A changed email of the order ends every link sent before.                                                                                               | B4.3                                           |
| K6  | The confirmation of an order on an account carries a sign-in link beside the order link.                                                                | BR-21, the order confirmation                  |
| K7  | An edition gives its pick-up information: where and when merchandise is handed over.                                                                    | F9.1; where it is set is new                   |

### An account's orders

| #   | Rule                                                                                                                                                                             | Brief      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| U1  | A signed-in account sees, on a convention's page, its orders in that convention, the newest first.                                                                               | F9.3       |
| U2  | A paid order offers "Resend QR code", which sends its confirmation again to the order's email, and "Buy more".                                                                   | F9.3       |
| U3  | An unpaid order within its hold offers "Pay now", which starts a new payment attempt without changing the order. After the hold nothing starts: the buyer begins a new checkout. | F9.3, P1.7 |
| U4  | An account sees and acts on its own orders alone.                                                                                                                                | BR-21      |

### Buy more

| #   | Rule                                                                                                                                                                                                                | Brief                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| B1  | "Buy more" on a paid order opens a checkout for the same edition and the same ticket holder. It offers the add-ons and the merchandise of the order's ticket type, or for a merch-only order the merchandise alone. | F9.4                              |
| B2  | That checkout sells no ticket and asks nothing of the ticket holder again: its steps are Add-ons, Merch and Summary, with the consents of the edition.                                                              | new; F9.4 fixes the ticket holder |
| B3  | Merchandise already bought on the same QR code is marked "already ordered", and can be ordered again. An add-on already bought is marked so and cannot.                                                             | F9.4; the add-on's half is new    |
| B4  | Once paid, what was bought joins the first order's QR code, and the scanner shows both orders. Its confirmation carries that same code.                                                                             | F9.4, BR-11                       |
| B5  | Each order on a shared QR code is canceled on its own. The code is refused once every order on it is canceled.                                                                                                      | F9.4                              |
| B6  | A visitor has no "Buy more": buying again is a new order with a QR code of its own.                                                                                                                                 | F9.4                              |

## Shape

### Tables

None is new. `orders` ([checkout and orders](0004-checkout-and-orders.md)) gains
`extends_order_id`, the order a "Buy more" order was started from; once paid, it carries the QR
code that order carries. `edition_shops` gains `pickup_information`.

An order's links live in `order_links` of checkout and orders, which makes the first one with the
confirmation. A fresh link is a new token, and the earlier ones stay valid until they expire.

### Routes

Public routes, without sign-in:

| Route                            | Does                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `POST /public/order-links/open`  | answers the order of K2 for a valid token, and for an expired one only that it expired     |
| `POST /public/order-links/renew` | queues a fresh link to the order's email for an expired token; answers alike for any token |

The token travels in the request's body, never in a path or a query of the API. Both routes have a
rate limit of their own.

Tenant routes for a signed-in account, with no membership needed:

| Route                                             | Does                               | Refuses with     |
| ------------------------------------------------- | ---------------------------------- | ---------------- |
| `GET /orders/mine`                                | the account's orders in the tenant |                  |
| `POST /orders/mine/{orderId}/resend-confirmation` | U2, for the account's own order    | `order.not-paid` |

"Pay now" is the account's route of checkout and orders that starts a payment attempt. Placing the
account's order takes an optional order to extend, refused with `order.not-extendable` unless that
order is the account's own, of the same edition and paid.

### Screens

The portal:

| Screen                          | Holds                                                             |
| ------------------------------- | ----------------------------------------------------------------- |
| an order, opened by its link    | K2, or the offer of K4                                            |
| the convention's page           | for a signed-in account, its orders with the actions of U2 and U3 |
| checkout, started by "Buy more" | the steps of B2, with the marks of B3                             |

### Seed

The demo account's paid order gets a "Buy more" order on the same QR code; one demo order has a
valid link and one an expired link.

## Tenant isolation and permissions

- An order link is looked up by the hash of its token in a new cross-tenant query, bound by the
  token the caller proved; it returns the tenant and the order alone, and the order is then read
  inside its tenant's transaction
  ([ARCHITECTURE.md, Modules waiting for their domain owner](../ARCHITECTURE.md#modules-waiting-for-their-domain-owner)).
  A suspended tenant's link answers as an unknown one.
- An account's routes filter on the session's account: another account's order is `404`, also as
  the order to extend.
- A "Buy more" order shares a QR code only with an order of the same account, tenant and edition,
  by a composite foreign key and the check of the route.
- An order an org moved to another email is no longer added to, and shares its QR code with no
  order of its old address: a changed email is the one way a ticket passes to another person
  ([order management](0006-order-management.md)).
## Tests

Integration, in `packages/db/test`: `verify` fails on the new cross-tenant read broken once; an
order extending another edition's or another tenant's order refused.

Integration, in `apps/api/test`:

- A link: valid, expired, ended by a changed email, unknown, of a suspended tenant; the answers
  of the renewal are equal for each; the rate limits.
- The page of a link carries what K2 lists and no email address.
- An account's orders: its own alone, of the tenant alone; "Resend QR code" for a paid order and
  refused for any other; "Pay now" within and after the hold.
- "Buy more": no ticket sold, the ticket holder unchanged, the marks of B3, an add-on already
  bought refused, the QR code shared once paid, each order canceled on its own, the code refused
  once both are canceled.
- Extending another account's order, an unpaid one and one of another edition is refused.

e2e, on a mobile viewport:

1. A visitor opens the order from the email's link and sees the QR code; an expired link sends a
   fresh one.
2. A signed-in account pays an unpaid order with "Pay now".
3. A signed-in account buys a T-shirt with "Buy more"; the scanner shows both orders on one code.

## Out of scope

- A visitor's way back to an unpaid order, and "Pay now" from an email.
- An account's orders across conventions.
- Claiming a visitor's orders after an account is made with their email; an account offered after
  the order is placed.
- A buyer changing or canceling an order, passing a ticket on, or downloading a receipt.
- The QR code and the order link on the result page.

## Open questions

- **Records to accept:** the order link's token after the `#` and its lookup across tenants,
  proposed in 0063, and "Buy more" as an order of its own on the same QR code, proposed in 0064.
- **For the domain owner to confirm:** the rules marked "new" above (K3, K4, K7, B2, B3); that a
  link sent after its edition's 30 days opens for 30 days from its sending; that a fresh link is
  sent at most once an hour for an order; that the page of a link names neither the ticket
  holder nor an email address; that a link of an edition no longer published opens nothing, and
  an account's list leaves such an order out; that "Pay now" brings the buyer back to the
  convention's page, not to the result page; that an add-on held by a "Buy more" order still
  awaiting payment counts as bought; that a "Buy more" order paid after its first order was
  canceled gets a QR code of its own; that the pick-up information is set beside how
  merchandise sells and shown whenever it is set.
