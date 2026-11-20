# 0063. Open an order link by a token after the #, found across tenants by its hash

- Status: Proposed
- Date: 2026-11-20

## Context

The confirmation of a paid order carries an order link, which opens that one order without a
sign-in ([buyer self-service](../specs/0009-buyer-self-service.md)). Whoever holds the link sees
the order's QR code, which is its ticket. The token of a link is stored as a hash
([0051](0051-keep-an-orders-secrets-as-hashes-and-its-qr-code-sealed.md)).

A link in an email is opened from a mail client, forwarded, bookmarked and kept for months. An
address a browser asks a server for lands in that server's access log and in the referrer of the
next page. A link names no tenant a request could be opened in, and a tenant's rows are read
only inside its own transaction
([ARCHITECTURE.md, Tenant isolation](../ARCHITECTURE.md#tenant-isolation)).

## Decision

- The link is the portal's address of the order's page with the token after the `#`. A browser
  sends that part to no server; the page reads it and sends it to the API in the body of a
  request. No path and no query, of the portal or of the API, carries the token.
- The API finds the link across tenants by the hash of the token. That lookup answers the link's
  tenant alone. The link, its order and whether it still opens are read in that tenant's
  transaction, by queries that filter on the tenant themselves.
- The page of a link shows the order's lines, its status, its QR code while it is paid and the
  edition's pick-up information. It shows no email address and nothing of the ticket holder, and
  changes nothing. The QR code is drawn in the browser, as the panel draws one
  ([0060](0060-read-and-draw-qr-codes-in-the-panels-browser.md)).
- A link opens until 30 days after its edition ends, and one sent later than that for 30 days
  from its sending. A changed email of the order ends every link sent before. A link of a
  suspended convention, and of an edition no longer published, is unknown.
- An expired link shows nothing of the order. Asked for, a fresh link goes to the order's email,
  at most once an hour for an order, and the answer is the same for any token: a link that still
  opens, an ended one and a text nobody made.
- Opening and renewing each count against a rate limit of their own for the client's address.

## Alternatives

- **The token in the path of the portal's address.** It would sit in the access log of whatever
  serves the portal, and in the referrer of a page the buyer goes to next.
- **The convention's address in the link, so that no lookup crosses tenants.** A link would stop
  working when a convention changes its address, and the email would have to be sent again.
- **A signed token with its expiry inside.** It cannot be ended before it expires, which the link
  of an order whose email changed needs.
- **A sign-in to see the order.** A visitor has no account, and an order is theirs without one.
- **A fresh link on every request.** Whoever holds an expired link could fill the buyer's mailbox.
- **Telling why a link does not open.** A guesser would learn which texts are tokens.

## Consequences

- A link forwarded with its email opens the order for its new reader, QR code included: the
  email says so, and an org ends a link by changing the order's email.
- A buyer whose link expired and whose mailbox is gone asks the convention, which changes the
  order's email.
- `opos_app_global` reads two columns of `order_links`, the hash and the tenant, and nothing
  else of an order.
- The page works only with script: the token never reaches a server that could render it.
