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

The same review found the sentence of a consent unguarded. An order names its consent and shows
the sentence the consent holds now, as it shows every name of the catalog
([0048](0048-keep-what-an-order-names-with-foreign-keys-that-do-not-cascade.md)). A name
corrected is still the same thing sold; a consent's sentence is what the buyer declared. An org
with the tickets permission could reword the sentence of a consent hundreds of orders had
accepted, and each of those orders then showed the new sentence as accepted, at its old time.
Where the consent links a document, the version kept with the order still says what was agreed;
a consent with no document, such as one to receive news, had no other proof.

This record is the team's proposal after that review. The rules are business rules of the tickets
module: its domain owner confirms them.

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
- The sentence of a consent an order has accepted is never changed: the change is refused with a
  code of its own, apart from the refusal of a deletion. Such a consent is still hidden, moved
  and made required or optional. An org that wants another sentence hides the consent and adds
  a new one. A consent no order has accepted is reworded freely.
- The change of a sentence locks the consent's row before it reads the orders, as a change of a
  limit does ([0053](0053-lock-the-rows-that-carry-a-limit-in-one-fixed-order.md)): an order that
  accepts the consent at that moment is waited for and counted.
- The panel is told with each consent whether an order accepted it, and says on the consent's
  page that its sentence stays before the org tries.

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
- **Copy the sentence onto each order that accepts it.** A migration, and nothing to copy for
  the orders already placed but the sentence as it stands today. The same text would be kept
  once an order, and an edition with one wording asked of every buyer is the usual case.
- **Keep versions of a sentence, as a document keeps its versions.** A table, a history and a
  screen for what hiding a consent and adding another one already does.
- **Let the sentence change and warn the org.** The warning protects nothing: the proof is the
  convention's against a claim, and the convention is the one who could change it.

## Consequences

- The request of an order changes in a way that breaks its consumers: the API and the portal
  change together, and a checkout a tab kept from before goes on with no consent accepted.
- A buyer at the checkout when a version is published is refused once, and accepts the consent
  again with the new version before the order is placed. The order of a buyer who was shown the
  new version is placed at once.
- A script that places orders reads the offer first: it has no version to name otherwise.
- A typo in the sentence of a consent is corrected only until its first order. After that the
  org lives with it, or hides the consent and adds a corrected one, which the orders placed
  before do not name.
- The request names the version of a consent's document, not its sentence. A sentence reworded
  while no order has accepted the consent may still reach an order whose buyer was shown the
  earlier wording, in a tab opened before the change. The window closes with the first order
  that accepts the consent; closing it for good takes the sentence, or a mark of it, in the
  request, which this record does not decide.
- Whether a consent was required when an order accepted it is not kept: an order shows the
  sentence, the document version and the time.
- Rule O11 of checkout and orders and rules D2 and D4 of the shop's setup hold as made exact
  here; 0048 stands.

## Sources

- The review of the shop's code of 2026-11-25, findings on an order that keeps the newest
  version of a consent's document instead of the one its buyer accepted, and on the sentence of
  a consent that changes under the orders that accepted it.
- [Checkout and orders](../specs/0004-checkout-and-orders.md), O11;
  [shop setup](../specs/0002-shop-setup.md), D2, D4 and D6.
