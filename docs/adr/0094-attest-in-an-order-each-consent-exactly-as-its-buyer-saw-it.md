# 0094. Attest in an order each consent exactly as its buyer saw it

- Status: Proposed
- Date: 2026-11-25

## Context

An order keeps each consent its buyer accepted, with the exact version of the document the consent
links and the time ([PRODUCT.md, 7. Modules](../PRODUCT.md#7-modules), the order's data). That row
is the convention's proof of what a buyer agreed to, and nothing repairs it afterwards.

A review of the shop's code found the proof short where an order is placed. The request named the
consents alone, and the API wrote beside each the newest version of its document at that moment.
A checkout lives in the buyer's tab for as long as the tab does, and the offer it shows is read
once and again only after a refusal. An org that published a new version of the shop terms while
a buyer was at the checkout so made the order attest a version its buyer was never shown, with
nothing to tell either of them.

This record is the team's proposal after that review. The rule is a business rule of the tickets
module: its domain owner confirms it.

## Decision

- The request that places an order names each consent the buyer accepted together with the
  version of the document that was shown with it, or with none where the consent showed no
  document.
- The API compares each with the offer of the moment the order is placed. A consent accepted
  with another version than the one in force places no order: a newer version was published, or
  a document that had none got its first. The refusal has a code of its own and names the
  consent. An order that is placed keeps the version its buyer accepted.
- The portal keeps the version with the acceptance for as long as it keeps the checkout. Once
  the offer shows the consent with another version, or the API refuses the order for it, the
  consent is accepted no longer: the buyer is told that the document changed, reads the version
  in force and accepts the consent again on the step that asks for it.

## Alternatives

- **Go on writing the newest version when the order is placed.** No change of the request, and
  the proof stays wrong in the one case it exists for: a document that changed during a sale.
- **Write the version the request names, whatever the shop shows now.** The order would attest
  what its buyer saw, and a buyer would go on agreeing to terms the convention has replaced, for
  as long as a tab stays open. An org publishes a version to have the next orders under it.
- **Hold a new version back while a checkout is open.** A checkout lives in the buyer's browser
  alone and holds nothing in OPOS: there is no checkout to wait for.
- **Name one mark of the whole offer in the request, and refuse an order placed against another
  offer.** It refuses an order for every change of the shop, such as a variant that sold out
  elsewhere, and cannot say which consent to read again.

## Consequences

- The request of an order changes in a way that breaks its consumers: the API and the portal
  change together, and a checkout a tab kept from before goes on with no consent accepted.
- A buyer at the checkout when a version is published is refused once, and accepts the consent
  again with the new version before the order is placed. The order of a buyer who was shown the
  new version is placed at once.
- A script that places orders reads the offer first: it has no version to name otherwise.
- Rule O11 of checkout and orders and rule D2 of the shop's setup hold as made exact here.

## Sources

- The review of the shop's code of 2026-11-25, finding on an order that keeps the newest version
  of a consent's document instead of the one its buyer accepted.
- [Checkout and orders](../specs/0004-checkout-and-orders.md), O11;
  [shop setup](../specs/0002-shop-setup.md), D2.
