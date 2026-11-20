# Discount codes

- Status: Draft
- Domain owner: the domain owner of tickets ([CONTRIBUTORS.md](../../CONTRIBUTORS.md))
- Brief: [0001](../briefs/0001-convention-shop.md), B3 and BR-04
- Decisions: [0061](../adr/0061-lower-a-price-with-a-discount-code-and-give-free-entry-with-one-of-100-percent.md)
  and [0062](../adr/0062-keep-a-discount-codes-terms-in-the-api-and-refuse-every-unusable-code-alike.md),
  proposed; what the owner still has to confirm is among its [open questions](#open-questions)

## Goal

An org lowers a price for chosen buyers with a code, and lets a person entitled to free entry, such
as a convention's guest or its staff, check out with a 100% code and still buy merchandise. It
serves step 6 of the MVP flow ([PRODUCT.md 2](../PRODUCT.md#2-mvp-goal-and-end-to-end-flow)), and
it is how a ticket reaches a person without a payment.

## Business rules

The **Brief** column names where a rule comes from; "new" marks a rule this draft adds for the
domain owner to confirm.

### A code

| #   | Rule                                                                                                                                                            | Brief                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| D1  | A discount code belongs to one edition. It has a value, an amount or a percent, the products it applies to, a usage limit and a validity window.                | B3.1                             |
| D2  | A code applies to ticket types, add-ons and merchandise items the org names. It never applies to a ticket type excluded from discounts, whatever the org named. | B3.1, BR-04                      |
| D3  | A code is 4 to 40 letters, digits and hyphens, unique in its edition, and read without regard to case.                                                          | new                              |
| D4  | A usage limit is a whole number or none. It is never set below the uses orders already hold.                                                                    | B3.1; the second sentence is new |
| D5  | A code an order used is never deleted: the org ends it, and it stays on its orders.                                                                             | new                              |
| D6  | An org with tickets write access to the edition sets its codes, and with read access sees each code's uses against its limit.                                   | B4 of the brief                  |

### In checkout

| #   | Rule                                                                                                                                                                                                                             | Brief                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| K1  | The buyer enters a code on the Summary step. A valid one appears as a line of its own, and the total updates.                                                                                                                    | B3.2                            |
| K2  | An order takes one code.                                                                                                                                                                                                         | B3.1                            |
| K3  | A code lowers the lines it applies to together, as one line of the order: a percent code by that percent of their sum, rounded to the grosz, half up; an amount code by its amount, at most their sum. No total goes below zero. | new; B3.1 names the value alone |
| K4  | A code is refused when it is unknown, outside its window, ended, used up or applies to nothing in the cart. The buyer is told only that the code cannot be used for this order.                                                  | new                             |
| K5  | Trying codes has a rate limit of its own.                                                                                                                                                                                        | NF-05                           |
| K6  | A code's use is held, released and taken again with its order's stock: it counts against the limit while the order holds.                                                                                                        | B3.1                            |
| K7  | When a code was used up after the buyer entered it, the order is not placed and the buyer returns to the Summary with the code marked.                                                                                           | F5.7                            |
| K8  | An order in "Needs review" whose code use is gone is marked paid once an org raises the code's limit, or is declined.                                                                                                            | P2 of the brief                 |

### Free entry

| #   | Rule                                                                                                                                             | Brief      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| E1  | A 100% code applying to a ticket type gives free entry: its holder checks out as any buyer, may add merchandise at its price and gets a QR code. | B3.3       |
| E2  | An order a code brings to a total of zero is "Paid" at once, with no payment step.                                                               | F5.8       |
| E3  | A person paid for outside the shop who should hold a QR code ahead of the edition gets a 100% code, not a manual order.                          | B3.3, B4.5 |

## Shape

### Tables

Edition tables:

| Table                                                                                    | Holds                                                                                                                                                  |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `discount_codes`                                                                         | `code`, kept in lower case; `kind` (`percent`, `amount`), `percent`, `amount_minor`, `usage_limit` (optional), `valid_from`, `valid_until`, `ended_at` |
| `discount_code_ticket_types`, `discount_code_add_ons`, `discount_code_merchandise_items` | what a code applies to                                                                                                                                 |

`orders` ([checkout and orders](0004-checkout-and-orders.md)) gains `discount_code_id`, and an
order's `discount` line carries the amount taken off. A code's uses are counted from the orders
that hold, under a lock of the code's row, the last in the order of locks an order takes.

### Routes

Tenant routes, each under `/editions/{editionId}`:

| Route                             | Needs         | Refuses with                                |
| --------------------------------- | ------------- | ------------------------------------------- |
| `GET /discount-codes`             | tickets>=read |                                             |
| `POST /discount-codes`            | tickets=write | `discount-code.taken`                       |
| `PATCH /discount-codes/{codeId}`  | tickets=write | `discount-code.taken`, `catalog.below-held` |
| `DELETE /discount-codes/{codeId}` | tickets=write | `discount-code.in-use`                      |

The quote and both routes that place an order take an optional code. The quote refuses a code with
`discount-code.refused`; placing refuses one used up meanwhile with `order.unavailable`, naming the
code.

### Screens

| Application | Screen            | Holds                                                                      |
| ----------- | ----------------- | -------------------------------------------------------------------------- |
| panel       | discount codes    | the list with each code's uses and limit; the form of D1–D4; ending a code |
| panel       | an order's page   | the code, on the line of what it took off                                  |
| portal      | checkout, Summary | the code's field, the discount's line, the message of K4                   |

### Seed

A percent code for one ticket type, an amount code for merchandise, a 100% code used once, and a
code used up.

## Tenant isolation and permissions

- The tables are tenant tables under RLS with their own `tenant_id`, composite foreign keys to
  their parents and an index starting with `tenant_id`. A code and what it applies to stay in one
  tenant and one edition.
- A code is looked up inside the edition the shop's address names: another edition's code is
  unknown.
- The org's routes need `tickets` of the edition; a code of another edition or tenant is `404`.
- The limit holds under concurrent orders, as stock does (invariant 9).

## Tests

Integration, in `packages/db/test`: RLS on the tables; a foreign parent refused; two orders for a
code's last use, placed at the same moment, take it once.

Integration, in `apps/api/test`:

- Every route against every actor of the permission matrix.
- A percent and an amount code on a cart of several lines: the sum the code applies to, the
  rounding at half a grosz, an amount above that sum, a ticket type excluded from discounts.
- Each refusal of K4 answers alike; the rate limit.
- A use held, released at expiry and taken again by a payment after the hold; gone, the order
  goes to "Needs review", and is marked paid once the limit is raised.
- A 100% code alone: "Paid" at once; with merchandise: the merchandise's price is paid.
- A code with a use cannot be deleted and can be ended; a limit below the uses held is refused.

e2e:

1. An org makes a code; a buyer enters it and sees the discount's line and the new total.
2. A guest checks out with a 100% code and gets a QR code with no payment step.
3. A code that cannot be used shows the one message of K4.

## Out of scope

- Several codes on one order; a discount applied without a code; a code bound to one account or
  one email.
- A discount on a ticket type excluded from discounts.

## Open questions

- **Records to accept:** discount codes and 100% codes in the MVP, proposed in 0061 (D2 of the
  brief; PRODUCT.md 11 keeps "tickets issued ahead with no order" beyond it), and a code's terms
  kept in the API with one refusal for every code that cannot be used, proposed in 0062.
- **For the domain owner to confirm:** the rules marked "new" above (D3, D4, D5, K3, K4); that a
  code is written in capitals wherever it is shown, whatever case it was typed in; that a new
  code is valid from the moment it is made until the edition ends unless the org says otherwise;
  that an order is placed without a code the shop refused, at the price without it.
