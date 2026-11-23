# 0057. Search an order's QR code by a hash the panel makes

- Status: Proposed
- Date: 2026-11-20

## Context

An org finds an order by the QR code its buyer shows or reads out. The code is the ticket: whoever
holds it is let in. It is stored as a hash, and sealed for its own row
([0051](0051-keep-an-orders-secrets-as-hashes-and-its-qr-code-sealed.md)).

The list of an edition's orders is a `GET`, searched and filtered through its query. A query is
part of an address, and an address is what a host's request log, a proxy and a browser's history
keep.

## Decision

- The list takes the SHA-256 hash of a QR code, never the code. The panel tells a code from a
  name or a number by its shape, hashes it in the browser and sends the hash; the API compares it
  with the hash stored.
- A text typed into the search of numbers, names and addresses is never tried as a code.
- An order's page says whether the order carries a QR code, never the code itself: the code is
  shown to its buyer alone, in an email.

## Alternatives

- **The code in the query.** One request, and the code in every log on the way.
- **A `POST` for the search.** The code leaves the address, and the list stops being a read a
  browser can repeat and a query library can cache by its address.
- **The code in a header.** Kept out of an address, yet sent whole to the API for a comparison
  that needs only its hash.

## Consequences

- A hash in a log opens nothing: a code is 160 random bits, and its hash gives none of them back.
- The search finds the code an order carries now. One replaced by a changed email finds nothing.
- A name, a number or an address typed into the search still travels in the address, as the other
  filters do.
