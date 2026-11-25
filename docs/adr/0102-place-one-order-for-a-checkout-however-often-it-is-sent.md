# 0102. Place one order for a checkout, however often it is sent

- Status: Proposed
- Date: 2026-11-25

## Context

The answer to a placed order can be lost: the order is written and committed, and the connection
drops before the buyer's browser hears of it. The portal then shows a failure and keeps the
checkout, and the buyer presses the button again. The request named nothing that told it from a
new order, so the API placed a second one
([checkout and orders](../specs/0004-checkout-and-orders.md), O1-O13).

A second order awaiting payment holds stock and capacity for thirty minutes, is one of the three
orders awaiting payment a buyer may hold, takes a use of its discount code, and expires with an
email. A second order with nothing to pay, for a free ticket type or with a code that takes
everything off, is paid at once like the first: two QR codes, two confirmations, two places of
the capacity and two uses of the code, which only an org undoes by canceling one. The portal
keeps its button off once the order is placed, which covers the page that got the answer and no
other.

A review of the shop's code found this. This record is the team's proposal after that review.
How an order is placed is a business rule of the tickets module: its domain owner confirms it.

## Decision

A checkout places one order, however often it is sent.

- The portal draws a placement key with each checkout: a random identifier nobody can guess. It
  keeps the key with the checkout in the tab and sends it with every try to place that checkout.
  A new checkout draws a new key. Both routes that place an order take the key, and neither
  requires it: an order sent with no key is placed each time it is sent.
- The key stands for what the checkout orders, not for the checkout the tab keeps. The portal
  draws a new one whenever anything of the checkout but the step it is on changes: the cart, the
  ticket holder's data, the email address, the answers to the custom fields, the consents or the
  discount code. A try sent again unchanged carries the same key, and a changed checkout places
  an order of its own. The portal does this in the one place every change of a checkout passes,
  never change by change. The API's refusals below stay as the second line, for a client that
  keeps its key over a change.
- An order keeps the hash of the key it was placed with, unique in its edition. The key is a
  secret of the buyer's, as a result token is
  ([0051](0051-keep-an-orders-secrets-as-hashes-and-its-qr-code-sealed.md)). An account's key is
  hashed with the account, so it finds the order that account placed and no other; a visitor's
  key never finds an order an account placed.
- A try whose key placed an order of the edition, under the same email address, places nothing.
  It is answered as the first try was: with the same order, and with a new result token in place
  of the one before. The first answer never arrived, and knowing the key shows that the same
  buyer asks. This holds for an order with nothing to pay too: no second paid order is made.
- Such a try takes nothing again. It is not counted among the buyer's orders awaiting payment,
  uses its discount code no second time and holds no stock or capacity of its own.
- A key is refused as an invalid field of the request, with nothing told of its order, where the
  answer of a placed order would not be true of it: the order is under another email address,
  the checkout comes to another total than the order was placed at, or the order neither awaits
  payment nor is paid any more.
- The portal answers a refused key by itself: it draws a new key and sends the checkout once
  more, as the Summary shows it, and tells the buyer nothing. The key is nothing the buyer
  entered or can correct, so the refusal is never shown as data to check. It does so once and
  no more: where the second key is refused too, the Summary says that the order could not be
  placed, and the buyer's own next try is sent with a new key.
- Tries sent at the same moment place one order. The key is looked up under a lock of the key in
  the edition, the first lock a placing takes: the other tries wait there, and then answer as a
  try sent later does. The unique index is the database's own guarantee of it.

## Alternatives

- **Leave it to the portal's button.** It stays off once the answer came. A try whose answer was
  lost is the case it cannot see.
- **Tell a repeated order by what it holds**: the same email address and cart within some
  minutes. An order holds one ticket
  ([0083](0083-hold-at-most-one-ticket-in-an-order.md)), so a buyer of two tickets places the
  same cart twice under one address, on purpose.
- **Limit the orders with nothing to pay an address places.** Any limit above one lets the
  duplicate through, and a limit of one refuses the buyer of two free tickets.
- **Refuse the repeated try, saying an order was placed.** A visitor has no way back to an order
  whose answer was lost: the result token was in that answer. The buyer would have an order
  holding their stock and no way to pay it.
- **Keep the first answer and send it again.** The answer holds the result token, which is kept
  as a hash alone. Keeping it readable for the sake of a repeat gives a read of the database the
  order's result. A new token costs nothing.
- **Keep the key itself.** It is all a stranger needs, with the email address, to be handed a
  result token of the order.
- **Hash the key alone, and match the account by the order's own.** Whether an account placed an
  order is not kept: a paid order is attached to the account whose confirmed email address it
  is under, whoever placed it. Hashing the key with the account keeps the rule exact with nothing more
  stored.
- **Answer with the order whatever the checkout now comes to.** A buyer who changed the cart
  after a lost answer would be sent to pay an order of another total than the Summary showed,
  against the rule that an order is placed at the total its buyer saw.
- **Compare the whole request with the one that placed the order.** It needs the request, or a
  hash of it, kept with the order. The total is on the order already and is what the rule names,
  and a change the total does not tell is one the portal draws a new key for.
- **Let the unique index alone settle tries sent together.** The try that loses has checked the
  limits by then. Where the first took the last place or the last use of a code, the second
  would be told that it ran out, and its buyer would give up an order they hold.

## Consequences

- An order gains a column and a unique index, and the API's role may now write an order's result
  token after it is placed: until now nothing changed it.
- Placing an order takes one more lock, before every other. Whoever waits for it holds none, so
  the order of the other locks
  ([0053](0053-lock-the-rows-that-carry-a-limit-in-one-fixed-order.md)) stands as it was.
- The change of the contract adds an optional field. A client that sends no key places an order
  each time, as before.
- The result token of an answer stops opening the order once a later try is answered. The day
  the result page opens for still runs from the placing.
- A checkout a visitor started and an account goes on with after signing in keeps its key, which
  is then hashed with the account. Where the visitor's try placed an order whose answer was
  lost, the account's try places another.
- A checkout changed after a lost answer places a new order, whether its total changed or not.
  The order placed before stays as an order its buyer left does: it holds its stock and awaits
  payment until it expires. A client that keeps its key over a change which leaves the total as
  it was, such as another variant at the same price, is answered with the order placed before:
  the API compares the email address, the total and the status alone.
- A browser copies a tab's checkout, key and all, into a tab duplicated from it. Changed there,
  as for another ticket holder, it places an order of its own. Left as it was, it is the same
  checkout: it is answered with the order the first tab placed and with a new result token, so
  the token the first tab holds stops opening the order.
- A try sent again once its order expired, was canceled or declined, or needs review is refused
  once. The portal sends it once more with a new key, and it places a new order with no second
  press.
- A repeated try passes the bot check and counts against the rate limit of placing orders as any
  try does, and so does the try the portal sends by itself after a refused key. One that names a discount code, from an address out of tries of a code, is refused
  before its key is looked at.
- A manual order carries no key.

## Sources

- The review of the shop's code of 2026-11-25: the finding on placing an order that a repeated
  request places twice, and the rest of the finding on "Order and pay" pressed again.
- [Checkout and orders](../specs/0004-checkout-and-orders.md), O1-O13.
- [0099](0099-count-an-accounts-unpaid-orders-apart-from-a-visitors-under-its-email.md).
