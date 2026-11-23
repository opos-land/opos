# 0054. Take the first payments through Przelewy24

- Status: Accepted
- Date: 2026-11-20

## Context

A convention is paid into its own payment provider account
([0010](0010-send-ticket-payments-to-the-conventions-own-account.md)); which provider was left to
the module that would talk to one. The shop sells in PLN to buyers in Poland, who pay by BLIK, by
a transfer from their bank and by card. The conventions OPOS starts with are foundations and
associations that already settle through Polish providers.

[Checkout and orders](../specs/0004-checkout-and-orders.md) asks a provider through one port, and
its rules lean on what a provider can do: say that a payment was made whether or not the buyer
returned, keep a payment out of the convention's hands until the shop takes it, limit the time of
a payment, and tell the state of a payment when asked.

## Decision

- Przelewy24 is the first payment provider, behind the port, as
  [its spec](../specs/0005-przelewy24.md) sets it out.
- Its module is loaded in every environment. It connects a sandbox account only where no real
  money is taken, and the fake provider stays on `local` and `dev`.
- A payment the order takes is verified at once; one the order no longer needs is refused by not
  verifying it, which leaves the money at the buyer's disposal at Przelewy24.
- The consent to Przelewy24's terms is asked on Przelewy24's own page, so the shop shows none.
- The additional notification of a card refused is read. The one of BLIK is not: the
  documentation gives neither the fields of its result nor how it is signed, and nothing counts
  before its signature holds.

## Alternatives

- **A provider that splits a payment between accounts**, with OPOS as the platform. OPOS would
  hold the contract with the provider and stand between a convention and its money, which 0010
  rules out.
- **Several providers from the start.** Each has its own process for a payment the shop does not
  take; the port is shaped by one that is built and tested, and the next one fits it or changes
  it.
- **Ask the consent to Przelewy24's terms in the shop.** One page fewer for the buyer, and a
  checkbox whose wording and links are the provider's to change.

## Consequences

- Every convention enters the address the API calls from in Przelewy24's panel, so that address
  must not change: the environment names it, and the provider account's screen shows it.
- A payment that is refused costs the buyer Przelewy24's fee for returning it. Whether to verify
  such a payment instead and leave the return to the org is the domain owner's to say.
- A BLIK payment that fails shows the buyer "Not paid yet" with no reason until its notification
  can be read.
- The module is tested against a stand-in for Przelewy24's API. A payment by each method, a
  refusal and a payment after the time limit are checked by hand in the provider's sandbox before
  the first convention sells.
