# 0068. Keep what a sent email of an order said, without what hands the order over

- Status: Proposed
- Date: 2026-11-20

## Context

An order's page listed that an email went out, and not what it told its buyer. An email of an
order is written when it is sent, from the order as it then stands
([0049](0049-send-the-emails-of-an-order-from-an-outbox-in-the-database.md)), so afterwards
nothing could say what it had said: the order may have changed since, and its text was kept
nowhere. An org asked by a buyer what they were sent, or told that nothing arrived, had only the
kind of the email and a time to go by.

Two things an email carries are not an org's to read. The QR code of a paid order is shown to its
buyer alone and kept sealed, and of an order link only the hash of its token is kept
([0051](0051-keep-an-orders-secrets-as-hashes-and-its-qr-code-sealed.md)): either one opens the
order to whoever holds it. An email kept as it went out would hold both in the clear, for every
org with tickets read access.

## Decision

- The outbox keeps, on the row of an email it sent, the subject and the plain text that went out,
  in the language they went out in. It writes them as it marks the email sent: an email that has
  not gone out keeps nothing.
- What hands the order over is left out of what is kept: the QR code and the token of an order
  link are each replaced by `[…]`, wherever they stand in the subject or the text. The address of
  the link stays, so the text still says that a link was there.
- A code and a token are noted for leaving out where the outbox makes them, as it opens the
  sealed code and as it makes the token, not by the kind of the email. An email cannot keep one
  by not saying that it carries it.
- An org with tickets read access to the edition reads what an email said, as it reads the rest of
  the order. The role that works across tenants is granted neither column: the outbox finds an
  email by identifiers alone.
- The text is kept for as long as its order and goes with it.

## Alternatives

- **Write the email again when it is read.** Nothing is stored, but the page would show what the
  email would say now, not what it said: an order corrected or canceled since reads differently,
  and the text would name a link that was never sent.
- **Keep the email whole, sealed as the QR code is.** An org who reads the email would read the
  code and the link: "shown to its buyer alone" would become "shown to every org with read
  access". An org with write access can move an order to another address, but that replaces the
  code and tells both addresses.
- **Leave out by the kind of the email, or by a mark on a part of its content.** An email that
  gains a code or a link later would keep it until someone remembered the mark.
- **Keep the HTML part and show it in a frame.** It says what the text says, and showing stored
  HTML in the panel needs a sandbox the text does not.
- **A sentence in the email's language where something is left out.** A mark that the panel
  explains in the reader's language says the same with nothing to translate into each language an
  email goes out in.

## Consequences

- What an email said names its buyer and what they bought: it is personal data of the order, kept
  and deleted with it ([PRODUCT.md 10](../PRODUCT.md#10-personal-data-and-privacy)).
- An email sent before its text was kept is listed without it, and its page says so.
- A text is read in the language of its recipient, which need not be the reader's.
- Anything new an email carries that opens an order is noted the same way where the outbox makes
  it; the tests of the outbox look for a code and a token in everything kept of the emails sent.

## Sources

- [Order management](../specs/0006-order-management.md), F4.
- docs/ARCHITECTURE.md, Modules waiting for their domain owner (order management).
