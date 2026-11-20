# 0051. Keep an order's secrets as hashes, and its QR code sealed

- Status: Proposed
- Date: 2026-11-20

## Context

Three secrets open an order without a sign-in
([checkout and orders](../specs/0004-checkout-and-orders.md)): the result token, which opens its
result page for 24 hours; an order link, emailed with its confirmation; and the QR code a paid
order is found by at the edition. Each carries at least 128 random bits. A copy of the database,
a backup or a log line must not be enough to use any of them.

The result token and a link's token are only ever checked: who holds one shows it, and the API
compares. The QR code is different: the order's page and a resent confirmation show it again, so
the API must be able to read it back.

## Decision

- The result token and an order link's token are stored as SHA-256 hashes. The API finds an order
  by the hash and never holds the token after it handed it out.
- A QR code is stored twice: as a hash, by which a scan finds it, and sealed with the key of the
  API's environment that seals a provider account's credentials
  ([0044](0044-seal-payment-provider-credentials-with-a-key-of-the-apis-environment.md)), for its
  own row of its own tenant, so a value moved to another row opens nothing.
- The result token travels in a header of its own, never in a path or a query of the API, so no
  access log holds it. The address a payment provider sends the buyer back to is the portal's,
  and carries the token for a bank's application that returns the buyer in another tab; the page
  keeps it in the tab and takes it out of the address at once.

## Alternatives

- **The QR code as a hash alone.** A resent email and the order's page could not show it; a new
  code each time would make the one a buyer already printed worthless.
- **The QR code in the clear.** Whoever reads the table enters the convention.
- **A signed token instead of a stored one.** It cannot be ended before it expires, which a link
  of an order whose email changed needs.

## Consequences

- Replacing the key of the API's environment makes the stored QR codes unreadable, as it does
  the credentials: they are sealed again before the old key goes.
- An order link is made anew for each confirmation sent, since the token of an earlier one cannot
  be read back.
