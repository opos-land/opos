# 0093. Change a provider account under a payment only where the payment loses nothing

- Status: Proposed
- Date: 2026-11-25

## Context

A payment is confirmed with the credentials of the provider account the convention holds at that
moment ([0081](0081-take-ticket-payments-into-the-conventions-account-and-review-one-that-does-not-match.md)).
So that a payment under way keeps the account it started with, the shop's setup refused new
credentials and a disconnection while any order of the convention awaited payment
([shop setup](../specs/0002-shop-setup.md), P5 and P6).

A review of the shop's code found that rule and another one, each sound alone, closing a
convention in together. An order whose provider cannot be asked when its hold ends is not expired
until the provider answers (0081, Consequences). When the provider does not answer because the
stored credentials stopped working, the order never expires, and the one repair, giving working
credentials, is refused because that order awaits payment. The ways into that state are ordinary:
an org makes a new API key or a new CRC key in the provider's panel before it enters the key in
OPOS, the provider closes the account, or the secret that seals the credentials is replaced, after
which each convention is meant to connect its account again
([0044](0044-seal-payment-provider-credentials-with-a-key-of-the-apis-environment.md),
Consequences). Until someone changed the database by hand, no buyer of the convention could start
a payment, and a buyer who had paid kept no ticket.

The same review found the refusal too short at its other end. A payment made counts whenever its
confirmation comes, also after its order expired (0081), and the confirmation is read with the
account the convention holds when it comes. The refusal counted only the orders awaiting payment,
so the account could be replaced or disconnected the minute after an order expired, and a late
confirmation of a payment started within its hold was then answered as an unknown address.

This record is the team's proposal after that review. The rule is a business rule of the tickets
module: its domain owner confirms it.

## Decision

- A payment is under way while an order of the convention awaits payment, and for 24 hours from
  the end of the hold of an expired order that has a payment attempt nobody confirmed: its late
  confirmation still needs the account.
- While a payment is under way the provider account is not disconnected, and new credentials are
  refused, but for three accounts that lose nothing by giving way:
  - **The same account given again.** The provider's module tells whether two sets of credentials
    name one account at the provider: for Przelewy24 the same merchant and point of sale in the
    same environment, whatever the keys. The payment goes on being found and confirmed there, so
    a corrected API key or CRC key takes nothing from it.
  - **An account whose stored credentials no longer open.** Nothing is confirmed with them again.
  - **An account whose provider refuses the stored credentials.** The provider is asked with
    them, before the route's transaction, as it is asked about the new ones, and only while a
    payment is under way. A provider out of reach refused nothing: the account stays.
- What was found of the stored credentials holds of those alone: credentials stored between the
  question and the route's transaction stay.
- The expiry job asks the account the convention holds now. An attempt started with an account
  that gave way to another one is not found there, whether the new account is of the same
  provider or of another, and its order expires as one nobody paid.

## Alternatives

- **Keep refusing every change, and let an org close an order whose hold ended.** A new action of
  the panel on an order whose payment nobody can read, and it repairs nothing: with credentials
  that do not work, every later attempt of every buyer still fails until the order is closed.
- **Expire an order after a fixed time, whatever its provider says.** It also expires the order
  of a buyer who paid while the provider was only out of reach, which 0081 rules out.
- **Take any new credentials at any time.** A convention that moves to another account in the
  middle of a sale loses the confirmation of every payment under way, with nothing to warn it.
- **Keep the replaced account's credentials until its payments are settled.** Two sealed accounts
  a convention, and a confirmation that has to choose between them; 0081 leaves a replaced
  account's credentials unkept on purpose.
- **Tell a lasting refusal of a signature from an outage when a payment is verified.** It would
  free an order held by a wrong CRC key, but what Przelewy24 answers to a wrong signature could
  not be confirmed against its sandbox, and the same account given again repairs that case.
- **Count the 24 hours from the moment the order expired.** An order keeps no such moment, and
  the end of its hold is the moment that matters: a payment attempt starts only within the
  hold, so a provider's repeats of a notification run from there. An order the expiry job left
  waiting past its hold counts as awaiting payment for as long as it waits.
- **Keep the account for as long as each provider repeats a notification.** Przelewy24 repeats
  one for hours, another provider will for another time; one day covers them and is a time an
  org can be told.

## Consequences

- An org corrects a key of the connected account at any moment of a sale, and the orders that
  waited for the provider are settled by the next run of the expiry job.
- An account the provider refuses, or one whose credentials are lost, is replaced by another one
  while orders await payment. A payment made into the old account is then not taken, as 0081
  already says of a replaced account: the org settles that money with the provider.
- A provider may refuse stored credentials for a reason that passes, such as an address of the
  API no longer entered in its panel. The account then gives way like one closed for good: what
  the org does in the provider's panel is the org's own.
- Giving credentials while a payment is under way may ask the provider twice, about the new
  credentials and about the stored ones. Both count as one of the convention's 20 checks an hour.
- A provider's module answers one more question, with no call: whether two sets of credentials
  name one account.
- A convention that moves to another account, or disconnects its own, waits a day after the last
  order that expired with a payment attempt nobody confirmed. An attempt its provider never
  registered counts too: the attempt does not tell it from one the expiry ended.
- Rules P5 and P6 of the shop's setup hold as changed here; 0044 and 0081 stand.

## Sources

- The review of the shop's code of 2026-11-25, findings on a dead end between the expiry job and
  the refusal of new credentials, and on a late confirmation that finds its account gone.
- [Shop setup](../specs/0002-shop-setup.md), P5 and P6;
  [checkout and orders](../specs/0004-checkout-and-orders.md), Y6;
  [Przelewy24](../specs/0005-przelewy24.md).
