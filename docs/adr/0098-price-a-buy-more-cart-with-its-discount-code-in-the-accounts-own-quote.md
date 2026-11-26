# 0098. Price a "Buy more" cart with its discount code in the account's own quote

- Status: Proposed
- Date: 2026-11-25

## Context

A discount code is priced by the API alone: the Summary asks the quote for the price of the cart
with the code a buyer entered
([0062](0062-keep-a-discount-codes-terms-in-the-api-and-refuse-every-unusable-code-alike.md)).
The quote is a route for anyone, under the convention's address. "Buy more" places an order of
its own that names the account's paid order it adds to, sells no ticket and is offered what that
order's ticket type offers
([0064](0064-add-to-a-paid-order-with-an-order-of-its-own-on-the-same-qr-code.md)). Placing such
an order takes a discount code as any order does.

A review of the shop's code found that the Summary of "Buy more" showed the field of the code
and never applied one. The quote for anyone knows no order: it priced the cart as a first order,
so an add-on with no ticket, or merchandise alone while orders of merchandise alone are off, was
refused as something that cannot be had. The buyer read that a part of the order was no longer
available, which was not so, and paid the full price or left.

Neither the rules of discount codes nor those of "Buy more" say whether a code lowers what is
bought later. This record is the team's proposal after that review. The rule is a business rule
of the tickets module: its domain owner confirms it.

## Decision

- A discount code lowers a "Buy more" order as it lowers a first order: one code an order,
  entered at the Summary, applying to the add-ons and the merchandise items the org named, held
  and released with the order.
- A signed-in account has a quote of its own in the tenant, beside the routes that place its
  orders. It takes a cart, a discount code and, for "Buy more", the order added to. That order
  is judged as placing judges it: the account's own, paid, of the same edition and still under
  the account's email. The cart is then priced by the contract's one function
  ([0050](0050-price-a-cart-with-one-function-of-the-contract.md)) against what that order's
  ticket type offers and what was bought on its QR code.
- The portal asks the account's quote for a "Buy more" cart, and the quote for anyone for every
  other cart, a signed-in buyer's too.
- The tries of a discount code are one count of a client address, whichever quote or order
  spends them: a code that is refused is a try, a code that can be used is none
  ([0095](0095-count-a-rate-limit-against-what-a-request-proves.md)).

## Alternatives

- **Hide the field of the code in "Buy more".** The smallest change, and no order placed
  through the API alone would follow it: placing takes a code with an order added to already. A
  code for workshops or merchandise is most useful to those who hold a ticket, and they would be
  the ones who cannot use it.
- **Name the order added to in the quote for anyone.** A route without a sign-in would say
  whether an order is paid and what was bought on its QR code, to whoever holds its identifier.
- **Price the cart in the portal.** A code's terms would have to leave the API, which 0062 turned
  down.
- **Send every quote of a signed-in buyer to the account's quote.** One more path to keep for a
  first order, which the quote for anyone prices alike.
- **Count the tries of a code against the account in the account's quote.** A guesser would
  have the tries of an address and those of each account made for the purpose. An order placed
  by an account counts its tries against the address too.

## Consequences

- A buyer sees the price with the code before placing a "Buy more" order, and the order is
  placed at that total: the quote and the placing read the same order and price with the same
  function.
- The account's quote locks nothing. An add-on bought, or an order moved to another email,
  between the quote and the placing is told when the order is placed.
- The quote of an order that cannot be added to is refused as placing refuses it, and another
  account's order is not there.
- A code the org named for a ticket type alone applies to nothing in a "Buy more" cart, which
  sells no ticket, and is refused as any code that cannot be used.
- 0062 and 0064 stand. So do the rules of discount codes and of "Buy more" in their specs, which
  this record adds to.

## Sources

- The review of the shop's code of 2026-11-25, finding on a discount code in "Buy more" priced as
  a first order's cart.
- [Discount codes](../specs/0008-discount-codes.md), K1-K7;
  [buyer self-service](../specs/0009-buyer-self-service.md), B1-B3.
