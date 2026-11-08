# 0010. Send ticket payments to the convention's own provider account

- Status: Accepted
- Date: 2026-10-22
- Rationale: reconstructed, to confirm

## Context

OPOS is free for conventions and charges no fees
([PRODUCT.md 1](../PRODUCT.md#1-what-opos-is), [4](../PRODUCT.md#4-business-model--tenant-and-edition)).
Tickets are in the MVP. A platform that collects money for others takes on the duties of handling
it: a payment licence or a marketplace contract with a provider, onboarding and verification of
every convention, payouts, refunds and disputes, and the liability when one goes wrong.

## Decision

- Ticket payments go straight to a payment provider account the convention owns; OPOS never holds
  them and keeps only the provider's payment reference.
- An org with shop write access gives the provider credentials; the API stores them encrypted with a
  key it alone holds and never returns them.
- A payment notification counts once its signature or the provider confirms it; a repeat, or a
  different amount, changes nothing.
- One provider in the MVP, chosen when the tickets module is built, behind a port with a fake
  provider for `local` and `dev`.

The rules any shape of the module keeps are in
[ARCHITECTURE.md, Modules waiting for their domain owner](../ARCHITECTURE.md#modules-waiting-for-their-domain-owner).

## Alternatives

- **OPOS collects and pays out** (a marketplace account with the provider). One integration and one
  checkout, but OPOS handles money, verifies every convention and answers for payouts and disputes,
  with no fee to pay for it.
- **No payments in the MVP.** Tickets sold elsewhere would leave the gate check and the attendee's
  history without their orders.

## Consequences

- OPOS holds a secret of every convention that sells tickets, so the encryption key and the
  credentials' handling are part of the threat model.
- Each convention sets up its own provider account before it sells; other providers and payment
  methods come after the MVP.
- Refunds from the panel are beyond the MVP.
- The tickets module itself waits for its domain owner; this record fixes only where the money goes.

## Sources

- PR #1, "architecture decisions — tickets, reviews, likes, programme in portal".
