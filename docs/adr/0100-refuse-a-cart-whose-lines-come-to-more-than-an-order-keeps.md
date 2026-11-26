# 0100. Refuse a cart whose lines come to more than an order keeps

- Status: Proposed
- Date: 2026-11-25

## Context

An order keeps its total and the amount of each line as 32-bit integers of minor units: at most
2 147 483 647, which is 21 474 836.47 PLN. Nothing bounded what a cart comes to. An org sets a
price of up to 1 000 000.00 PLN, a cart names up to 50 add-ons and 50 variants, and takes up to
100 of a variant, so the lines of a cart the contract accepts may come to several hundred times
what an order keeps.

A review of the shop's code noted this beside a finding on the sales reports, as something to
check. It holds: an order of 22 pieces of an item priced at 1 000 000.00 PLN passed every rule
of the shop, was priced by the quote, and failed in the database when it was written. The buyer
was told that something went wrong, with no way to tell what, and an org recording the same
sale in the panel was told the same.

The prices that reach it are far from those of a convention, and only an org of the edition
sets them. This record is the team's proposal after that review. The limit is a business rule
of the tickets module: its domain owner confirms it.

## Decision

- The lines of one order come to at most 2 147 483 647 minor units, before a discount code.
- The contract's one function that prices a cart
  ([0050](0050-price-a-cart-with-one-function-of-the-contract.md)) refuses a cart above it,
  once everything of the cart can be had: whatever ran out or is not offered is named first.
- The refusal is a problem of the cart as the others are. It is answered with a code of its
  own, since nothing of the cart ran out and the buyer is told another thing: to take something
  out or to place several orders.
- It holds wherever a cart is priced: the portal's running total, both quotes, an order placed
  by a visitor or an account, and a manual order.

## Alternatives

- **Keep the amounts of an order as 64-bit integers.** A migration of every amount an order, a
  line and a payment attempt keeps, and of every read of them: such a number comes from the
  driver as text, and the contract and the screens take a number. Nothing a convention sells
  needs it.
- **Lower the highest price, or the quantities of a cart, until no cart reaches the limit.**
  With 50 add-ons and 5000 pieces of merchandise in a cart, the highest price of anything a
  convention sells would fall to about 4 000 PLN; or a cart would hold a handful of pieces.
- **Catch the database's error and answer it as a refusal.** The quote would still price what
  cannot be placed, the portal would show a total the shop refuses, and the rule would live in
  the reading of an error.
- **Count the limit after the discount code.** The lines are kept as they are priced, each in a
  number of the same size, with the code's beside them: whether a cart a code brings under the
  limit can be written would depend on how its amount is spread over its lines.
- **Answer it as something that cannot be had.** The buyer would read that a part of the order
  is no longer available, and look for it on the steps.

## Consequences

- No order, quote or manual order reaches the database with an amount it cannot keep: the buyer
  and the org read what is wrong and what to do.
- A complimentary manual order is refused by what its cart comes to at the prices in force,
  though it is recorded at nothing.
- The sums the reports make of many orders are not bounded by this: they are counted in numbers
  of their own size.
- A larger sale is placed as several orders. Raising the limit means the first alternative.

## Sources

- The review of the shop's code of 2026-11-25, the note on the range of an order's total under
  the finding on the sums of the sales reports.
- [Checkout and orders](../specs/0004-checkout-and-orders.md), O7;
  [order management](../specs/0006-order-management.md), M1-M6.
