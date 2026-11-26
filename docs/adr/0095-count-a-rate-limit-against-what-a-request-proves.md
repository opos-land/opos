# 0095. Count a rate limit against what a request proves

- Status: Proposed
- Date: 2026-11-25

## Context

Every route has a default rate limit, counted against the account of the session or, without
one, against the client address, and a route open to abuse adds a limit of its own
([ARCHITECTURE.md, API conventions](../ARCHITECTURE.md#api-conventions)). The shop added callers
that have no session and are no strangers either: a scanner known by its token
([0059](0059-pair-a-scanner-with-a-code-and-know-it-by-a-token.md)), a buyer who holds an order
link ([0063](0063-open-an-order-link-by-a-token-after-the-hash-found-across-tenants.md)), a
payment provider that signs what it sends, and a buyer who enters a discount code
([0062](0062-keep-a-discount-codes-terms-in-the-api-and-refuse-every-unusable-code-alike.md)).
Each was counted against its address, as a stranger is.

An address is shared where a convention happens. The scanners of a venue, and the attendees on
its network or behind one carrier's gateway, reach the API from one address. A review of the
shop's code found four places where that address ran out for callers who had done nothing wrong:

- **The scanners.** A scanner sends no session, so each of its requests counted against the
  default limit of its address, with every other scanner there and every visitor not signed in.
  Twenty scanners that each let eight people in a minute, a scan and a hand-out each, ask more
  than the default allows, and all of them then wait up to a minute. The limits a scanner has of
  its own were counted only after that.
- **The order links.** Opening a link counted against the address alone. The page of a link is
  where a buyer with no account shows the QR code at the entrance: the attendees of one network
  shared one hour's opens, and whoever came after them was shown no code.
- **The provider's notifications.** A provider sends the notifications of every convention from a
  few addresses of its own. Above the default limit a signed confirmation of a payment was
  refused, and repeated by the provider minutes later, while its buyer was told the order was
  not paid yet.
- **The discount codes.** Every quote with a code spent a try of its address, a code that can be
  used as one that cannot. The buyers of one address who used a code the convention gave them
  ran out of tries as guessers do. An order was counted only when its code was refused.

This record is the team's proposal after that review. The rules are business rules of the tickets
module: its domain owner confirms them.

## Decision

A rate limit counts against what the request proves: a scanner by its token, an order link by its
token, an account by its session. It counts against the client address only where the request
proves nothing or guesses, and a guess is counted once it is known to be one. Four uses follow.

- **A scanner's routes.** The routes a scanner calls under its token skip the default limit.
  Every request of them counts where the token is looked up, before anything else of the request
  is read: against the scanner the token names, under the limit of the route, or against the
  client address when there is no token or it names no scanner. An address that has spent those
  refusals is refused before a token is looked up. The pairing route stays as it was: a pairing
  code proves nothing until it is spent.
- **Opening an order link.** A token that finds its order counts against that token, by its
  hash. A token that finds nothing counts against the client address, and an address that has
  spent those is refused before a token is looked up.
- **A provider's notifications.** The routes that take them skip the default limit and count
  against the client address under a limit of their own, sized for the sale of many conventions
  through a few addresses.
- **A quote with a discount code.** A quote whose code can be used spends no try. One whose code
  is refused spends a try of its address, as an order does, and no more of an address's quotes
  with a code run at once than it has tries left.

| Limit                                                | Counted against    | Requests          |
| ---------------------------------------------------- | ------------------ | ----------------- |
| a scan, a hand-out                                   | the scanner        | 6000 an hour each |
| a request of a scanner's route that names no scanner | the client address | 300 an hour       |
| an order link opened                                 | the link's token   | 120 an hour       |
| a token that opens no order link                     | the client address | 60 an hour        |
| a provider's notification                            | the client address | 1200 a minute     |
| a discount code refused, in a quote or an order      | the client address | 30 an hour        |

## Alternatives

- **Raise the limits of an address.** No number fits: one high enough for the gates of a large
  venue limits nothing for whoever guesses from one address, and one low enough for a guesser
  stops a venue.
- **Name the scanner in the default limit, as an account is named.** The default limit would look
  a token up across tenants for every request of every route that carries one, before any guard.
  A scanner has limits of its own already, and a second counter for it adds nothing.
- **Skip every limit of the address on a scanner's routes.** A request with a made-up token would
  have no limit at all, and each one is a lookup across tenants.
- **Count a scanner's request in its handler, as the other routes count theirs.** A handler runs
  after the request's body is read: a request the body refuses would be counted nowhere once the
  default limit is skipped.
- **Raise the opens of a link to several hundred an hour for an address.** A venue still shares
  one number, and a guesser gets several hundred tries of a token.
- **Count a notification only once its signature fails.** The signature is judged after a lookup
  across tenants and a read of the tenant's provider account: a flood would pay nothing for
  them. A limit for the address, high enough for a sale, covers both.
- **Allow the provider's addresses by a list.** The addresses are the provider's to change, and a
  list out of date refuses payments.
- **Count the tries of a code against the code, or against the edition.** Anyone could spend them
  and so end a code for every buyer.
- **Count in a store the API's processes share.** It would make each number hold across
  processes. It is a part of the deployment, which this record does not decide.

## Consequences

- The scanners of a venue no longer wait for each other or for its visitors, and a busy network
  no longer hides a buyer's QR code. A provider's notifications are refused only above their own
  limit.
- The counters live in the memory of an API process. With several processes each counts apart,
  so a caller a balancer spreads over them meets each number once a process.
- A device on a venue's network that sends 300 requests with no scanner's token within an hour
  stops the scanners behind that address until the hour passes, where 300 requests of any kind a
  minute stopped them for a minute before. Their org moves them to another network, or hands out
  in the panel.
- A request of a scanner's route counts against the scanner whatever its body, also one the body
  then refuses.
- Whoever holds one code that can be used prices carts with it as often as the quote route
  allows an address. A wrong guess costs a try as before, in a quote and in an order alike, so
  the limit still bounds how many codes an address tries.
- A link's token may be opened 120 times an hour by whoever holds it, from any address: a link a
  buyer shared is opened by its readers within that number.
- The limits of a scanner are counted in its guard, the others in their handlers. A new route a
  scanner calls names its limit where it names the guard.
- 0059, 0062 and 0063 stand, and their sentences on rate limits hold as made exact here. So do
  the rules of the scanner on its limits, K5 of discount codes and the limits of an order link.

## Sources

- The review of the shop's code of 2026-11-25, findings on the default limit a venue's scanners
  share, on the opens of an order link counted by address, on a provider's notifications under
  the default limit, and the reviewer's note on a quote whose code can be used.
- [Scanner](../specs/0007-scanner.md); [discount codes](../specs/0008-discount-codes.md), K5;
  [buyer self-service](../specs/0009-buyer-self-service.md), K1-K5;
  [checkout and orders](../specs/0004-checkout-and-orders.md).
