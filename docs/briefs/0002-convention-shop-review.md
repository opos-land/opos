# Review of the convention shop brief

- Date: 2026-11-12
- Domain owner: the domain owner of tickets ([CONTRIBUTORS.md](../../CONTRIBUTORS.md))
- Source: a review of [0001](0001-convention-shop.md) for completeness, the logic of the purchase
  and the common practice of online shops, read against the Przelewy24 REST API documentation
  (version 1.0.18, its extended version 1.1.1 and the provider's earlier documentation)
- Binding: no ([briefs](README.md)); remarks for the domain owner to carry into 0001 or to turn
  down. The points on law are a reading of the regulations, not legal advice.

## Verdict

The brief is coherent and well closed for material ahead of a spec, but it is not complete. The
purchase itself (listing, four steps, Przelewy24, result page) is logical. The gaps are in three
areas:

- **Payments:** a few scenarios assume a behaviour Przelewy24 does not have, and the edge cases
  (nothing to pay, a second payment, a payment after the payment window) have no path.
- **Consumer law:** several requirements a Polish online shop has to meet are missing.
- **Shop practice:** in a few places the brief departs from what buyers are used to.

## How Przelewy24 works

Facts from the documentation that the remarks on payments rest on. The letters serve as references
below. The documentation was read in Polish; its statements and section names are given here in
translation.

| #   | Fact                                                                                                                                                                                                                                                                                                                                                                                             | Section of the documentation                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| a   | After a canceled and after a successful payment the customer returns to the same `urlReturn`. The current documentation names no result parameter; the earlier one says it outright: the redirect sends no additional fields, the address is exactly the one given in the transaction request, a plain GET redirect.                                                                             | Transaction flow; the earlier documentation of online payments |
| b   | A notification is sent only for a correctly paid transaction. The system passes no information about transactions that were not made or that failed.                                                                                                                                                                                                                                             | Transaction registration                                       |
| c   | After the notification the merchant must call `transaction/verify`. Without it the amount is not passed to the merchant; it stays at the customer's disposal as a prepayment.                                                                                                                                                                                                                    | Transaction verification                                       |
| d   | `timeLimit`: the time limit for the payment in minutes, 1–99; 0 means no limit.                                                                                                                                                                                                                                                                                                                  | Transaction registration                                       |
| e   | `channel`: a bit mask of methods. 1 cards with Apple Pay and Google Pay, 2 transfers, 4 traditional transfer, 16 all 24/7, 32 prepayment, 64 pay-by-link only, 128 instalments, 256 wallets, 4096 cards, 8192 BLIK, 16384 everything but BLIK.                                                                                                                                                   | Transaction registration                                       |
| f   | The notification carries `amount` (the amount paid) and `originAmount` (the amount registered).                                                                                                                                                                                                                                                                                                  | Notification                                                   |
| g   | A notification that was not received is repeated after 3, 5, 15, 30, 60, 150 and 450 minutes (±5), until a correct verification.                                                                                                                                                                                                                                                                 | Notification                                                   |
| h   | `transaction/by/sessionId` returns a status: 0 no payment, 1 advance payment, 2 payment made, 3 payment returned; also the payment date, the payout batch number and the commission.                                                                                                                                                                                                             | Transaction data by `sessionId`                                |
| i   | `waitForResult = true` keeps the customer at the provider until the result is known.                                                                                                                                                                                                                                                                                                             | Use cases                                                      |
| j   | `regulationAccept = true` requires on the shop's page a consent reading "Oświadczam, że zapoznałem się z regulaminem i obowiązkiem informacyjnym serwisu Przelewy24" ("I declare that I have read the terms and the information obligation of the Przelewy24 service"), with links under the words for the terms and for the information obligation. The checkbox must not be ticked in advance. | Transaction registration                                       |
| k   | Refunds: Przelewy24's panel or `transaction/refund`; several refunds to one transaction, together no more than its value; a separate refund notification.                                                                                                                                                                                                                                        | Transaction refund                                             |
| l   | An option the account manager turns on: Przelewy24 emails the customer a link to finish an abandoned payment.                                                                                                                                                                                                                                                                                    | Use cases                                                      |
| m   | Field limits: `email` required, up to 50 characters; `client` up to 40; `description` up to 1024; `urlReturn` and `urlStatus` up to 250; `sessionId` up to 100; `transferLabel` up to 20.                                                                                                                                                                                                        | Transaction registration                                       |
| n   | An optional additional notification for cards (a refusal too, with an error code and a description) and for BLIK, sent to `urlCardPaymentNotification`.                                                                                                                                                                                                                                          | Additional card notification, additional BLIK notification     |
| o   | The list of methods depends on the account and on the amount: `payment/methods/{lang}` with the `amount` parameter.                                                                                                                                                                                                                                                                              | Payment methods                                                |
| p   | Reports (`report/history`, payout batches) need turning on by the account manager.                                                                                                                                                                                                                                                                                                               | Report API                                                     |

## A. Payments

### 1. An order with nothing to pay has no path

A 100% code with no merchandise (B3.3), or a free ticket type or add-on, gives a total of zero. The
Przelewy24 documentation does not describe a payment of zero, and "Paid" is defined as "Przelewy24
confirmed the total".

Proposal: skip the payment and make the order "Paid" at once, without the consent to Przelewy24's
terms.

### 2. The return from Przelewy24 does not tell how the payment ended

The buyer returns to the same address after a success and after a cancellation, and the provider
adds nothing to that address (fact a). A notification comes only after a successful payment
(fact b). So the shop knows which order the buyer returns to, because it wrote that into the return
address itself, but not with what result.

How sure this is:

- that no notification comes for a failed payment is stated outright in the current documentation;
- that the return carries no additional fields is stated outright in the provider's earlier
  documentation; the current REST documentation (1.0.18 and the extended 1.1.1) describes the same
  flow and names no return parameter;
- one payment in the sandbox settles it for Przelewy24's current payment page.

What follows for the brief:

- F8.2 and F8.3 cannot be told apart on return: "still processing" and "canceled" look the same to
  the shop, as no confirmation;
- P1.3, "Przelewy24 reports a decline, the attempt is recorded as failed": no such signal exists
  for transfers;
- F8.3, "the buyer sees why (if Przelewy24 says)": the reason is available only for cards and BLIK,
  and only with the additional notification turned on (fact n);
- P1.2 can be met as written: the order stays "Awaiting payment" and the page offers "Try again" on
  every return without a confirmation.

Proposal:

- the result page has two states: paid, and no payment yet, the second with a retry and the time
  left;
- the buyer returns to the shop only with the result (fact i), so after a successful payment they
  see "Paid" at once and "Processing" (F8.2) is left for edge cases;
- the page itself asks for the state of the payment attempt (fact h), and "Processing" ends with
  the payment window;
- a payment attempt has no failed state taken from a provider's signal; it becomes unpaid when its
  time limit passes;
- a decision for the spec: whether to turn on the additional notification for cards and BLIK, to
  show the reason.

### 3. A second payment for the same order

Each payment attempt is a separate transaction with its own `sessionId`, so "Try again" and "Pay
now" do not void the earlier attempt. Both can be paid. P1.5 covers only a repeated notification of
the same payment. A payment for a canceled or a declined order is not covered either.

The provider gives a ready mechanism here (fact c): a payment its order no longer needs is simply
not verified. The money does not reach the convention and stays with the buyer as a prepayment at
Przelewy24.

Proposal:

- a payment for an order already paid, canceled or declined is not verified; an organizer sees it
  in the panel and the buyer is emailed where their money is;
- before registering a new payment attempt OPOS checks the state of the previous one (fact h) and
  starts none when the previous one is paid;
- every payment attempt has a time limit, so old attempts end by themselves (fact d);
- the receiving of notifications answers a repeat the same way, as the provider repeats them for up
  to 450 minutes (fact g).

### 4. Payments after the payment window will be common, not exceptional

A retry in the 28th minute does not extend the payment window, and slower methods do not make it in
30 minutes. By the brief each such case is manual work for an organizer. The provider gives tools
the brief does not name:

- the transaction's time limit set to the time left in the payment window (fact d);
- a mask of methods without the traditional transfer and the prepayment (fact e);
- the option of an email with a link to finish the payment turned off (fact l). With a 30-minute
  window it is a ready source of payments after expiry, and a second email beside OPOS's reminder;
  worth writing down as a condition of connecting the account in B1.4.

Proposal beyond that:

- accept automatically a payment after the window when its amount matches and the stock and
  capacity are still there; "Needs review" stays for the rest;
- show the buyer a countdown;
- email the buyer when a payment goes to "Needs review" (by the brief they get "Order expired" and
  then silence).

A decision the brief does not name: when to verify a payment that goes to "Needs review".

- Verify at once: the money is with the convention, and declining needs a refund in Przelewy24's
  panel. P2.4 assumes this ("a note on how the money was returned").
- Verify only when an organizer marks the order paid: declining needs no refund, as the money stays
  with the buyer as a prepayment. The documentation does not say, though, how long after a payment a
  verification is possible.

Recommendation: verify at once. It agrees with the brief and does not depend on an unknown
deadline.

### 5. The time of the payment decides, not the time of the notification

The provider repeats a notification even after 450 minutes (fact g). When receiving fails on OPOS's
side, a payment made in time is confirmed after its order expired, and goes to "Needs review"
through no fault of the buyer.

Proposal:

- before expiring an order with an open payment attempt OPOS asks the provider for its state
  (fact h);
- a payment made within the payment window counts as made in time, whenever its notification came.

### 6. F5.7 covers only a sold-out merchandise variant

Missing: a ticket type or an add-on sold out, a price tier changing during checkout, the sale
window ending, a discount code used up, a failed bot check. The rule: the total never changes
silently. A discount code's usage limit should be held the way stock is.

### 7. The consent to Przelewy24's terms has a set wording and form

The brief says the consent "is added to the summary automatically" and that "Select all required"
ticks every required consent (F5.2). The provider requires the exact wording, two links and a
checkbox that is not ticked in advance (fact j). Ticking it in bulk is a risk here.

Two ways:

- the consent in the shop, in the provider's exact wording, outside "Select all required";
- no consent in the shop; the provider shows it on its own page. Simpler, at the cost of one more
  click.

### 8. The buyer's email: up to 50 characters

The email is a required field for the provider, limited to 50 characters (fact m). A longer email
of a buyer fails the registration of the transaction. The spec has to choose: a limit in the form
of F2.3, or another way to pass the address. The name is optional for the provider (up to 40
characters), so it need not be sent.

### 9. The list of payment methods is not fixed

F1.1 and F5.4 name "BLIK, bank transfer, card". The real list depends on the convention's account
and on the amount (fact o), and on the mask of methods OPOS chooses (fact e). The shop should show
what the provider returns, not a fixed list.

### 10. The provider's transaction number and reconciling payouts

An organizer returns money in Przelewy24's panel, so they have to find the transaction there. The
order detail (B4.2) and the payments export (B7.2) should show the provider's transaction number,
and best also the payout batch number and the commission (fact h). Full reports need turning on by
the account manager (fact p).

The order number is worth passing as the title of the transfer (up to 20 characters, fact m), and
the description of the transaction should hold no personal data.

Points 3 and 4 change the same rule as D8 ("a repeat, or a different amount, changes nothing" in
[ARCHITECTURE.md](../ARCHITECTURE.md#modules-waiting-for-their-domain-owner) and
[0010](../adr/0010-send-ticket-payments-to-the-conventions-own-account.md)), so they travel in the
same record.

## B. Consumer law

### 11. The "Go to payment" button

Article 17(3) of the Polish Consumer Rights Act requires the words "zamówienie z obowiązkiem
zapłaty" ("order with an obligation to pay") or an equivalent. A safer `pl` rendering of the
button: "Zamawiam i płacę" ("I order and pay").

### 12. "The shop gives no refunds" and the right of withdrawal

Tickets for an event with a set date are excluded from the right of withdrawal (Article 38(1)(12)
of the same act), but a standard T-shirt is not; the 14 days run from the pick-up. What follows for
the brief:

- BR-23 should say that OPOS carries out no refunds and the convention handles them outside OPOS;
- canceling a single line is needed (the brief knows only canceling a whole order and swapping a
  variant); the provider allows several partial refunds to one transaction (fact k), so an
  organizer has a way to return the money for the T-shirt alone;
- the order confirmation email should carry the shop terms and the instruction on withdrawal.

### 13. The seller's details

B1.4 requires the legal documents but not the details of the legal entity (name, address, tax or
register number). The buyer has to know the contract is with the convention, not with OPOS.
Proposal: a condition of opening the shop.

### 14. The required "data processing" consent

The basis at a purchase is the contract, and a forced consent is void (BR-13). It should be an
information notice, not a checkbox.

### 15. reCAPTCHA, the open question of D12

The variant "consent in the banner, refusing closes checkout" contradicts itself: a consent has to
be free, and a tool that is necessary needs none. Since 2 April 2026 Google is a processor for
reCAPTCHA, which strengthens the variant "strictly necessary, loaded only at payment, outside the
banner". An alternative with no other origin is a self-hosted proof of work (ALTCHA, for one),
which leaves [0026](../adr/0026-run-a-tracker-only-with-consent-and-none-in-the-panel.md)
untouched. A puzzle at a low score collides with WCAG.

### 16. Fiscal cash register

Merchandise picked up in person is not a mail-order sale, so the exemption from the fiscal cash
register may not cover it. It is a matter for the convention and its accountant, but worth naming
beside the postponed receipts.

## C. Departures from shop practice

### 17. One ticket per order, D5

The largest departure. A family of four is four checkouts, four payments and four QR codes. If the
decision stays, it is worth offering "Buy another ticket" after the payment, with the email and the
consents carried over, for visitors too.

### 18. Sign-in only at step 4, F5.5

Step 1 already asks for the email, and the common practice is the choice at the start. Creating an
account in the middle of checkout pulls the buyer out of it to confirm the address, so it is better
offered after the purchase. That needs the postponed "claiming a visitor's orders after an account
is created" brought into the MVP; otherwise D11 works only for accounts that existed before.

### 19. The result page, F8.1

It should show the QR code and the order link at once. By the brief it shows only that the QR code
was emailed, so a typo in the address leaves the buyer with nothing.

### 20. Emails to an unverified address before the payment

Together with attaching an unpaid order to someone else's account (D11) they allow spamming and
holding stock. Proposal: a limit of unpaid orders per address, and attaching to the account only
once the order is paid.

### 21. "Buy more", F9.4

The brief does not say whether an add-on can be bought later, nor how the new order relates to the
first. Two QR codes of one person are two scans at the desk.

## D. Smaller

- **Attendee registration:** no rule for canceling the order, for changing the order's email to the
  address of another account, or for buying under another name (the parent becomes the attendee,
  not the child).
- **B4.3:** passing a ticket to another person has to void the old QR code and notify the old
  address.
- **A visitor and "Pay now":** F9.1 says nothing on the page can be changed, while the payment
  pending reminder carries that link.
- **B4.7:** the note on returning the money "in Przelewy24's panel" does not fit manual orders.
- **B6.5:** a sale at the desk assumes an email, which a buyer paying cash may not give.
- **B5.3:** production numbers do not account for orders awaiting payment or needing review at the
  pre-order deadline.
- **Capacity:** no shared capacity across several ticket types (the venue's limit, one-day
  tickets).
- **Merch step:** no rule to skip it when the ticket type offers no merchandise (the counterpart of
  F3.3).

## What the Przelewy24 documentation does not settle

To check in the sandbox or with Przelewy24's account manager before the spec:

- whether the current payment page really adds nothing on the return to `urlReturn` (the earlier
  documentation says so outright, the current one is silent);
- what happens to a payment after the time limit (codes `err102`, `err105`), and whether a
  notification comes then;
- how long after a payment `transaction/verify` can be called;
- what the notification looks like when `amount` differs from `originAmount`, and which amount to
  verify with;
- whether a `channel` mask without the values 4 and 32 really hides the traditional transfer and
  the prepayment, and what exactly the value 16 means;
- whether a transaction of zero is possible at all;
- how a buyer gets a prepayment back from a transaction that was not verified;
- what the `result` object of the additional BLIK notification holds (the page shows it collapsed).

## What next

To carry into 0001 first, as gaps and clarifications rather than changes of direction: points 1, 2,
5, 6, 8–10, 11–14 and 19.

Decisions for the domain owner:

- point 3: whether a second payment is left unverified;
- point 4: accepting payments after the window automatically, and the moment of verification;
- point 7: the Przelewy24 consent in the shop or at the provider;
- point 15: reCAPTCHA outside the banner, or another tool;
- point 17: one ticket per order;
- point 18: sign-in at the start and claiming orders.

## Sources

- [Przelewy24 REST API documentation 1.0.18](https://developers.przelewy24.pl/index.php?pl)
- [Przelewy24 REST API documentation, extended version 1.1.1](https://developers.przelewy24.pl/extended/index.php?pl)
- [Przelewy24's earlier documentation of online payments, a copy of 2020-10-26](https://web.archive.org/web/20201026181340/https://docs.przelewy24.pl/P%C5%82atno%C5%9Bci_internetowe)
- [Google on its change of role for reCAPTCHA](https://security.googlecloudcommunity.com/community-blog-42/switching-google-s-role-with-recaptcha-from-data-controller-to-data-processor-6646)
- [An assessment of that change under the GDPR](https://scheja-partners.de/en/insights/recaptcha-from-data-transfer-to-processing-by-a-processor-is-everything-gdpr-compliant-now-hardly/)
