# 0076. Let a buyer leave the ticket holder's name out

- Status: Proposed
- Date: 2026-11-22

## Context

Checkout asked every buyer for the ticket holder's name or nickname, and the buyer of merchandise
alone for their own, and refused an order without one
([checkout and orders](../specs/0004-checkout-and-orders.md), C5 and C18). Nothing the shop does
rests on that name. An order is its buyer's by its email address, where the QR code goes; the
scanner admits by the QR code; the payment provider is given the email address and the order's
number. The name is a label: the scanner and the panel show it, the panel searches by it, and it
tells apart the orders one address placed.

Personal data is limited to what its purpose needs (GDPR, Article 5(1)(c)), and no duty of the
seller to name a consumer who buys a ticket online was found in what a convention sells under in
Poland. The act on electronic services lets a provider process a name and an address and does not
ask for them. An invoice is issued to a consumer only on request, with the details given then. The
cash register exemption of a service paid to the seller's bank account needs the records to say
what each payment was for, which the order's number does. That reading is the team's own, not a
lawyer's opinion, and a convention's taxes and fiscal duties stay its own
([brief 0001](../briefs/0001-convention-shop.md)).

## Decision

- The ticket holder's name or nickname, and the buyer's on an order of merchandise alone, is the
  buyer's to give or to leave out. Checkout marks the field as optional, and an order with no
  name is placed, paid, scanned and handed out like any other.
- An order with no name holds an empty one, as a manual order with none always did
  ([0055](0055-record-a-sale-made-outside-the-shop-as-a-manual-order.md)).
- A signed-in buyer's name is still filled in from the account, on the first step of checkout
  alone: a buyer who went on with no name left it out, and nothing fills it in again.
- What a buyer has to give stays: the email address, the ticket holder's age band and the
  edition's required custom fields.

## Alternatives

- **Keep the name required.** It asks every buyer for personal data that nothing needs. The field
  took any text, so requiring it named nobody for certain.
- **Remove the field.** One address places any number of orders: a parent who buys for three
  children could not tell their QR codes apart, and the desk could not find an order by a name
  when its QR code cannot be read. A buyer who wants the label keeps it.

## Consequences

- The scanner, the panel and the lists show an order with no name as one, the way they showed a
  manual order with none. The desk finds such an order by its number or its email address.
- An account's list of its orders names the ticket holder only where the order has one.
- An org gives a paid order a name or changes it, and cannot take one away: the correction, and
  the email that tells the buyer of it, expect a name.
- C5 and C18 of [checkout and orders](../specs/0004-checkout-and-orders.md) say what was built
  first; the rule in force is in
  [PRODUCT.md 7](../PRODUCT.md#7-modules) and [10](../PRODUCT.md#10-personal-data-and-privacy).

## Sources

- The act of 18 July 2002 on providing services by electronic means, Article 18(1).
- The act of 11 March 2004 on the tax on goods and services, Article 106b(3).
- The regulation of the Minister of Finance of 17 December 2024 on exemptions from keeping sales
  records with cash registers, item 42 of its annex.
