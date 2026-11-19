# 0052. Stand in for the bot check until the portal has one

- Status: Proposed
- Date: 2026-11-20

## Context

Placing an order needs a passed bot check
([checkout and orders](../specs/0004-checkout-and-orders.md), O4, Q3). The check is the portal's:
which one, and how it meets the rules on scripts of another origin
([0026](0026-run-a-tracker-only-with-consent-and-none-in-the-panel.md)), is not specified yet. The
checkout is built before that is settled, and an order placed on production without any check
would be open to scripted buying of limited tickets.

## Decision

- The API verifies a bot check through one interface, before the transaction that places the
  order.
- On `local` and `dev` a stand-in passes one fixed token, which the contract names and the portal
  sends. Any other token fails, so a failed check has a test.
- On production nothing passes until a real check takes the stand-in's place: the shop there
  places no order.

## Alternatives

- **No check until one is chosen.** The first production shop would sell unchecked.
- **Pass everything on production.** The same, with a field that looks like a check.
- **Pick a vendor now.** A product decision with a privacy side, made by whoever happened to
  write the checkout.

## Consequences

- A shop cannot sell on production before the bot check is specified and built. That is the one
  thing of checkout that blocks a production shop.
- The stand-in token is no secret: it grants nothing outside `local` and `dev`.
