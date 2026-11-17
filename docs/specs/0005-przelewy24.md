# Przelewy24

- Status: Draft
- Domain owner: the domain owner of tickets ([CONTRIBUTORS.md](../../CONTRIBUTORS.md))
- Brief: [0001](../briefs/0001-convention-shop.md), "What the shop asks of a provider's module",
  and [0002](../briefs/0002-convention-shop-review.md); read against Przelewy24's REST
  documentation, version 1.0.18 and the extended 1.1.1, and its service regulations
- Decisions: none recorded yet; the records this spec needs are among its
  [open questions](#open-questions)

## Goal

The first real payment provider behind the port of
[checkout and orders](0004-checkout-and-orders.md): a convention connects its own Przelewy24
account, and its buyers pay by BLIK, bank transfer or card. It serves steps 4 and 6 of the MVP flow
([PRODUCT.md 2](../PRODUCT.md#2-mvp-goal-and-end-to-end-flow)) outside `local` and `dev`, where
the fake provider stands in. The spec decides only what is Przelewy24's own: every rule of the
order stays in checkout and orders.

## Business rules

The **Source** column names what a rule rests on: a point or a fact of 0002, "docs" for the
provider's documentation, "regulations" for its service regulations. "new" marks a rule this draft
adds for the domain owner to confirm.

### The account

| #   | Rule                                                                                                                                                                                                                               | Source                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| A1  | An org connects the convention's account by giving the merchant's and the point of sale's identifiers, the CRC key and the API key, which Przelewy24's panel calls the reports key, and by saying whether it is a sandbox account. | docs: authentication                      |
| A2  | A sandbox account connects on no production convention. Przelewy24 opens a sandbox only to a merchant who already has a production account.                                                                                        | docs; the first sentence is new           |
| A3  | Przelewy24 answers its API only to the addresses its panel lists for the account. The provider account's screen shows the address the API calls from, for the org to enter there.                                                  | docs: IP address and default Web Services |
| A4  | The credentials are checked with the provider's access test, which fails until A3 is done.                                                                                                                                         | docs: testing the API connection          |
| A5  | The account is ready once its credentials passed and the org confirmed that Przelewy24's own email finishing an abandoned payment is off for the account. It is off unless the account manager turned it on.                       | point 4, fact l; docs                     |
| A6  | The account sells in PLN.                                                                                                                                                                                                          | BR-01 of the brief                        |

### The shop's pages

| #   | Rule                                                                                                                                                                                         | Source                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| G1  | The shop names three methods: BLIK, bank transfer and card.                                                                                                                                  | point 9                              |
| G2  | An email longer than 50 characters cannot pay through Przelewy24: the module says so, and checkout refuses it.                                                                               | point 8; docs                        |
| G3  | The consent to Przelewy24's terms is asked on Przelewy24's own page, as the provider does by default. The shop shows no consent of the provider's, and the module requires none of checkout. | point 7; docs: `regulationAccept`    |
| G4  | The shop's footer names Przelewy24 as the payment provider. It shows no logo until the designer places one from the provider's own graphic materials.                                        | F1.1 of the brief; docs require none |

### A payment attempt

| #   | Rule                                                                                                                                                                                                                                                                                                                  | Source                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| T1  | Each payment attempt is a transaction of its own, its `sessionId` the attempt's identifier. A new attempt voids no earlier one.                                                                                                                                                                                       | point 3                                      |
| T2  | The attempt is saved before the transaction is registered. The transaction carries the amount in grosze, PLN, the order's email, the description "Order" with the order's number, that number as the transfer's title, Poland as the country and the language of the buyer's interface. The buyer's name is not sent. | points 8 and 10; docs                        |
| T3  | The transaction's time limit is the whole minutes left of the order's hold, at least one.                                                                                                                                                                                                                             | points 3 and 4, fact d                       |
| T4  | The transaction offers cards with Apple Pay and Google Pay, bank transfers and BLIK: the channels 1, 2 and 8192. It offers neither the traditional transfer nor the advance payment, instalments or wallets.                                                                                                          | point 4; docs: `channel`                     |
| T5  | The buyer stays at the provider until the result is known, so a paid buyer returns to "Paid".                                                                                                                                                                                                                         | point 2, fact i                              |
| T6  | The buyer's return says nothing of how the payment ended: it carries the order's result token alone, and every return without a confirmation shows "Not paid yet".                                                                                                                                                    | point 2, facts a and b                       |
| T7  | Every registration gives Przelewy24 the address of its additional notifications for cards and BLIK. Each counts only once its signature holds.                                                                                                                                                                        | point 2, fact n; docs                        |
| T8  | A card payment refused, and a BLIK payment whose notification says it failed, record the attempt as failed, with the provider's code and message kept for the orgs. A failure does not close the attempt: a payment confirmed for it later still counts. BLIK Pay Later sends no such notification.                   | docs: additional card and BLIK notifications |
| T9  | The buyer is shown a reason from the shop's own list, chosen by the provider's code, and the general one for a code the module does not know.                                                                                                                                                                         | F8.3 of the brief                            |
| T10 | A notification of a card payment that went through changes nothing: an order is paid only by N1 and N2. Nothing of the card such a notification carries, its masked number, BIN, expiry, reference or hash, is stored or logged.                                                                                      | PRODUCT.md 10                                |
| T11 | The asynchronous notification for bank transfers and instalments is not used: a bank transfer that fails is not recorded as failed, and its attempt ends when the time limit passed with no payment.                                                                                                                  | docs 1.1.1; leaving it off is new            |

### Confirming a payment

| #   | Rule                                                                                                                                                                                                                                                                     | Source                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| N1  | A notification counts only once its signature holds. It names the attempt, the amount paid, the amount registered and the provider's own number of the transaction. Przelewy24 sends one only for a payment made, also when the buyer never returned.                    | facts b and f; docs                           |
| N2  | A payment its order takes is verified with the provider at once, and only a verification that answered well makes the order "Paid".                                                                                                                                      | fact c                                        |
| N3  | A payment that sends its order to "Needs review" is verified at once too: the money is then with the convention, and declining the order leaves returning it to the org, in Przelewy24's own panel.                                                                      | point 4                                       |
| N4  | A payment its order no longer needs is refused by not verifying it. The money stays at the buyer's disposal at Przelewy24, as an advance payment.                                                                                                                        | point 3, fact c                               |
| N5  | Przelewy24 repeats a notification after 3, 5, 15, 30, 60, 150 and 450 minutes until the transaction is verified. Each repeat is answered as the first was and changes nothing.                                                                                           | fact g                                        |
| N6  | Asked for an attempt's state, the module reads the transaction by its `sessionId`. A payment made, verified or not, counts as made at the provider's own date of it.                                                                                                     | point 5, fact h                               |
| N7  | The money of a verified payment is with the convention. The money of a payment not verified is with the buyer at Przelewy24: Przelewy24 returns it after 30 days, less its own fee for the return, or at once when the buyer asks Przelewy24. The buyer's email says so. | points 3 and 4; regulations, § 1(17) and (18) |
| N8  | An attempt keeps the provider's number of its transaction, by which an org finds the payment in Przelewy24's panel, and once the provider gives them the payout batch number and the commission.                                                                         | point 10, fact h                              |
| N9  | OPOS asks Przelewy24 for no refund.                                                                                                                                                                                                                                      | BR-23 of the brief                            |

## Shape

### The module

`apps/api/src/modules/payments/przelewy24` implements the port of
[checkout and orders](0004-checkout-and-orders.md) and holds no table of its own.

| Operation      | For Przelewy24                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect`      | `testAccess` with the given credentials; ready with A5                                                                                                                                                  |
| `requirements` | an email of up to 50 characters; no consent and no logo                                                                                                                                                 |
| `methods`      | the three of G1                                                                                                                                                                                         |
| `start`        | `transaction/register` with T2–T5, `regulationAccept` left false and the address of T7 as `urlCardPaymentNotification`; answers the provider's payment page for the token it returns                    |
| `read`         | checks a notification's signature and reads N1, or of an additional one T8                                                                                                                              |
| `settle`       | `transaction/verify`; a transaction already verified answers well again                                                                                                                                 |
| `refuse`       | does nothing, and says the payment was refused                                                                                                                                                          |
| `state`        | `transaction/by/sessionId`: no payment, a payment made with its date, or a payment returned                                                                                                             |
| `moneyWith`    | N7                                                                                                                                                                                                      |
| `information`  | N8: the transaction's number from the notification, the batch and the commission from `transaction/by/sessionId`, read after the verification and again by the payments export while the batch is empty |

The credentials live in `payment_provider_accounts.credentials`, the provider's number of a
transaction in `payment_attempts.provider_reference`, as text: it outgrows a 32-bit number. A
request is signed with SHA-384 over the fields the documentation lists and the CRC key, and
authenticated with the point of sale's identifier and the API key. The module calls the provider's
sandbox for a sandbox account and its production address otherwise; every call has a time limit of
its own, and a call that did not answer is `provider.unavailable`.

The address the buyer returns to is the portal's result page with the order's result token. The
address of the notification is `POST /payments/przelewy24/notifications/{attemptId}`, and of the
additional ones the same address with `/additional`; both are sent with every registration. Each
fits the 250 characters Przelewy24 takes. The order's number fits the 20 characters and the
letters and digits of a transfer's title.

The API calls Przelewy24 from one address that does not change, since every convention enters it
in Przelewy24's panel (A3).

### Routes and screens

No route is new. The panel's provider account screen ([shop setup](0002-shop-setup.md)) shows the
fields of A1, the address of A3 and the confirmation of A5.

### Seed

None: the seed's conventions use the fake provider.

## Tenant isolation and permissions

- A notification reaches its tenant through the cross-tenant query of a payment attempt by its
  identifier. Its signature is checked with that tenant's own CRC key, inside its tenant
  transaction, before anything else is read.
- The credentials are read by the module alone and leave the API only toward Przelewy24. No log
  line holds a key, a signature or an email address.
- One convention's credentials never sign or verify another's transaction: the module takes them
  from the tenant context of the request, never from its input.

## Tests

Unit, beside the module:

- The signatures of a registration, a notification and a verification, against values worked out
  by hand from the provider's documentation.
- The time limit at the edges of the hold; the channels of T4; the limits on the fields of T2.

Integration, in `apps/api/test`, against a stand-in for Przelewy24's API that answers as the
documentation says:

- The port's own suite, the one the fake provider passes: each operation and each answer.
- A notification with a bad signature, for another tenant's attempt, and repeated.
- A verification that does not answer, then the repeated notification.
- A payment an order no longer needs: never verified, and its buyer's email carries N7.
- A payment made within the hold and confirmed after it: read through `state`, then verified.
- A card refused and a BLIK payment that failed: the attempt failed with the provider's code, the
  buyer's reason from the list, a general one for a code the module does not know; a payment
  confirmed afterwards for the same attempt still verified.
- A notification of a card payment that went through: nothing changed, and no column and no log
  line holds the card's data.
- An additional notification with a bad signature, and one for another tenant's attempt, change
  nothing.
- An email of 50 and of 51 characters.
- The credentials: refused ones store nothing; no answer and no log line carries a key.

In the provider's sandbox, by hand, before the first convention sells: one payment by each method,
a payment canceled, a card refused and a BLIK code refused, a second payment for a paid order, a
payment after the time limit.

## Out of scope

- Refunds through Przelewy24's API; the reports that need the provider's account manager.
- The payment methods as Przelewy24 returns them for the account and the amount; instalments and
  wallets.
- The reason a bank transfer failed (T11).
- Another currency than PLN.

## Open questions

To check in the sandbox or with Przelewy24's account manager before this spec is accepted; the
documentation does not settle them:

- what happens to a payment made after the time limit: the documentation names the errors
  "the time available to complete the transaction has expired" and "the transaction was completed
  after the permitted time", and not whether a notification comes then (T3);
- how long after a payment it can be verified: the regulations return an advance payment after 30
  days, so no longer than that (N2, N3);
- which amount a verification takes when the amount paid differs from the amount registered (N1,
  N3);
- that the channels of T4 hide the traditional transfer and the advance payment on the payment
  page;
- that the payment page adds nothing on the return to the shop (T6);
- the card's error codes and the values of the BLIK notification's status and error, for the
  reasons of T9, and how the BLIK notification is signed;
- that a transaction can still be paid after a refusal was reported for it (T8).

For the domain owner:

- **A payment an order no longer needs (N4, N7):** refused, as drafted, which costs the buyer
  Przelewy24's fee for the return, 2 PLN for a transfer and 2.9% for a card; or verified and
  returned by the org from Przelewy24's panel, which costs the buyer nothing and the org the work.
- **The asynchronous notification for bank transfers (T11):** left off, as drafted. It would tell
  why a bank transfer made as payment initiation failed, by a general and a detailed status whose
  values the documentation leaves to each bank.
- **Records before acceptance:** Przelewy24 as the MVP's payment provider (D3 of the brief), which
  [0010](../adr/0010-send-ticket-payments-to-the-conventions-own-account.md) left to this module.
