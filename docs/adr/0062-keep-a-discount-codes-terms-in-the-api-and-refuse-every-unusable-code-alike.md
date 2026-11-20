# 0062. Keep a discount code's terms in the API, and refuse every unusable code alike

- Status: Proposed
- Date: 2026-11-20

## Context

A cart is priced by one function of the contract, which the portal runs against the offer it
fetched and the API against its own ([0050](0050-price-a-cart-with-one-function-of-the-contract.md)).
The offer holds nothing a buyer must not see.

A discount code is a secret: whoever knows it pays less, down to nothing
([0061](0061-lower-a-price-with-a-discount-code-and-give-free-entry-with-one-of-100-percent.md)).
Were the codes of an edition part of the offer, every visitor would read them. Were a refusal to
say why, a visitor who tries texts would learn which codes exist, which have ended and which are
used up.

## Decision

- The offer names no code. The portal asks the quote route for the price of the cart with the
  code the buyer entered; the API looks the code up, and prices the cart with it by the same
  function of the contract. The answer carries the discount as a line, never the code's terms.
- A code that is unknown, outside its window, ended, used up or applies to nothing in the cart
  is refused with one answer, and the buyer is told one sentence.
- A quote that tries a code counts against a rate limit of its own for the client's address,
  beside the limit of the route.
- An order is placed with the code and the total the buyer saw. A code that can no longer be
  used then places no order: the buyer returns to the Summary, where the code is refused as any
  other.

## Alternatives

- **Send a code's terms to the portal once it is accepted.** The portal could price every later
  change itself. The terms would tell what else the code applies to, and the price would rest on
  an answer that a limit or an org may have overtaken.
- **Say why a code is refused.** Kinder to a buyer who mistyped a date, and a list of the
  convention's codes for anyone patient enough to try.
- **A bot check on every try.** A buyer who types one code would solve a puzzle for it; the rate
  limit stops the guessing without one.

## Consequences

- With a code entered, the Summary's total comes from the API, and waits for it: no order is
  placed while a code is being priced. Without one, the portal still prices the cart itself.
- A buyer whose code has ended learns no more than one whose code never existed, and asks the
  convention.
- A convention chooses how hard its codes are to guess: a short common word is found within the
  rate limit sooner than a long one.
