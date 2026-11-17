# Sales reports

- Status: Draft
- Domain owner: the domain owner of tickets ([CONTRIBUTORS.md](../../CONTRIBUTORS.md))
- Brief: [0001](../briefs/0001-convention-shop.md), B7 and BR-16
- Decisions: none recorded yet; the records this spec needs are among its
  [open questions](#open-questions)

## Goal

An org sees how an edition sells, as it sells, and takes the lists the convention works from: who
holds a ticket, what merchandise to hand over, which payments came in. It serves step 6 of the MVP
flow ([PRODUCT.md 2](../PRODUCT.md#2-mvp-goal-and-end-to-end-flow)) from the convention's side.

## Business rules

The **Brief** column names where a rule comes from; "new" marks a rule this draft adds for the
domain owner to confirm.

### The dashboard

| #   | Rule                                                                                                                                                                                                                                                       | Brief                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| D1  | An edition's dashboard shows its revenue, the tickets sold of each ticket type, the merchandise sold of each variant, the count of each add-on, headcount-only ones among them, the ticket holders in each age band, and the answers to each custom field. | B7.1                                   |
| D2  | The dashboard is live: it shows the orders as they are when it is opened.                                                                                                                                                                                  | BR-16                                  |
| D3  | Sold means held by a "Paid" or a "Paid - manual" order. What orders awaiting payment and orders needing review hold is shown apart, and a canceled, declined or expired order counts nowhere.                                                              | new; B5.3 counts production numbers so |
| D4  | Revenue is the sum of the totals of the "Paid" orders, and apart from it of the "Paid - manual" ones: the first went through the provider, the second did not.                                                                                             | new                                    |
| D5  | The answers to a custom field are listed with how many orders gave each.                                                                                                                                                                                   | new; B7.1 names the answers alone      |

### The exports

| #   | Rule                                                                                                                                                                                                          | Brief                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| E1  | An org exports three lists of an edition as spreadsheet files: the ticket holders, the merchandise pick list and the payments.                                                                                | B7.2                                        |
| E2  | The ticket holder list has, for each order with a ticket: the order's number and status, the ticket holder's name and age band, the ticket type, the add-ons, the custom field answers and the order's email. | B7.2; the columns are new                   |
| E3  | The merchandise pick list has, for each order holding merchandise: the order's number, the name on it, each item with its variant and quantity, and whether it was handed out.                                | B7.2; the columns are new                   |
| E4  | The payments list has, for each payment attempt: the order's number, the amount, when it was paid, where the money is, and what the provider's module keeps of it.                                            | B7.2, the contract with a provider's module |
| E5  | An export, like the dashboard, needs tickets read access to the edition.                                                                                                                                      | B7.2                                        |
| E6  | A date in a file is in the convention's time zone, and an amount is a number with its currency in a column beside it.                                                                                         | new                                         |
| E7  | A text a buyer typed never runs as a formula in a spreadsheet: a cell that begins with `=`, `+`, `-`, `@`, a tab or a carriage return is written with a leading apostrophe.                                   | new                                         |

## Shape

### Tables

None is new: the reports read the orders, the lines and the payment attempts of
[checkout and orders](0004-checkout-and-orders.md).

### Routes

Tenant routes, each under `/editions/{editionId}`:

| Route                                | Needs         | Answers        |
| ------------------------------------ | ------------- | -------------- |
| `GET /sales`                         | tickets>=read | D1–D5          |
| `GET /exports/ticket-holders`        | tickets>=read | the file of E2 |
| `GET /exports/merchandise-pick-list` | tickets>=read | the file of E3 |
| `GET /exports/payments`              | tickets>=read | the file of E4 |

A file is CSV in UTF-8 with a byte order mark, its fields quoted and separated by semicolons: it
opens as columns in a spreadsheet set to Polish and imports cleanly into any other. It is named
after the edition and the list. The exports share a rate limit an
account. Before the payments file is written, the provider's module is asked again for what an
attempt still lacks, outside the request's transaction.

### Screens

The panel, inside an edition:

| Screen | Holds                                |
| ------ | ------------------------------------ |
| sales  | the dashboard, and the three exports |

## Tenant isolation and permissions

- Every route needs `tickets` of the edition its path names and reads that edition alone; another
  edition or tenant is `404`.
- The exports hold names, email addresses and custom field answers: they go to the org who asked
  and nowhere else, are kept nowhere on the server, and no log line holds their content.
- A read neither queues nor locks: a report never slows a sale.

## Tests

Integration, in `apps/api/test`:

- Every route against every actor of the permission matrix, with another tenant's and another
  edition's identifiers.
- The dashboard over orders in every status: each number of D1, with D3 and D4 kept apart, and a
  canceled order counted nowhere.
- Each file: its columns, a row an order, the convention's time zone at a date near midnight, an
  amount to the cent, a manual order with no email.
- A name, a note and an answer that begin as a formula are written as text.
- The rate limit.

e2e: an org opens the dashboard after two orders and downloads the ticket holder list; an org
without the tickets permission of the edition sees neither.

## Out of scope

- Charts over time, reports sent by email, a report across editions.
- An audit log and an order's change history.
- A data export a person asks for under the GDPR
  ([PRODUCT.md 11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp)).
- The production numbers: [order management](0006-order-management.md).

## Open questions

- **The columns of each list (E2–E4):** worth showing to one org who runs a desk before they are
  fixed.
- **Records before acceptance:** none of its own.
