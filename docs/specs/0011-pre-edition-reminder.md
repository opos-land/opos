# Pre-edition reminder

- Status: Draft
- Domain owner: the domain owner of tickets ([CONTRIBUTORS.md](../../CONTRIBUTORS.md))
- Brief: [0001](../briefs/0001-convention-shop.md), the "Pre-edition reminder" email
- Decisions: none of its own; what the owner still has to confirm is among its
  [open questions](#open-questions)

## Goal

A few days before the edition every buyer gets one email with what they need at the gate: the QR
code, the opening hours and where to pick up their merchandise. It serves step 10 of the MVP flow
([PRODUCT.md 2](../PRODUCT.md#2-mvp-goal-and-end-to-end-flow)): a buyer who arrives with the code
at hand.

## Business rules

The **Brief** column names where a rule comes from; "new" marks a rule this draft adds for the
domain owner to confirm.

| #   | Rule                                                                                                                                                                                      | Brief                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| R1  | An org with tickets write access sets how many days before the edition's first day the reminder goes out. With no number set, none is sent.                                               | the email's "sent when"                         |
| R2  | The reminder goes out on that day at 9:00 in the convention's time zone.                                                                                                                  | new                                             |
| R3  | It goes once to the email of every QR code of the edition that an order not canceled still holds: orders sharing a code get one reminder.                                                 | new; the brief names the email alone            |
| R4  | It contains the QR code, the edition's opening hours and its pick-up information; and for a child or a teen as the ticket holder, the guardian rules and the address of the consent form. | the email's contents                            |
| R5  | An edition gives its opening hours as a text an org writes.                                                                                                                               | new; the email names them and no rule sets them |
| R6  | An order paid after the reminder went out gets none: its confirmation carries the QR code. A manual order, which has no email, gets none.                                                 | new                                             |
| R7  | A reminder is sent once an edition: changing the number of days after it went out sends nothing again.                                                                                    | new                                             |
| R8  | A suspended convention sends none, and a reminder missed while it was suspended is not sent late once its day has passed.                                                                 | new                                             |

## Shape

### Tables

None is new. `edition_shops` ([shop setup](0002-shop-setup.md)) gains `reminder_days_before`,
`opening_hours` and `reminder_sent_at`; the kinds of `order_emails`
([checkout and orders](0004-checkout-and-orders.md)) gain the reminder. The pick-up information is
the one [buyer self-service](0009-buyer-self-service.md) sets.

### Jobs

A third job beside the two of checkout and orders: it finds the editions whose reminder is due and
not sent, queues one email a QR code in `order_emails` and sets `reminder_sent_at`, all in the
edition's own tenant transaction, so a reminder is queued whole or not at all. The emails job
sends them.

### Routes and screens

No route is new: the three settings travel in `PATCH /editions/{editionId}/shop`. The panel's
edition shop screen shows them, with the day the reminder will go out and, once it did, when.

## Tenant isolation and permissions

- The settings need `tickets` write access to the edition.
- The job reaches its editions through a new cross-tenant query, bound as the API's own job and
  returning identifiers alone; everything else it reads inside each tenant's transaction.
- A reminder goes to an order's own email and to no other address.

## Tests

Integration, in `apps/api/test`:

- The day and the hour, in a time zone other than the server's and across a change of the clocks.
- Who gets one: a paid order, two orders on one QR code, a canceled order, a shared code with one
  order canceled, a manual order, an order paid after the reminder.
- The contents for an adult, a teen and a child as the ticket holder.
- Sent once: the job run twice, the days changed afterwards, two API processes at the same
  moment.
- No number set; a suspended convention, also restored after the day.

e2e: none of its own; the settings are covered where the edition's shop screen is.

## Out of scope

- A reminder an org writes or edits; several reminders an edition; a reminder in the language of
  the checkout.
- A reminder to pay an unpaid order.
- Push notifications ([PRODUCT.md 11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp)).

## Open questions

- **Records before acceptance:** none of its own.
- **For the domain owner to confirm:** the rules marked "new" above; that the number of days is
  from 1 to 60; that the reminder goes out on its day alone, so one missed for any reason, a
  suspension or the API being down that whole day, is not sent on a later day; that a reminder
  goes to the earliest paid order of a shared QR code; that an order canceled between the
  queuing and the sending gets none; that the reminder is no reason for a new order link, and
  carries none.
