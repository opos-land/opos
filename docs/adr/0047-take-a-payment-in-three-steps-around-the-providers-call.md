# 0047. Take a payment in three steps around the provider's call

- Status: Accepted
- Date: 2026-11-20

## Context

An order of [checkout and orders](../specs/0004-checkout-and-orders.md) is paid only when its
payment provider's module confirms the payment to the API. Taking a confirmation means deciding
what the payment does of its order, under the order's lock, and finishing the provider's own
process: Przelewy24, the first real provider, counts a payment as taken only once the shop
verified it. That last part is a call to the provider, and outbound I/O never runs inside a
transaction ([ARCHITECTURE.md, API conventions](../ARCHITECTURE.md#api-conventions)): a provider
that answers slowly would hold the order's row, and with it every order of the same limits.

A provider repeats its notification until its process is finished, and two notifications of one
payment may arrive at the same moment.

## Decision

A confirmation is taken in three steps:

1. A transaction locks the order, and for an expired one the rows carrying the limits its lines
   touch, and decides what the payment does: it pays the order, sends it to review, or is one the
   order no longer needs.
2. Outside every transaction, the module settles a payment the order takes, also one that sends
   it to review, or refuses one it no longer needs.
3. A transaction locks the order again, decides again from what it then finds, and writes the
   outcome: the attempt with what the provider confirmed, and the order.

The order becomes "Paid" only in the third step. A settlement that did not answer writes nothing:
the notification is answered as a failure, and the provider's repeat is taken as the first one
was. An attempt already confirmed is a repeat, which changes nothing and asks the provider
nothing.

## Alternatives

- **One transaction around the provider's call.** The order's lock, and a database connection,
  held for as long as the provider takes to answer.
- **Mark the order paid first, settle afterwards.** A settlement that fails would leave a paid
  order whose money the convention never got.
- **A state of its own between the steps**, such as an attempt that is "being confirmed". It
  would have to be cleaned up after a process that died between the steps; deciding twice needs
  no cleaning up.

## Consequences

- What the first step decided may no longer hold in the third: an order paid meanwhile by another
  attempt takes a payment that was already settled. It is then one the order no longer needs
  whose money is with the convention, and the orgs are alerted to return it.
- A module's `settle` is safe to repeat: a payment settled once answers well again.
- A payment for an expired order is paid only while its stock and capacity are still there, which
  both steps check under the locks placing an order takes.
