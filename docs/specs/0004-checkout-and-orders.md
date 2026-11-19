# Checkout and orders

- Status: Draft
- Domain owner: the domain owner of tickets ([CONTRIBUTORS.md](../../CONTRIBUTORS.md))
- Brief: [0001](../briefs/0001-convention-shop.md), F1–F8, Payments, P1 and the requirements they
  lean on
- Decisions: none recorded yet; the records this spec needs are among its
  [open questions](#open-questions)

## Goal

A buyer goes from the convention's page to a paid order with a QR code in under five minutes on a
phone: the edition's shop, a short checkout, the payment through the convention's own provider and
a result page. It serves step 6 of the MVP flow
([PRODUCT.md 2](../PRODUCT.md#2-mvp-goal-and-end-to-end-flow)). It holds the order with its
statuses, the hold on stock and capacity, and what the shop asks of a payment provider's module; it
is built against the fake provider, and [Przelewy24](0005-przelewy24.md) is the first real one.

## Business rules

The **Brief** column names where a rule comes from; "new" marks a rule this draft adds for the
domain owner to confirm.

### The shop

| #   | Rule                                                                                                                                                                                                                                          | Brief                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| S1  | The shop of an edition answers while the edition is published. With its shop open it shows the offer; with its shop closed, or with no ticket type and no merchandise on sale, it shows the org's "sales closed" message instead of products. | F1.1, F1.4, B1.4            |
| S2  | Each ticket type on sale shows its name, its price in force and its short description. A "Merch only" card shows while merch-only orders are on.                                                                                              | F1.1                        |
| S3  | A ticket type outside its sale window is hidden, or shown as "Not yet on sale" or "Sales closed" and not selectable, as the org set. One with no capacity left shows "Sold out" and is not selectable.                                        | F1.2, F1.3                  |
| S4  | The shop names the payment methods the provider's module lists, and its footer shows the seller's details, what the provider's module requires of the page, and links to the edition's documents, its FAQ and the convention's contact.       | F1.1, F5.4                  |
| S5  | The shop never shows how much stock or capacity is left, but "Sold out" and the places left of an add-on below its threshold.                                                                                                                 | F3.2; the first half is new |
| S6  | Every price shows its currency and is a gross amount.                                                                                                                                                                                         | NF-09                       |

### Checkout

| #   | Rule                                                                                                                                                                                                                                                                                                                                        | Brief                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| C1  | Checkout is four steps: Ticket holder, Add-ons, Merch, Summary. A merch-only order has three: Buyer, Merch, Summary. A step with nothing to offer is skipped and hidden.                                                                                                                                                                    | F3.3, F4.9, F7.1                 |
| C2  | Every step shows the steps with the current one marked, the ticket type's name and the running total, updated at once on every change.                                                                                                                                                                                                      | UR-02                            |
| C3  | A buyer who is not signed in is offered, before the email is asked, to go on without an account or to sign in or create one. Signing in, there or later, keeps everything already entered, and the account's email replaces a typed one.                                                                                                    | F2.11                            |
| C4  | The first step shows the ticket type's long description, perks and price, a notice when it is excluded from discounts, and its supporter prices to choose from.                                                                                                                                                                             | F2.1, F2.2                       |
| C5  | The first step asks for the ticket holder's name or nickname and age band; of a visitor, the email and its confirmation, saying the QR code will be sent there; then the edition's custom fields, each required or optional as set.                                                                                                         | F2.3                             |
| C6  | Two emails that differ are refused, with "Emails do not match". An email the provider's module cannot take is refused with a message saying so, also for an order with nothing to pay.                                                                                                                                                      | F2.3, F2.5; the last half is new |
| C7  | A signed-in buyer's email is the account's and cannot be changed, and the ticket holder's name is filled in from the account. An account email the provider's module cannot take cannot pay through it, and checkout says so before the order is placed.                                                                                    | F2.10                            |
| C8  | No error shows before the buyer touched the form. Going on with invalid fields shows each field's own message and moves the focus to the first.                                                                                                                                                                                             | F2.4                             |
| C9  | An age band the ticket type does not allow is refused, naming the ticket types that allow it. "Child" shows that a child enters only with a guardian present. "Teen" shows that the guardian's consent is brought on paper, links the edition's form when it set one, and adds a required checkbox to the summary acknowledging it.         | F2.7, F2.8, F2.9                 |
| C10 | The add-ons step shows each add-on offered with the ticket type and its price. A headcount-only one says no place is reserved. A capacity-limited one cannot be ticked once no place is left.                                                                                                                                               | F3.1, F3.2                       |
| C11 | The merch step shows the pre-order notice while a deadline is set, the perks the ticket includes, and each item with its name, price, description, pictures and the "illustrative image" note.                                                                                                                                              | F4.1, F4.2, F4.3                 |
| C12 | An item with variants shows a picker of the variants that exist, grouped by the first axis, with a size chart that opens without leaving checkout; the buyer cannot go on before choosing one. A variant at zero stock shows as unavailable while the others stay selectable; an item with every variant at zero shows "Sold out".          | F4.4, F4.5                       |
| C13 | The buyer sets a quantity up to the item's limit an order and the stock left. Each chosen variant is a line of its own.                                                                                                                                                                                                                     | F4.7                             |
| C14 | The summary shows the email the QR code goes to, the lines with their prices, the total due and a notice that merchandise is picked up at the edition and not shipped.                                                                                                                                                                      | F5.1                             |
| C15 | The summary lists the edition's consents, each linking its document, with the required ones marked. "Select all required" ticks every required consent of the edition, never an optional one, and the provider's own only when its module allows it. The provider's own consent, when its module requires one, is shown as the module says. | F5.2                             |
| C16 | Back keeps everything entered on later steps. A reload before the payment resumes on the same step with the same data.                                                                                                                                                                                                                      | F6.1, F6.3                       |
| C17 | A buyer who returns to the listing and picks another ticket type is asked whether to keep the merchandise chosen; add-ons the new ticket type does not offer are removed, with a notice.                                                                                                                                                    | F6.2                             |
| C18 | A merch-only order asks for the buyer's name or nickname and, of a visitor, the email; never an age band or a custom field.                                                                                                                                                                                                                 | F7.1                             |
| C19 | An unfinished checkout lives in the buyer's browser alone and holds no stock or capacity. A sign-out clears it.                                                                                                                                                                                                                             | F6.4; the second sentence is new |

### Placing an order

| #   | Rule                                                                                                                                                                                                                                            | Brief                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| O1  | The button that places the order reads "Order and pay" while the total is not zero, and "Order" while it is. Its `pl` rendering states the obligation to pay, as the brief quotes it in F5.6 and F5.8.                                          | F5.6, F5.8                                               |
| O2  | An order is one checkout of an edition with its payment: at most one ticket, for one ticket holder, with its add-ons and merchandise. A merch-only order has no ticket. One email holds any number of orders.                                   | BR-20                                                    |
| O3  | The API enforces every rule the shop displays: nothing is bought by going around the page.                                                                                                                                                      | Panel functions                                          |
| O4  | Placing needs a passed bot check, every required consent and, for a teen, the acknowledgement of C9. Without one of them nothing is placed, and the missing consents are marked. A failed bot check says so and lets the buyer try again.       | F5.3, F5.6, F5.7                                         |
| O5  | Placing checks stock and capacity again. When a ticket type, an add-on or a variant ran out since the buyer chose it, nothing is placed and the buyer returns to the step of what ran out, with it marked.                                      | F5.7                                                     |
| O6  | An order is priced at the tier in force when it is placed. A tier or a sale window that ended less than 30 minutes before still holds for a buyer whose total rests on it: the 30 minutes run from the tier's end, whenever the checkout began. | BR-03; how the 30 minutes are counted is new             |
| O7  | A total that differs from the one the buyer saw places nothing: the buyer is shown the new total and confirms it, or is told the sale closed. A total never changes silently.                                                                   | BR-03, F5.7                                              |
| O8  | A placed order keeps its prices whatever the catalog does later.                                                                                                                                                                                | BR-03                                                    |
| O9  | A placed order with a total above zero is "Awaiting payment" and holds its stock and capacity for 30 minutes: the hold. The buyer is sent to the payment provider.                                                                              | F5.6, BR-25                                              |
| O10 | A placed order with a total of zero is "Paid" at once, with no payment step and no provider's consent, and its confirmation is sent.                                                                                                            | F5.8                                                     |
| O11 | An order stores each consent with the exact document version accepted and the time, and with them the teen's acknowledgement and the provider's own consent.                                                                                    | NF-07, BR-13                                             |
| O12 | One email holds at most three orders awaiting payment in an edition; a fourth is refused until one is paid or expires.                                                                                                                          | NF-05; the number is new                                 |
| O13 | An order has a number of ten characters, letters and digits that are not mistaken for one another, unique in its convention. It carries no personal data and does not tell how many orders came before it.                                      | the contract with a provider's module; the format is new |

### The hold and the limits

| #   | Rule                                                                                                                                                                                                                           | Brief                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| H1  | An order holds its stock and capacity while it is "Awaiting payment", "Paid" or "Paid - manual", and while it is "Needs review" having held them when it got there. It holds nothing once "Expired", "Declined" or "Canceled". | BR-25, the order statuses      |
| H2  | A headcount-only add-on and a variant with unlimited stock take nothing.                                                                                                                                                       | BR-10, B2.3                    |
| H3  | The hold does not limit when the order can be paid, and an order is not expired while its provider reports a payment made within the hold.                                                                                     | BR-25                          |
| H4  | No limit is exceeded by orders placed at the same moment.                                                                                                                                                                      | invariant 9 of ARCHITECTURE.md |

### Paying

| #   | Rule                                                                                                                                                                                                                                                                                                         | Brief                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Y1  | An order is paid only when its provider's module confirms the payment to the API, through the provider's whole process. The buyer's return to the shop is never proof of payment.                                                                                                                            | Payments                               |
| Y2  | A payment attempt starts only within the hold. It carries the amount and currency, the order's number as its reference, a description with no personal data and the address the buyer returns to.                                                                                                            | BR-25, the contract                    |
| Y3  | Before a new attempt starts, the module is asked about the earlier ones. None starts when an earlier one was paid: that payment is confirmed instead.                                                                                                                                                        | the contract                           |
| Y4  | A failed or canceled attempt leaves the order "Awaiting payment", and the buyer tries again without entering anything anew. An attempt is recorded as failed only when the provider reports it, and a failure does not close it: a payment confirmed for it later still counts.                              | P1.2, P1.3, F8.3; the last half is new |
| Y5  | When the provider confirms the order's total, the order becomes "Paid", its stock is committed and its confirmation is sent once, also when the buyer never returned. A repeated confirmation changes nothing.                                                                                               | P1.1, P1.4, P1.5                       |
| Y6  | When the hold ends, the module is asked about the order's open attempts. With no payment made within the hold the order becomes "Expired", releases its stock, capacity and discount code use, and its buyer is told. A payment made within the hold counts as made in time whenever its confirmation comes. | P1.6, BR-25                            |
| Y7  | A payment of the order's total confirmed for an "Expired" order makes it "Paid" while its stock, capacity and discount code use are still there, taking them again. Otherwise the order goes to "Needs review" and takes nothing.                                                                            | P1.9, P2.2, BR-24                      |
| Y8  | A confirmed amount that differs from the order's total never makes it "Paid": the order goes to "Needs review", keeping what it still holds until it is settled.                                                                                                                                             | P2.1                                   |
| Y9  | An order that goes to "Needs review" has its orgs alerted and its buyer told where the money is, both by email.                                                                                                                                                                                              | P2.1, P2.2                             |
| Y10 | A payment confirmed for a "Paid", "Needs review", "Canceled" or "Declined" order changes nothing of the order. The module refuses it where the provider can. Refused or not, it is shown on the order and the buyer is told where the money is; the orgs are alerted when it could not be refused.           | P1.10, BR-24                           |
| Y11 | No payment passes unnoticed: every confirmation the API takes is kept with its attempt.                                                                                                                                                                                                                      | BR-24                                  |
| Y12 | Each attempt keeps the information its provider's module gives, shown on the order and in the payments export. It keeps nothing of a buyer's card or bank account, whatever the provider sends.                                                                                                              | D8 of the brief                        |
| Y13 | Where the money of a payment is, with the convention or still with the buyer, is a sentence the provider's module gives.                                                                                                                                                                                     | the contract                           |
| Y14 | The totals in the shop, in the emails and at the provider match to the cent.                                                                                                                                                                                                                                 | NF-09                                  |

The orgs alerted are the heads and the orgs with write access to the edition's tickets: those who
can settle the order ([order management](0006-order-management.md)).

### Order statuses

| Status           | Meaning                                                                        | Becomes                                      |
| ---------------- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| Awaiting payment | sent to the provider, holding its stock and capacity                           | Paid (Y5), Expired (Y6), Needs review (Y8)   |
| Paid             | the provider confirmed the total, or the total was zero; the QR code is issued | Canceled                                     |
| Paid - manual    | a manual order, with no QR code                                                | Canceled                                     |
| Expired          | unpaid when its hold ended; holds nothing                                      | Paid or Needs review (Y7), Needs review (Y8) |
| Needs review     | a payment did not match the order, or came once what it needs was gone         | Paid, Declined                               |
| Declined         | an org declined a payment that needed review                                   | nothing                                      |
| Canceled         | an org canceled a paid order                                                   | nothing                                      |

No status changes otherwise. The changes an org makes, and manual orders, are in
[order management](0006-order-management.md).

### The result page

| #   | Rule                                                                                                                                                                                                                                                                                                    | Brief                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| R1  | Once the provider confirmed the payment the buyer sees "Paid", the order's number and that the QR code was emailed.                                                                                                                                                                                     | F8.1                  |
| R2  | A buyer who returned before a confirmation or a reported failure sees "Not paid yet", and the page updates by itself once the payment is confirmed. Within the hold it offers "Try again", as a provider may never report a failure; after the hold it says the order expired and links a new checkout. | F8.2                  |
| R3  | When the provider reported the attempt failed or canceled, the buyer sees why, when the provider says, and "Try again". The reason is one of the shop's own short list, chosen by the provider's code: the provider's own text is not shown.                                                            | F8.3; the list is new |
| R4  | For an order in "Needs review" the buyer sees that the payment arrived, where the money is and that an org will get in touch.                                                                                                                                                                           | F8.4                  |
| R5  | The result page shows no personal data: the order's status and number alone.                                                                                                                                                                                                                            | new                   |

### Accounts, registrations and the order's data

| #   | Rule                                                                                                                                                                                                                                                                                                                   | Brief                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| A1  | A buyer buys only under their own email: the account's when signed in.                                                                                                                                                                                                                                                 | BR-21                                |
| A2  | A visitor's order under the confirmed email of an account is attached to that account once it is paid, and its emails ask the owner to sign in to see it. Checkout answers alike for any email: it never tells whether an email has an account.                                                                        | BR-21, F2.6                          |
| A3  | When an order with a ticket is paid on an account, placed signed in or attached by A2, the account becomes an attendee of the edition: one registration an account and edition, whatever the ticket holder's name. A visitor without an account holds a ticket and no registration, and a merch-only order makes none. | BR-27                                |
| A4  | The ticket holder's name, age band, consents and custom field answers are the convention's data: kept with the order, never on the account.                                                                                                                                                                            | BR-19                                |
| A5  | A paid order of the shop has one QR code. An order that is not paid has none.                                                                                                                                                                                                                                          | BR-11                                |
| A6  | An order outlives its account: a deleted account leaves its orders with the convention, attached to no account.                                                                                                                                                                                                        | PRODUCT.md 10                        |
| A7  | Orders are kept for at least five years from the end of their edition. Nothing purges them in the first shop, and an edition that has an order cannot be deleted.                                                                                                                                                      | BR-26; the last half follows from it |
| A8  | The confirmation of a paid order carries an order link, which opens that order without a sign-in. Its page and its renewal are set in [buyer self-service](0009-buyer-self-service.md).                                                                                                                                | UR-08, the order confirmation        |

### Emails

Every email has a fixed text with the convention's name, is listed on its order and is never lost
to a failed send. It is written in its recipient's language, or the convention's for an address
with no account ([PRODUCT.md 9](../PRODUCT.md#9-languages-markets-and-time-zones)).

| Email                | Sent when                                  | To        | Contains                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Order confirmation   | an order becomes "Paid"                    | the buyer | the lines, the total, the QR code, the pick-up notice, the order link, the seller's details, links to the document versions accepted; for a teen, the guardian consent rule and the form's address; for an email with an account, a sign-in link |
| Order expired        | an unpaid order expires                    | the buyer | a link to start again                                                                                                                                                                                                                            |
| Payment under review | an order goes to "Needs review"            | the buyer | that the payment arrived, where the money is, that an org will get in touch                                                                                                                                                                      |
| Needs review         | an order goes to "Needs review"            | the orgs  | the order's number, what did not match                                                                                                                                                                                                           |
| Payment not needed   | an order gets a payment it no longer needs | the buyer | where the money is; the convention's contact                                                                                                                                                                                                     |
| Payment not needed   | such a payment could not be refused        | the orgs  | the order's number, the payment                                                                                                                                                                                                                  |

### Quality

| #   | Rule                                                                                                                        | Brief |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ----- |
| Q1  | The whole checkout works on a screen 360 px wide.                                                                           | NF-01 |
| Q2  | The shop's pages and the buyer's pages meet WCAG 2.1 AA.                                                                    | NF-02 |
| Q3  | The bot check on placing an order is the portal's, strictly necessary and so asked for in no banner; its fallback meets Q2. | NF-05 |
| Q4  | The shop sets no analytics or advertising cookie.                                                                           | NF-06 |

## Shape

### Tables

All are edition tables.

| Table                        | Holds                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orders`                     | `number`, `status`, `email` (empty for a manual order), `account_id` (optional), `holder_name`, `age_band` (empty for a merch-only order), `total_minor`, `currency`, `holds`, `hold_ends_at`, `placed_at`, `paid_at`, `guardian_consent_acknowledged_at`, `provider_consent_accepted_at`, `result_token_hash`, `qr_code_id` (optional) |
| `order_lines`                | `order_id`, `kind` (`ticket`, `add_on`, `merchandise`, `discount`), the catalog row it sells, `quantity`, `unit_amount_minor`, `amount_minor`, `handed_out_at`, `handed_out_by`                                                                                                                                                         |
| `order_custom_field_answers` | `order_id`, `custom_field_id`, `answer`                                                                                                                                                                                                                                                                                                 |
| `order_consents`             | `order_id`, `consent_id`, `document_version_id`, `accepted_at`                                                                                                                                                                                                                                                                          |
| `order_qr_codes`             | `code_hash`, by which a code is found, and `code`, encrypted with a key the API alone holds, since the order's page and a resent email show it again; `replaced_at`                                                                                                                                                                     |
| `payment_attempts`           | `order_id`, `provider`, `status` (`started`, `paid`, `failed`, `ended`, `refused`), `amount_minor`, `paid_amount_minor`, `paid_at`, `confirmed_at`, `money_with` (`convention`, `buyer`), `provider_reference`, `failure_reason` with the provider's own `failure_code` and `failure_message`, `information` (what Y12 keeps)           |
| `order_emails`               | `order_id`, `kind`, `recipient`, `queued_at`, `sent_at`, `failed_attempts`: the list of an order's emails and the outbox they are sent from                                                                                                                                                                                             |
| `order_links`                | `order_id`, the hash of the link's token, `expires_at`, `ended_at`                                                                                                                                                                                                                                                                      |
| `attendee_registrations`     | `edition_id`, `account_id`, one a pair; it goes with its account (invariant 7)                                                                                                                                                                                                                                                          |

An order's line keeps the price it was sold at; the name comes from the catalog row, which is
never deleted while an order holds it ([catalog](0003-catalog.md), L2). A partial unique index keeps
an order to one `ticket` line. `orders.account_id` empties when its account is deleted.

A QR code, a result token and an order link's token each carry at least 128 random bits; the two
tokens are stored as hashes. The result token opens the result page alone, for 24 hours from the
order's placing. A paid order gets its first order link with its confirmation.

A line's `handed_out_at` and `handed_out_by` are empty until the [scanner](0007-scanner.md) or an
org in the panel marks it ([order management](0006-order-management.md)).

### Limits under concurrent orders

Placing an order, and every later change that takes or returns stock, locks the rows carrying the
limits it touches, in one fixed order: the ticket type, then the add-ons, then the variants, then
the discount code, each by identifier. Only then it counts the lines of the orders that hold
(`orders.holds`) and decides. No route reads a count first and writes after.

### Provider port

The whole port, of which [shop setup](0002-shop-setup.md) uses `connect`:

| Operation      | The shop asks the module to                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect`      | check the convention's credentials and say whether the account is ready to sell                                                                                                                         |
| `requirements` | say what it requires of the shop's pages: its own consent with the wording, the links and whether "Select all required" may tick it; its logo; the limits on fields, such as the longest email it takes |
| `methods`      | list the payment methods the shop names                                                                                                                                                                 |
| `start`        | start a payment attempt (Y2) and answer where to send the buyer                                                                                                                                         |
| `read`         | read a notification of the provider: which attempt, the amount paid and when it was made, or a failure and its reason; refuse one whose signature does not hold                                         |
| `settle`       | finish the provider's process for a payment the order takes; a repeat changes nothing                                                                                                                   |
| `refuse`       | refuse a payment its order no longer needs, and say whether the provider could                                                                                                                          |
| `state`        | tell the state of an attempt when asked: paid, with the amount and the time, or not                                                                                                                     |
| `moneyWith`    | say where the money of a payment is, as the sentence shown to the buyer                                                                                                                                 |
| `information`  | give what an attempt keeps for the orgs: for one, the provider's own number of the transaction                                                                                                          |

A provider's call runs outside every transaction. A confirmation is taken in three steps: a
transaction that reads the notification, locks the order with its limits and decides what the
payment does; the module's `settle` or `refuse`; a transaction that writes the outcome. The order
becomes "Paid" only in the last one, so a `settle` that did not answer leaves the order as it was
and is taken again when the provider repeats its notification.

### Jobs

The API gains two jobs beside the sweep of [file storage](0012-file-storage.md), each safe with
several API processes: a row is claimed under a
lock that others skip.

| Job    | Does                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| expiry | finds the orders awaiting payment whose hold ended, asks the module about their open attempts and applies Y6 |
| emails | sends what `order_emails` queued, with a growing delay after a failure, and marks it sent                    |

### Routes

Public routes, without sign-in:

| Route                                                            | Does                                                                                                                                                              | Refuses with                                                                                                                                                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /public/tenants/{slug}/editions/{editionSlug}/shop`         | the whole offer of S1–S6: the catalog on sale, the edition's age bands, custom fields and consents, the seller's details, the provider's methods and requirements |                                                                                                                                                                                               |
| `POST /public/tenants/{slug}/editions/{editionSlug}/shop/quote`  | the lines and the total of a cart                                                                                                                                 | `shop.closed`, `order.unavailable`                                                                                                                                                            |
| `POST /public/tenants/{slug}/editions/{editionSlug}/shop/orders` | places a visitor's order; answers its number, status and result token                                                                                             | `shop.closed`, `order.unavailable` naming what ran out, `order.total-changed` with the new total, `order.consent-missing`, `order.email-refused`, `order.too-many-unpaid`, `bot-check.failed` |
| `GET /public/tenants/{slug}/orders/{orderId}/result`             | the result page's data, by the result token                                                                                                                       |                                                                                                                                                                                               |
| `POST /public/tenants/{slug}/orders/{orderId}/payment-attempts`  | starts an attempt, by the result token; answers where to send the buyer                                                                                           | `order.hold-ended`, `order.already-paid`, `provider.unavailable`                                                                                                                              |
| `POST /payments/{provider}/notifications/{attemptId}`            | takes the provider's notification                                                                                                                                 |                                                                                                                                                                                               |
| `POST /payments/{provider}/notifications/{attemptId}/additional` | takes what else the provider reports of an attempt: a failure and its reason                                                                                      |                                                                                                                                                                                               |

Tenant routes for a signed-in account, with no membership needed, as a like has none:

| Route                                                          | Does                                                  | Refuses with      |
| -------------------------------------------------------------- | ----------------------------------------------------- | ----------------- |
| `POST /editions/{editionId}/shop/orders`                       | places the account's order, under the account's email | as the public one |
| `POST /editions/{editionId}/orders/{orderId}/payment-attempts` | starts an attempt for the account's own order         | as the public one |

The result token travels in a header, never in a path or a query of the API. Placing an order,
the quote and the start of an attempt each have a rate limit of their own
([ARCHITECTURE.md, API conventions](../ARCHITECTURE.md#api-conventions)). A notification whose
signature does not hold answers as an unknown address and changes nothing.

A failure's reason, as a buyer sees it, is one of `declined`, `insufficient-funds`, `wrong-code`,
`timed-out`, `canceled` and the general `failed`. A provider's module maps its own codes to them;
the provider's code and message stay on the attempt, for the orgs.

### Screens

The portal, under the edition's page at `/conventions/<convention>/<edition>/shop`
([edition list and edition page](0014-edition-list-and-edition-page.md)), each built for 360 px
first:

| Screen             | Holds                                                                |
| ------------------ | -------------------------------------------------------------------- |
| the edition's shop | the offer, or the "sales closed" message                             |
| checkout           | the steps of C1, kept in the tab's storage until the order is placed |
| result             | R1–R4, asking the API again while the payment is not confirmed       |

### Seed

The demo edition gets an order in each status, among them one with a teen as its ticket holder, a
merch-only one, one attached to a demo account with its registration, and a payment an order no
longer needed.

## Tenant isolation and permissions

- Every table is a tenant table under RLS with its own `tenant_id`, a composite foreign key to its
  parent and an index starting with `tenant_id`. An order's lines, answers and consents point at
  catalog and document rows of the same tenant and edition by composite foreign keys.
- The public routes open the tenant from its slug, as the convention's page does: an unpublished
  edition and a suspended tenant answer as an unknown address.
- A suspended tenant sells nothing and takes no payment: a notification for it is refused and taken
  when the provider repeats it after a restoration, and both jobs pass its rows by.
- Three cross-tenant queries are new, each joining the table of
  [ARCHITECTURE.md, Tenant isolation](../ARCHITECTURE.md#tenant-isolation):

  | Query                               | Bound                                                                                                                          |
  | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
  | a payment attempt by its identifier | the notification's path; it returns the tenant and the attempt alone, and nothing counts before the provider's signature holds |
  | the orders whose hold ended         | the API's own job; identifiers alone                                                                                           |
  | the emails queued                   | the API's own job; identifiers alone                                                                                           |

- A2 reads an account by the confirmed email of a paid order, inside the order's tenant
  transaction: one more way the API reaches an account, beside those the global tables allow
  today.
- An account's routes filter on the session's account: an order of another account is `404`.
- Invariant 9 is enforced as "Limits under concurrent orders" says. Two invariants are new: an
  order holds at most one ticket, by the partial unique index; an account has at most one
  registration an edition, by a unique constraint.
- `opos_app` never updates an order's `id`, `tenant_id`, `edition_id`, `number` or prices.

These sentences of the documents change with the code: in ARCHITECTURE.md, the modules waiting for
their owner, the payments rule that "a different amount changes nothing" and that OPOS keeps only
the payment reference, the cross-tenant queries, the global tables, the frontends' rule on
scripts of another origin, and the API conventions, which gain the jobs; in PRODUCT.md, the
glossary's order and the new terms, the data OPOS stores, the retention of orders and the
accessibility of the shop.

## Tests

Integration, in `packages/db/test`:

- RLS on every table; a foreign parent refused by each composite foreign key; a second ticket
  line and a second registration refused.
- The limits under concurrency: two orders for the last ticket, the last variant and the last
  place of an add-on, placed at the same moment, sell one.
- `verify` fails on each new privilege and each new cross-tenant read broken once; the seed, run
  twice, changes no row count.

Integration, in `apps/api/test`, against the fake provider:

- Every route against every actor; the public routes with an unpublished edition, a closed shop
  and a suspended tenant; an account's routes with another account's order.
- Placing: every rule the shop displays broken once through the API alone (the sale window, the
  age band, a hidden product, a variant that does not exist, the limit an order, a required field,
  a required consent, the teen's acknowledgement, the bot check).
- The total: a tier that changed, one that ended 29 and 31 minutes before, a sale window that
  closed, each with the total the buyer saw.
- Each status change of the table, and each one the table does not name refused.
- The hold: released at expiry, kept by a payment made within it and confirmed after, taken again
  by Y7, not taken when gone.
- Confirmations: a repeat, a different amount, a second attempt paid, a payment for each status of
  Y10, a `settle` that does not answer and its repeat, a notification with a bad signature.
- A failure reported: the attempt failed, the order unchanged, the reason on the result page and
  the general one for a code the module does not know; a payment confirmed afterwards for the
  same attempt still pays the order.
- A2 and A3: the answers for an email with and without an account are equal; the order is attached
  and the registration made at the payment, once.
- The emails: each one queued once by its cause, listed on its order, sent again after a failed
  send, in the recipient's language.
- An amount is equal in the quote, the order, the attempt and the email.
- Deleting an account leaves its orders; deleting an edition with an order is refused.

e2e, on a mobile viewport, each scenario making its own tenant and checking the BFF boundary and
the accessibility of every page it opens:

1. A visitor buys a ticket with an add-on and a T-shirt and sees "Paid".
2. A signed-in account buys a ticket and is an attendee of the edition.
3. A merch-only order.
4. A teen: the notices, the checkbox, and the order refused without it.
5. A payment canceled at the provider, then "Try again", then paid.
6. A variant sells out during checkout: the buyer returns to the merch step.
7. A total of zero: "Order", and "Paid" with no payment step.
8. A reload and Back keep the checkout; a sign-out clears it.
9. A closed shop shows the org's message.
10. A payment refused at the provider shows why and offers "Try again".

## Out of scope

- What an org does with an order: [order management](0006-order-management.md).
- Discount codes, whose line and held use the order already carries:
  [discount codes](0008-discount-codes.md).
- The order link's page, an account's orders and "Buy more":
  [buyer self-service](0009-buyer-self-service.md).
- Refunds through OPOS, a buyer's own cancellation, invoices and receipts, a ticket passed to
  another person by the buyer.
- Several tickets in one order; a countdown of the hold; an order payable longer than its hold; a
  visitor's way back to an unpaid order after the tab is closed.
- The QR code and the order link on the result page.
- The payment methods as the provider returns them for the account and the amount: a fixed list a
  provider until then.
- Emails an org edits; emails in the language of the checkout.
- Claiming a visitor's orders after an account is made with their email.
- Purging orders past their retention.

## Open questions

- **The owner of attendee registrations (A3):** this spec creates `attendee_registrations` with
  only what a paid ticket needs. It needs the answer whether the domain owner of tickets owns
  registrations that far ([CONTRIBUTORS.md](../../CONTRIBUTORS.md)).
- **A deleted tenant's orders (A7):** [platform administration](0001-platform-administration.md)
  lets the admin delete a suspended tenant with everything it owns, and left the orders to this
  module. Five years of retention and that deletion cannot both hold. This draft's proposal: the
  deletion is refused while the tenant holds an order inside its retention.
- **The bot check (Q3):** it is the portal's, and nothing specifies it yet. This spec needs only a
  token the API can verify, and is built against a stand-in for it on `local` and `dev`.
- **Records before acceptance:** an order holding at most one ticket (D5 of the brief, with
  PRODUCT.md 3); "Needs review", a payment after the hold and the information an attempt keeps
  (D8), a record superseding that part of
  [0010](../adr/0010-send-ticket-payments-to-the-conventions-own-account.md); WCAG 2.1 AA (D9);
  the bot check outside the consent banner (D12), the team's record amending
  [0026](../adr/0026-run-a-tracker-only-with-consent-and-none-in-the-panel.md); the retention of
  orders (D13) and the data of D7, with PRODUCT.md 10.
