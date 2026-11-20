# 0061. Lower a price with a discount code, and give free entry with one of 100%

- Status: Proposed
- Date: 2026-11-20

## Context

A convention lowers a price for chosen buyers: early supporters, a partner's members, its own
volunteers. It also lets some people in for nothing, a guest or a member of its staff, who still
buy a T-shirt and who should hold a QR code ahead of the edition, like any buyer
([discount codes](../specs/0008-discount-codes.md)).

The product's scope had named neither. It kept "tickets issued ahead with no order" beyond the
MVP, and a sale made outside the shop is a manual order, which has no QR code and is handed over
as it is recorded ([0055](0055-record-a-sale-made-outside-the-shop-as-a-manual-order.md)).

## Decision

- An org sets discount codes for an edition: a percent or an amount, the ticket types, add-ons
  and merchandise items it applies to, a usage limit and a validity window. Discount codes are in
  the MVP.
- An order takes one code, entered by the buyer at the Summary. What it takes off is a line of
  the order of its own: the prices of the other lines stay what the catalog said.
- A use of a code is the order that holds it. It counts against the limit while the order holds
  its stock and capacity, is released with them and taken again with them
  ([0053](0053-lock-the-rows-that-carry-a-limit-in-one-fixed-order.md)).
- Free entry is a code of 100% for a ticket type. Its holder checks out as any buyer, the order
  is paid at once with nothing to pay, and it has a QR code, its emails and its place on an
  account. Merchandise beside it is paid for at its price.
- A ticket type excluded from discounts is never lowered, whatever a code names.
- A code an order used is ended, never deleted: it stays on its orders.

## Alternatives

- **Tickets issued with no order.** A second way for a ticket to exist, with its own QR code,
  its own hand-out and its own place in every count and report. It stays beyond the MVP.
- **A complimentary manual order for every guest.** It has no QR code and no email, and is handed
  over as it is recorded: it serves the desk during the edition, not a guest a month ahead.
- **A discount an org applies to an order by hand.** No buyer could use it alone, and every
  lowered price would wait for an org.
- **A code bound to one account or one email address.** A guest without an account, and a partner
  whose members are not known ahead, could not use one. A usage limit of one does the same for a
  single person.
- **A lowered price on each line.** An order's lines would no longer say what the catalog
  charged, and an amount code would have to be split across lines by a rule no buyer sees.

## Consequences

- A person entitled to free entry needs an email address and a browser, as any buyer does.
- A code is a secret the convention hands out: whoever holds it uses it, until its limit or its
  window ends it. An org sees each code's uses against its limit.
- The reports of sales tell an order's discount apart from what it sold, by its line.
- Several codes on one order, and a discount with no code, are not built.

## Sources

- [The brief of the shop](../briefs/0001-convention-shop.md), B3 and D2.
