# 0101. Send nothing of an order to the address it left, or at its old account's asking

- Status: Proposed
- Date: 2026-11-25

## Context

An org changes the email of a paid order: the one way a ticket passes to another person
([order management](../specs/0006-order-management.md), C2). The order gets a new QR code and a
new order link, the old ones stop working, and both addresses are told. The order stays on the
account it was on (C3), which adds nothing to it from then on
([0064](0064-add-to-a-paid-order-with-an-order-of-its-own-on-the-same-qr-code.md)).

A review of the shop's code found two things that still reached across the change:

- "Resend QR code" ([buyer self-service](../specs/0009-buyer-self-service.md), U2) asked only
  whether the order was on the account and paid. The account an order stayed on could have its
  confirmation sent to the order's new address, as often as an order's confirmation is sent
  again in an hour, and each sending took a try from the org who would send it for the new
  holder: the two share that limit.
- An email of an order is written when it is sent, from the order as it then stands
  ([0049](0049-send-the-emails-of-an-order-from-an-outbox-in-the-database.md)). One queued for
  an address the order has left since was withdrawn only when it hands the order over, with its
  QR code or an order link. A notice of a correction, queued for the old address and held back
  by sends that failed, went out there after the change with the order as its new holder has
  it: the ticket holder's name as it now is, and a sentence that the QR code stays the same.

This record is the team's proposal after that review. What an address is told of an order, and
what the account an order stays on does with it, are business rules of the tickets module: its
domain owner confirms them.

## Decision

It adds to [0064](0064-add-to-a-paid-order-with-an-order-of-its-own-on-the-same-qr-code.md) what
else the address an order has left loses.

- An order whose email an org changed stays among the orders of the account it was on. That
  account sees it and does nothing with it: "Resend QR code" is refused for an order whose
  email is not the account's, by the test that refuses "Buy more".
- The refusal has a code of its own and spends no try of the order's resends. The list of an
  account's orders says whether an order's confirmation would be sent again, as it says whether
  "Pay now" would start a payment attempt, and the portal offers the action by that alone.
- An email to the buyer that is queued for an address the order has left since is withdrawn when
  it comes to be sent, whatever its kind, not only one that hands the order over.
- One email still goes to the address left: the notice of the change itself, which says that
  what was sent there no longer works.
- An email to the orgs who settle an order goes to their own addresses and is not judged by the
  order's.
- Nothing withdrawn is sent to the address the order has now. The email that hands the order
  over tells it the order as it stands: its QR code, and an order link that opens its lines and
  its status.

## Alternatives

- **Take the order off the account when its email changes.** The account would lose the record
  of what it paid for, and C3 keeps the order and its attendee registration there; moving an
  order to the account of its new address is outside that spec.
- **Let the old account send the confirmation, under a limit of its own.** The org would keep
  its tries, but the new holder would still get emails another person sets off, and the account
  would be told the QR code went to the order's address, which it no longer reads.
- **Answer the refusal as "Buy more" is answered, or as an order that is not paid.** The account
  would read that nothing can be added, or that the order is not paid: neither is what it asked
  or what is so.
- **Offer the action by what "Buy more" would add to.** No new field, but two actions would hang
  on a value that describes one of them, and a later rule of "Buy more" alone would take "Resend
  QR code" with it.
- **Withdraw the notices of a correction too, and no other kind.** The rule by kinds is what left
  them out: every further email to the buyer is written from the order as it stands, and would
  have to be argued one by one.
- **Write an email when it is queued, so that it says what was so then.** It reverses the rule
  the confirmation and the reminder rest on, and keeps an order link's secret until the email
  goes out ([0049](0049-send-the-emails-of-an-order-from-an-outbox-in-the-database.md)).
- **Send a withdrawn email to the order's new address.** It would tell the new holder of a
  change made before the order was theirs, in an email that calls it a change of their order.

## Consequences

- The account an order stays on still reads, in its list, the order's status, its lines and
  its ticket holder as they now are. Whether the list should show less of an order that has
  passed on is not decided here: it is a question for the domain owner.
- The new holder has the QR code from the email that handed the order over, and from the order
  link, which offers a fresh one once it expires. The confirmation is sent again by an org
  alone.
- The account an order left can no longer use up the tries of the org's resend. The account at
  the order's own address shares them with the org, as before.
- An email about a payment, queued for the address an order then had, is withdrawn with the
  rest when the order moves before it goes out, and the person who paid from that address is
  not told by OPOS. The orgs' own notice of that payment still goes out, and an email waits
  that long only while sending to its address fails.
- A withdrawn email stays in the list of the edition's emails as one that was not sent, with
  nothing kept of what it would have said.
- A new kind of email to the buyer is withdrawn for an address the order left unless it is
  named as an exception, as the notice of the change is.

## Sources

- The review of the shop's code of 2026-11-25: the findings on the account an order stays on
  after its email changed, and on the emails queued for an address the order left.
- [Order management](../specs/0006-order-management.md), C2, C3 and C5;
  [buyer self-service](../specs/0009-buyer-self-service.md), U2.
