# 0099. Count an account's unpaid orders apart from a visitor's under its email

- Status: Proposed
- Date: 2026-11-25

## Context

A buyer holds at most three orders awaiting payment in an edition; a fourth is refused until one
is paid or expires ([checkout and orders](../specs/0004-checkout-and-orders.md), O12). The limit
keeps one buyer from holding stock and capacity with orders nobody pays. It was counted by the
email of the order alone, for a visitor's order and an account's alike.

A visitor's order is placed under an email typed twice, which proves nothing of who typed it. An
order awaiting payment is on no account until it is paid: only an order an account placed is on
that account from the start.

A review of the shop's code found what follows from the two. Whoever knows an address places
three orders under it and pays none. The owner of the address, signed in to their account, is
then refused every order of the edition. They do not see the three orders, cannot pay or cancel
them, and are refused again once the holds end and the three are placed anew. For a ticket type
with few places left, that keeps a known buyer out of the sale.

This record is the team's proposal after that review. The limit is a business rule of the
tickets module: its domain owner confirms the way it is counted.

## Decision

The three orders awaiting payment are counted for the buyer the request proves.

- An order placed by a signed-in account counts the orders awaiting payment on that account in
  the edition, whatever email they are under.
- A visitor's order counts the orders awaiting payment under its email in the edition that are on
  no account.
- Each count is taken under a lock of its own, of the account or of the email in the edition,
  after the locks of the limits the cart touches
  ([0053](0053-lock-the-rows-that-carry-a-limit-in-one-fixed-order.md)).

The number stays three, and the refusal and what it tells the buyer stay as they were.

## Alternatives

- **Keep counting by the email alone.** The limit then belongs to whoever types an address
  first, and an account has no way out of it.
- **Count a visitor's orders by the client address as well as the email.** The attendees of one
  venue or one carrier share an address, and would share three orders. A stranger with several
  addresses is not stopped either.
- **Confirm a visitor's email before the order holds anything.** It would stop the abuse for
  visitors too. It is a step in a checkout that asks for no account, and a change of the flow the
  specs describe: a product decision of its own.
- **Let an account place orders past the limit.** An account is made in a minute, and one
  account would then hold as much of a sale as it liked.
- **Count an account's orders and those under its email together, the visitor's included.** That
  is the rule as it was, since an account's orders are under its email.
- **Tell the owner of the address about the unpaid orders and let them cancel them.** An email
  for every order a stranger placed is the nuisance the stranger wants, and an address with no
  account has nowhere to cancel.

## Consequences

- A signed-in buyer is refused only for orders of their own, each of which their list of orders
  shows with "Pay now". Nobody else fills the three.
- One email may be under six orders awaiting payment in an edition: three on its account and
  three a visitor placed. Whoever makes accounts holds three orders an account, as whoever types
  addresses holds three an address: the limit bounds a buyer, not a determined abuser, as before.
- A visitor is still refused when the three under their email were placed by someone else. The
  way out is to sign in, or to wait for the holds to end. The refusal still tells whoever types
  an address that it has three orders awaiting payment on no account.
- An account that changed its email counts the orders on it under the old email too.
- An account and an email are locked apart: an account's order and a visitor's under the same
  email wait for nothing of each other.
- The rule of the spec is counted otherwise than it says; the spec is implemented and stays as
  written, and the documents state the rule in force.

## Sources

- The review of the shop's code of 2026-11-25, second pass, finding on the limit of unpaid
  orders counted by an email the public route does not verify.
- [Checkout and orders](../specs/0004-checkout-and-orders.md), O2 and O12.
