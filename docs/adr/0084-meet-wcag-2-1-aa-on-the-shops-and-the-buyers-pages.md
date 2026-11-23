# 0084. Meet WCAG 2.1 AA on the shop's and the buyer's pages

- Status: Accepted
- Date: 2026-11-23

## Context

Anyone who wants to come to a convention buys through its shop, many on a phone. Until the shop,
OPOS set no accessibility level. The shop's domain owner set one
([brief 0001](../briefs/0001-convention-shop.md), NF-02 and D9).

## Decision

- The pages of an edition's shop and the buyer's pages meet WCAG 2.1 AA: the shop, checkout, the
  result page, an order's page behind its link and an account's orders.
- The whole checkout works on a screen 360 px wide.

## Alternatives

- **No stated level.** Nothing would hold a page to it.
- **WCAG 2.2 AA.** EN 301 549, the standard the European Accessibility Act points to for
  e-commerce, still rests on 2.1 AA; 2.2 can follow it.

## Consequences

- A tool on those pages has to meet the level too, a bot check among them.
- The panel and the admin application are held to no level yet.

## Sources

- [Brief 0001](../briefs/0001-convention-shop.md).
