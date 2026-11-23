# 0085. Sell merchandise in the MVP

- Status: Accepted
- Date: 2026-11-23

## Context

The MVP first sold tickets alone, and merchandise was beyond it. Conventions sell T-shirts, pins
and the like with their tickets, and a shop without them is not fit for purpose
([brief 0001](../briefs/0001-convention-shop.md), BR-06 and D2).

## Decision

- An edition sells merchandise items with option axes and variants, stock held per variant, with
  a ticket, and on its own where the edition turns merch-only orders on.
- Merchandise is picked up at the edition and never shipped.
- Its pictures and size charts are uploaded files
  ([0041](0041-keep-uploaded-files-in-an-s3-bucket-behind-the-api.md)).

## Alternatives

- **Tickets alone in the MVP.** Conventions would keep a second shop for merchandise, and the
  pick-up desk would check two lists.
- **Ship merchandise.** Addresses, carriers and returns, for what a buyer can pick up at the
  edition anyway.

## Consequences

- The shop holds stock, a pre-order deadline, production numbers and a pick list, and the scanner
  marks merchandise handed out.
- Discount codes, manual orders and desk sales came into the MVP with it
  ([0061](0061-lower-a-price-with-a-discount-code-and-give-free-entry-with-one-of-100-percent.md),
  [0055](0055-record-a-sale-made-outside-the-shop-as-a-manual-order.md)).

## Sources

- [Brief 0001](../briefs/0001-convention-shop.md).
