# Order management

- Status: Implemented
- Domain owner: the domain owner of tickets ([CONTRIBUTORS.md](../../CONTRIBUTORS.md))
- Brief: [0001](../briefs/0001-convention-shop.md), B4, P2, B5.3 and B6.5
- Decisions: [0055](../adr/0055-record-a-sale-made-outside-the-shop-as-a-manual-order.md),
  [0056](../adr/0056-cancel-and-decline-an-order-without-returning-money.md),
  [0057](../adr/0057-search-an-orders-qr-code-by-a-hash-the-panel-makes.md),
  [0058](../adr/0058-let-the-api-change-the-variant-an-order-line-names.md) and
  [0068](../adr/0068-keep-what-a-sent-email-of-an-order-said-without-what-hands-the-order-over.md),
  proposed; what the owner still has to confirm is among its [open questions](#open-questions)

## Goal

What an org does with an edition's orders in the panel, without a developer's help: find and read
them, correct them, record a sale made outside the shop, cancel a paid one and settle every order
that needs review. It serves steps 6 and 10 of the MVP flow
([PRODUCT.md 2](../PRODUCT.md#2-mvp-goal-and-end-to-end-flow)) from the convention's side. The
orders themselves, their statuses and their payments are set in
[checkout and orders](0004-checkout-and-orders.md).

## Business rules

The **Brief** column names where a rule comes from; "new" marks a rule this draft adds for the
domain owner to confirm. Reading an edition's orders needs tickets read access to it; every change
needs write access.

### Finding and reading

| #   | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Brief       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| F1  | An org searches an edition's orders by number, name, email or QR code, and filters them by status, product, variant and date.                                                                                                                                                                                                                                                                                                                                                           | B4.1        |
| F2  | An order's page shows its lines, the ticket holder's data, the custom field answers, the consents with the document versions accepted, the payment attempts with what the provider's module keeps of each, and the emails sent.                                                                                                                                                                                                                                                         | B4.2        |
| F3  | The panel lists every order in "Needs review" until it is settled, and shows on the edition how many there are.                                                                                                                                                                                                                                                                                                                                                                         | P2.5, UR-12 |
| F4  | An org sees every email of the edition's orders in one list, the newest first, searched by the address it went to or by its order's number. An email's page shows to whom it went, of which order and when, and what it said as it went out: a subject and a text in the convention's language, without the QR code and the order link, which only its recipient sees, and with nothing that tells whether its address has an account. An email that has not gone out says nothing yet. | new         |

### Corrections

| #   | Rule                                                                                                                                                                                           | Brief                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| C1  | Changing the ticket holder's name is only an edit: nothing else changes with it.                                                                                                               | B4.3                      |
| C2  | Changing an order's email gives the order a new QR code and a new order link; the old ones stop working, and both addresses are emailed. It is the only way a ticket passes to another person. | B4.3, BR-22               |
| C3  | After a changed email the order and its attendee registration stay on the account they were on.                                                                                                | B4.3                      |
| C4  | An org swaps a merchandise line's variant for another variant of the same item: the stock moves between them, and the swap is refused when the other has none.                                 | B4.4                      |
| C5  | Each correction emails the buyer what changed.                                                                                                                                                 | the "Order changed" email |
| C6  | A correction is made on a "Paid" or a "Paid - manual" order. A manual order has no email to change, and gets no email.                                                                         | new                       |

### Manual orders

| #   | Rule                                                                                                                                                                                                                                                    | Brief                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| M1  | An org records a sale made outside the shop in the panel, never through the shop's checkout: a desk sale paid in cash or by card terminal, a sale paid by invoice, or a complimentary one. It is "Paid - manual" with that reason and an optional note. | B4.5                                            |
| M2  | A manual order takes stock and capacity like any order, holds at most one ticket, and is priced at the tier in force, so a sale at the desk sells the same catalog at the on-site prices. A complimentary order has a total of zero.                    | B4.5, B6.5; the zero is new                     |
| M3  | A manual order asks for no email. What it sells is handed over at the desk as it is recorded, an attendee badge for a ticket, and its lines are marked handed out then: it has no QR code, sends no email and has nothing to scan.                      | B4.5, BR-11                                     |
| M4  | A manual order with a ticket takes the ticket holder's age band, within the bands the ticket type allows. The name and the custom fields are offered and none is required. No consent is stored.                                                        | new; B4.5 does not say what a manual order asks |
| M5  | A manual order makes no attendee registration: it is on no account.                                                                                                                                                                                     | BR-27                                           |
| M6  | A person who should hold a QR code ahead of the edition gets a 100% code instead, and the manual order's screen says so.                                                                                                                                | B4.5, B3.3                                      |

### Canceling

| #   | Rule                                                                                                                                                                                                      | Brief       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| X1  | An org cancels a "Paid" or a "Paid - manual" order, with a reason. The order becomes "Canceled" and its stock and capacity return.                                                                        | B4.7        |
| X2  | A canceled order's QR code is refused at the scanner. A code shared by several orders is refused once every order on it is canceled.                                                                      | B4.7, F9.4  |
| X3  | The buyer of a shop order is emailed that the QR code is no longer valid.                                                                                                                                 | B4.7        |
| X4  | A cancellation is only a cancellation: the attendee registration stays, and OPOS returns no money. Returning it is the convention's matter, outside OPOS, and the screen says so before the org confirms. | B4.7, BR-23 |
| X5  | An order is canceled whole. A single line is not canceled: an org swaps a variant, or cancels the order.                                                                                                  | Postponed   |

### Settling a review

| #   | Rule                                                                                                                                                                                                                                                                                         | Brief              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| R1  | The orgs alerted when an order goes to "Needs review" are the heads and the orgs with tickets write access to its edition: those who can settle it.                                                                                                                                          | P2                 |
| R2  | An org marks an order in "Needs review" paid. An order that kept its hold becomes "Paid" as it is. One that holds nothing has its stock, capacity and discount code use checked again and taken, and the marking is refused while any of them is gone: the org raises it first, or declines. | P2.1, P2.3         |
| R3  | An order marked paid becomes "Paid", gets its QR code and its confirmation, and a ticket on an account its registration.                                                                                                                                                                     | P2.3               |
| R4  | An org declines an order in "Needs review", with a reason. The order becomes "Declined", holds nothing and never gets a QR code; the buyer is emailed that the payment was declined and where the money is.                                                                                  | P2.4               |
| R5  | Marking paid an order whose payment differed from its total leaves the total as it is: the difference is settled by the convention, outside OPOS. The order's page shows the amount paid beside the total, and the difference.                                                               | new; follows BR-23 |

### Resending and production numbers

| #   | Rule                                                                                                                                                 | Brief |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| S1  | "Resend QR" sends the order's confirmation again to the order's email, with the same QR code and a fresh order link.                                 | B4.6  |
| S2  | Once the pre-order deadline has passed, an org reads the production numbers: the count of every variant, to send to the manufacturer, as a file too. | B5.3  |
| S3  | The production numbers count the paid orders, manual ones among them, and apart from them the orders awaiting payment and those needing review.      | B5.3  |

### Handing out in the panel

| #   | Rule                                                                                                                                                                     | Brief |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| H1  | An org with tickets write access marks entry or items as handed out on an order's page, for a buyer whose QR code cannot be read. The time is recorded, with no scanner. | new   |
| H2  | An org with tickets write access takes a hand-out mark back on the order's page, whoever made it.                                                                        | new   |

### Emails

| Email          | Sent when                                              | To                                        | Contains                                                                                 |
| -------------- | ------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| Order changed  | an org edits the ticket holder, the email or a variant | the buyer; on a new email, both addresses | what changed; to the new address the new QR code and order link, to the old one a notice |
| Order declined | an org declines an order that needed review            | the buyer                                 | that the payment was declined, where the money is, the convention's contact              |
| Order canceled | an org cancels a paid shop order                       | the buyer                                 | that the QR code is no longer valid, the convention's contact                            |

## Shape

### Tables

No table is new. `orders` ([checkout and orders](0004-checkout-and-orders.md)) gains `manual_reason`
(`desk`, `invoice`, `complimentary`), `note`, `review_cause` (`amount`, `unavailable`),
`canceled_at`, `cancel_reason`, `declined_at` and `decline_reason`. A changed email replaces the
order's row in `order_qr_codes`: the old one keeps its `replaced_at`, so the scanner can say why it
is refused. `order_emails` gains `subject` and `body`: what an email said, written as it is marked
sent and empty until then
([0068](../adr/0068-keep-what-a-sent-email-of-an-order-said-without-what-hands-the-order-over.md)).

### Routes

Tenant routes, each under `/editions/{editionId}`:

| Route                                              | Needs                                                                       | Refuses with                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `GET /orders`                                      | tickets>=read; a page of at most 100, with the search and the filters of F1 |                                                                |
| `GET /orders/{orderId}`                            | tickets>=read                                                               |                                                                |
| `GET /order-emails`                                | tickets>=read; a page of at most 100, with the search of F4                 |                                                                |
| `GET /order-emails/{emailId}`                      | tickets>=read                                                               |                                                                |
| `PATCH /orders/{orderId}/holder`                   | tickets=write                                                               | `order.not-correctable`                                        |
| `PUT /orders/{orderId}/email`                      | tickets=write                                                               | `order.not-correctable`                                        |
| `PUT /orders/{orderId}/lines/{lineId}/variant`     | tickets=write                                                               | `order.not-correctable`, `order.unavailable`                   |
| `POST /orders/manual`                              | tickets=write                                                               | `order.unavailable` naming what ran out                        |
| `POST /orders/{orderId}/resend-confirmation`       | tickets=write                                                               | `order.not-paid`                                               |
| `POST /orders/{orderId}/cancel`                    | tickets=write                                                               | `order.not-cancelable`                                         |
| `POST /orders/{orderId}/mark-paid`                 | tickets=write                                                               | `order.not-in-review`, `order.unavailable` naming what is gone |
| `POST /orders/{orderId}/decline`                   | tickets=write                                                               | `order.not-in-review`                                          |
| `POST /orders/{orderId}/hand-outs`                 | tickets=write                                                               | `order.not-paid`, `scan.already-handed-out`                    |
| `DELETE /orders/{orderId}/lines/{lineId}/hand-out` | tickets=write                                                               |                                                                |
| `GET /production-numbers`                          | tickets>=read                                                               | `production.before-deadline`                                   |
| `GET /production-numbers/export`                   | tickets>=read                                                               | `production.before-deadline`                                   |

A QR code is searched by its SHA-256 hash, which the panel makes and sends as `qrCodeHash`: the
code never travels in an address, where a log would keep it. Resending has a rate limit of its
own, an order. The export is a file as [sales reports](0010-sales-reports.md) writes its own,
its columns in the language the panel shows, which it sends with the request.

A manual order is priced against the offer the shop would make at that moment were it open: it
is recorded while the shop is closed, and sells merchandise alone whatever the shop lets a buyer
do. An edition that set no pre-order deadline takes no pre-order, so its production numbers wait
for nothing.

A correction is two kinds of email, one for the ticket holder's name and one for a variant, each
written from the order as it stands when it is sent; a changed email is one to the new address
and one to the old. An email that carries the QR code goes only to the address the order has
when it is sent: one still queued for an address the order has left is withdrawn. An order's page
and the list of F4 show an alert to the orgs without their addresses, and name no account; the
search of F4 finds an alert by its order's number alone. What is kept of an email is written as
for an address with no account, in the convention's language, and has `[…]` where its QR code and
the token of its order link stood.

### Screens

The panel, inside an edition:

| Screen             | Holds                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| orders             | the list with the search and the filters; the orders needing review first                                                                    |
| an order           | F2; the corrections; resending; the cancellation; marking a hand-out and taking one back; for an order in review, marking paid and declining |
| emails             | the list of F4 with its search; a row opens the email                                                                                        |
| an email           | to whom it went, of which order and when; what it said, and that the QR code and the order link are left out of it                           |
| new manual order   | the catalog at the prices in force, the reason and the note, the fields of M4, and the notice of M6                                          |
| production numbers | S2 and S3, with the export                                                                                                                   |

A cancellation, a decline and a changed email each ask first in a modal that names the order, says
what goes with it and that it cannot be undone
([0023](../adr/0023-ask-in-a-modal-before-an-action-that-cannot-be-undone.md)); the modal of a
cancellation carries the sentence of X4.

### Seed

The orders the seed of checkout and orders makes cover each status; this spec adds a manual order
of each reason and an order whose email was changed. Each email the seed lists as sent says what
one of its kind says: the seed sends nothing.

## Tenant isolation and permissions

- Every route needs `tickets` of the edition its path names; an order of another edition or
  another tenant is `404`.
- Every route at `write` judges its actor again under the tenant's write lock
  ([0008](../adr/0008-serialize-the-writes-of-a-tenant.md)). A manual order, a swap, a
  cancellation and a marking as paid also lock the rows carrying the limits they touch, in the
  order an order placed in the shop takes them (invariant 9).
- R1 reads the edition's heads and orgs with tickets write access inside the tenant's transaction;
  an expired membership gets no alert.
- An org's search reads names and email addresses of the edition's orders alone.
- What an email said is read within its tenant, by an org with `tickets` of its edition; the role
  that works across tenants is granted neither its subject nor its text.

## Tests

Integration, in `apps/api/test`:

- Every route against every actor of the permission matrix, with another tenant's and another
  edition's identifiers.
- The search by each of number, name, email and QR code, and each filter.
- A changed name changes nothing else. A changed email: a new QR code and order link, the old
  ones refused, both addresses emailed, the account and the registration unchanged.
- A swap moves stock and is refused without it, also against an order placed meanwhile.
- A manual order: each reason; stock taken and refused when gone; no QR code, no email, no
  registration; the price of the tier in force, and zero for a complimentary one; its lines
  marked handed out; a ticket without a name.
- A hand-out marked on an order's page and taken back; a line already handed out refused, also
  against a scanner marking it at the same moment.
- A cancellation of a shop order and of a manual one: the stock back, the QR code refused, the
  email sent to the first and not the second, the registration kept; each other status refused.
- Marking paid: an order that kept its hold; one whose stock is still there; one whose stock is
  gone, refused, then allowed once raised. Declining: the status, nothing held, the email.
- The alerts reach the heads and the orgs with tickets write access, and nobody else.
- The production numbers before and after the deadline, with orders in each status.
- What is kept of a sent email: its subject and text, with no QR code and no token of an order
  link in them, for each kind of email that carries one; the same for an address with an account
  as for one with none, in the convention's language; nothing of an email whose send failed. The list of F4: its order, its search, an alert without its address and
  found by no address, no email of another edition.

e2e, each scenario making its own tenant and checking the BFF boundary:

1. An org finds an order by its buyer's email, corrects the ticket holder's name and resends the
   confirmation.
2. A changed email: the new address gets the QR code, and the order link sent before is ended.
   That an ended link opens nothing is the scenario of
   [buyer self-service](0009-buyer-self-service.md), which brings the link's page.
3. A sale at the desk recorded as a manual order lowers the stock the shop shows.
4. A paid order is canceled through the modal, and its stock returns.
5. An order in review is listed first; raising the stock lets the org mark it paid.
6. An org with tickets read access sees the orders and can change nothing.
7. An org finds the confirmation of a paid order among the edition's emails and reads what it
   said, without the QR code it carried.

## Out of scope

- Refunds through OPOS, full or partial; canceling a single line.
- An audit log and an order's change history.
- Moving an order and its registration to the account of its new email.
- Releasing the holds of orders that have held an item for long; an alert when a variant's stock
  runs low.
- The scanner: [scanner](0007-scanner.md). The exports and the dashboard:
  [sales reports](0010-sales-reports.md).

## Open questions

- **Records to accept:** manual and complimentary orders and desk sales in the MVP (D2 of the
  brief), proposed in 0055 with the change of PRODUCT.md 11 it brings; an org canceling paid
  orders and declining payments while OPOS returns no money (D14), proposed in 0056; keeping what
  a sent email said, without its QR code and its order link, proposed in 0068.
- **For the domain owner to confirm:** that a manual order is recorded while the shop is closed
  and sells merchandise alone where the shop does not; that every line of a manual order, one
  paid by invoice too, is handed out as it is recorded; that the production numbers of an edition
  with no pre-order deadline are read at any time; that the reason of a cancellation or a decline
  is not sent to the buyer; that an org reads what an email said (F4), in the convention's
  language and not the one it went out in, and for how long its text is kept.
