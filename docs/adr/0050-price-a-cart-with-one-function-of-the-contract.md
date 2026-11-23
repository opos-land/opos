# 0050. Price a cart with one function of the contract

- Status: Accepted
- Date: 2026-11-20

## Context

The totals in the shop, in the order, at the payment provider and in the emails match to the
cent ([checkout and orders](../specs/0004-checkout-and-orders.md), Y14), and the checkout shows a
running total that changes at once with every choice (C2). An order is placed at the total the
buyer saw or not at all (O7), so the page and the API must agree on what a cart costs and on
whether it can be had.

## Decision

- `priceCart`, in the contract package, takes the offer of an edition's shop and a cart, and
  answers its lines with their total, or what of the cart cannot be had.
- The API prices an order with it, against the offer it reads under the locks of the limits. The
  portal prices the running total with it, against the offer it fetched.
- Placing an order carries the total the buyer saw. The API compares it with its own: a
  difference places nothing and tells the new total.

## Alternatives

- **Ask the API for a quote on every change.** A request for each tick of a checkbox, a total
  that lags on a slow connection, and the same comparison when the order is placed anyway. The
  quote route stays, for a client that does not run the function.
- **Price in the portal alone and trust it.** The API enforces every rule the shop displays;
  nothing is bought by going around the page.
- **Two implementations kept in step by tests.** They would differ in the one case no test names.

## Consequences

- The offer carries everything the price of a cart depends on, and nothing a buyer must not see:
  it says "sold out" and the most one order may take, never how much is left.
- A change of how a cart is priced is a change of the contract package, and reaches the API and
  the portal together.
