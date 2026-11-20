# 0059. Pair a scanner with a code and know it by a token

- Status: Proposed
- Date: 2026-11-20

## Context

A scanner is a device with no account signed in: a phone at a gate, passed from hand to hand
through a shift. It serves one edition, its access ends no later than that of the org who enabled
it, and it is revoked at any time ([PRODUCT.md 7](../PRODUCT.md#7-modules)). How a phone becomes
a scanner and how the API knows it afterwards was left open.

The browser of the panel holds no session state: an account is known by a cookie the API sets
([0004](0004-make-the-api-the-only-backend-with-the-session-in-cookies.md)). A scanner is no account, and a cookie
of the panel's origin would be the session of whoever signed in on that phone.

## Decision

- An org with tickets write access names a scanner and is shown a pairing code once, as a QR code
  and as a link that carries the code after the `#`. The code works once and for fifteen minutes.
  The phone that opens it becomes the scanner and is handed a token, once.
- A pairing code and a token each carry 256 random bits and are kept as hashes. The API finds a
  scanner by either hash in a lookup across tenants that answers the scanner and its tenant
  alone.
- The phone keeps the token in the storage of the panel's origin and sends it in
  `Authorization: Bearer`, with no session cookie. A scanner's route is a kind of its own in the
  contract: its caller has no session and no membership.
- The device is judged at every request in its tenant's transaction: that it was not revoked and
  has not ended, and that the org who enabled it still has access. An org who leaves the team
  ends its scanners; the scanner's row stays, since the hand-outs it marked name it.
- A scanner reads QR codes alone, and marks a hand-out only under the code it read. A mark made by
  mistake is taken back in the panel.

## Alternatives

- **A desk account that signs in on the phone.** A shared password at a gate, a session that
  reaches everything the account can, and two-factor codes on a phone that is not the org's own.
- **The scanner's token in a cookie.** It would travel with every request of the panel on that
  phone, beside or instead of an account's session, and a route could not tell which it was
  given.
- **A pairing code that stays valid.** A photograph of the screen would make scanners for as
  long as nobody noticed.
- **The order's identifier alone to mark a hand-out.** A scanner could mark an order it never
  scanned; the code read is the proof that the buyer stood there.

## Consequences

- The rule that the browser holds no token gains one exception, the scanner's, on a page that
  shows nothing of an account.
- A token in the phone's storage is as safe as the phone: a lost phone is revoked in the panel,
  and its token opens the scans of one edition, never an account.
- Enabling and revoking a device as proposed here (D7 to D13 of
  [the spec](../specs/0007-scanner.md)) is the domain owner's to confirm.
