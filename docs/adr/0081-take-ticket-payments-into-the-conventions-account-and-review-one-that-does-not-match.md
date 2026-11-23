# 0081. Take ticket payments into the convention's own account, and review a payment that does not match

- Status: Accepted
- Date: 2026-11-23

## Context

[0010](0010-send-ticket-payments-to-the-conventions-own-account.md) sent ticket payments to the
convention's own provider account before the tickets module had its rules. It kept only the
provider's payment reference and let a repeated notification, or one of a different amount, change
nothing. The shop's domain owner then set what a payment does in the shop
([brief 0001](../briefs/0001-convention-shop.md), BR-23 to BR-25 and D8;
[checkout and orders](../specs/0004-checkout-and-orders.md);
[Przelewy24](../specs/0005-przelewy24.md)). A buyer can pay another amount than the total. A bank
transfer can be confirmed after the order's hold has ended. The orgs need to see where the money
of each payment is. This record keeps 0010's decision on where the money goes and replaces its
rules for a payment that does not match.

## Decision

- Ticket payments go straight to a payment provider account the convention owns. OPOS never holds
  the money, and returns none: refunds are the convention's, outside OPOS.
- An org with shop write access gives the provider credentials. The API seals them and never
  returns them ([0044](0044-seal-payment-provider-credentials-with-a-key-of-the-apis-environment.md)).
- A payment counts once its signature or the provider confirms it, whenever that comes. A repeated
  confirmation changes nothing.
- A payment after the hold still pays its order. It takes again what the order held. When that is
  gone, the order needs review.
- Another amount than the total never pays the order. The order needs review, and an org marks it
  paid at its total or declines it with a reason.
- A payment an order no longer needs is refused where the provider can refuse it, and the buyer is
  told where the money is.
- Each payment attempt keeps what the provider's module gives the orgs: the amount, the time, the
  provider's transaction number and where the money is. It keeps nothing of a card or a bank
  account.
- One provider, Przelewy24, on production
  ([0054](0054-take-the-first-payments-through-przelewy24.md)), behind a port with a fake provider
  on `local` and `dev`.

## Alternatives

- **Keep 0010's rules.** A payment of another amount would leave its order unpaid with nothing to
  show for it. A late bank transfer would be money taken for an order that never pays.
- **Pay the order with whatever amount came.** It sells below the price, and above it takes money
  nobody asked for.
- **OPOS collects and pays out.** Turned down in 0010: OPOS would handle money, verify every
  convention and answer for payouts and disputes, with no fee to pay for it.

## Consequences

- An order can be "Needs review", and the panel settles it
  ([order management](../specs/0006-order-management.md)).
- An order whose provider cannot be asked when its hold ends is not expired until the provider
  answers.
- A payment made after the convention changed or disconnected the provider account it started
  under is not taken. The API reads a confirmation with the credentials the convention holds now,
  so it cannot verify one made under the old ones. The org settles that money with the provider,
  from the provider's own panel. OPOS tells nobody of it, as it is not built to keep a replaced
  account's credentials.
- Refunds from the panel stay beyond the MVP.

## Sources

- [Brief 0001](../briefs/0001-convention-shop.md) and
  [its review](../briefs/0002-convention-shop-review.md).
- PR #84, which built the tickets module.
