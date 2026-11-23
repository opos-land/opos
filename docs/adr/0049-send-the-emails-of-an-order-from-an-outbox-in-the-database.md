# 0049. Send the emails of an order from an outbox in the database

- Status: Accepted
- Date: 2026-11-20

## Context

An order sends emails its buyer relies on: the confirmation with the QR code, the notice that an
unpaid order expired, where the money of a payment under review is
([checkout and orders](../specs/0004-checkout-and-orders.md), Emails). Each has a cause that is a
change of the order, written in a transaction; sending is outbound I/O and runs outside one. An
email sent after the commit is lost when the process dies in between, or when the mail server is
down at that moment; the confirmation of a payment the provider reported must not depend on
either.

The API's other emails, an invitation or a sign-in link, are answers to a request: when sending
fails the person is told and asks again.

## Decision

- An email of an order is a row of `order_emails`, written in the transaction of its cause. The
  rows are the list of what the order sent, and the outbox it is sent from.
- A job of the API sends the rows that are due. It claims a row under a lock another process
  skips and moves its next try past the time a send may take, sends outside every transaction,
  then marks the row sent. A failed send is tried again after a delay that doubles from a minute
  up to six hours.
- An email is written when it is sent, from the order as it then stands, in the language of the
  account whose confirmed address it goes to, or the convention's for any other address.
- The outbox finds its rows across tenants by identifiers alone and passes a suspended tenant's
  by.

## Alternatives

- **Send after the commit, in the request.** No row, and no second try: a failed send loses the
  email, and the buyer of a paid order has no QR code.
- **A queue service.** One more thing to host, back up and keep in step with the database, for a
  volume a table handles.
- **Render the email when it is queued.** The text would tell the order as it stood at its cause,
  not as it stands when the email goes out, and an order link's secret would be stored with it
  until then.

## Consequences

- A send that succeeded and was not marked, because the process died right after it, is sent
  again: an email may arrive twice, never not at all.
- An email reads the order at the moment it is sent, not at the moment of its cause: an order
  that changed in between is described as it is.
- The confirmation makes an order link each time it is sent, of which only the hash is kept.
- What a sent email said is kept on its row, without its QR code and the token of its order link
  ([0068](0068-keep-what-a-sent-email-of-an-order-said-without-what-hands-the-order-over.md)).
