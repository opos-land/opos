# 0096. Pair the phone that opens a pairing link, and forget a scanner only on a lasting refusal

- Status: Proposed
- Date: 2026-11-25

## Context

A phone becomes a scanner by opening a pairing link and keeps the scanner's token in its own
storage; the API judges the device at every request, by the scanner itself and by the org who
enabled it ([0059](0059-pair-a-scanner-with-a-code-and-know-it-by-a-token.md)). What the phone
does with what it remembers was left to the page: nothing stated it. A review of the shop's code
found two places where the phone and the API had come apart.

- **A pairing link opened on a phone that remembered a scanner paired nothing.** The page dropped
  the code and went on as the scanner it remembered, with no word of it, although the rule reads
  "the phone that opens it becomes the scanner"
  ([PRODUCT.md 7](../PRODUCT.md#7-modules)). A phone moved from one gate to another went on
  marking hand-outs under the old name, and one that remembered a scanner revoked or paired with
  another phone since could not be paired at all until a scan had been refused.
- **Every refusal of the device was told alike, and the phone forgot its token at the first.** A
  scanner opens nothing while the org who enabled it cannot write the tickets of its edition:
  the org's access has ended or their tickets permission was lowered. Either may be given back,
  and the same token then works again. The API answered that state as it answers a revoked
  scanner, so a phone that sent one request in between dropped a token that was about to work,
  and had to be paired again. The panel showed the same scanner as paired with a phone, and
  told nobody why the gate had stopped.

This record is the team's proposal after that review. The rules are business rules of the tickets
module: its domain owner confirms them.

## Decision

- **A pairing link always pairs.** The phone that opens a pairing link spends its code, whether
  or not it remembers a scanner. Paired, it is the scanner of that code from then on, and what it
  remembered is replaced. A code that is refused changes nothing: the phone stays the scanner it
  was and says that the code does not work.
- **A refusal of a device is lasting or passing, and the API says which.** Lasting: the caller
  holds no token of a scanner that stands, because the scanner was revoked, has ended, was given
  a new pairing code, or the org who enabled it left the team. Passing: the scanner and its token
  stand, and the org who enabled it is in the team but cannot write the tickets of the scanner's
  edition at this moment. The passing refusal has an error code of its own.
- **The phone forgets its scanner only on a lasting refusal.** On a passing one it keeps the
  token, says that the scanner is stopped and why, and offers to try again.
- **The panel shows a scanner that its org stops as a state of its own**, on the list and on the
  scanner's page, with the reason: the org cannot manage the tickets right now, or has left the
  team. A scanner in either state is given no new pairing code, as before; it is revoked like
  any other.

## Alternatives

- **Keep the remembered scanner and drop the code.** What the page did. A phone has no way to
  stop being a scanner by itself, so the link an org shows was the only way to move it, and it
  did nothing.
- **Ask on the phone before replacing the scanner it remembers.** The org who shows the link has
  decided already, the person holding the phone at a gate is rarely the one who knows, and a
  question left unanswered lets the code run out.
- **Forget the remembered scanner before the code is spent.** A code that is refused would leave
  a working scanner with no token, for a link opened by mistake or a second time.
- **One answer for every refusal, and a phone that keeps its token through all of them.** A
  revoked scanner would go on offering to read codes, and the org at the gate would not learn
  that the phone needs a new pairing.
- **Keep the token and try again in silence.** The gate stops with no explanation while somebody
  has to restore the org's access; a state the person can read tells them whom to ask.
- **Stop judging the org behind a scanner at every request**, so that no passing refusal exists.
  A device's access ends no later than that of the org who enabled it
  ([ARCHITECTURE.md, Modules waiting for their domain owner](../ARCHITECTURE.md#modules-waiting-for-their-domain-owner)):
  an org whose permission was taken away would keep a working scanner.

## Consequences

- A phone is moved to another scanner by opening that scanner's pairing link, and a phone that
  remembers a scanner which no longer works is paired the same way. The scanner the phone held
  before keeps its token until it is revoked or given a new pairing code: a phone that changes
  gates leaves a scanner an org should revoke when no phone is to hold it.
- A pairing link opened on a working scanner by mistake replaces it, when its code is still
  good. The code works once and for fifteen minutes, and the scanner left behind takes a new
  pairing code.
- The holder of a token that stands learns that the org behind its scanner has lost access for
  now. The caller with no such token is told nothing more than before: no token, an unknown one
  and one of a scanner that no longer stands answer alike.
- An org who reads the tickets of an edition but not the team is told of a scanner that the org
  who enabled it cannot manage the tickets or has left, still without that org's address.
- An org who left the team ends their scanners for good: a new membership of the same account
  is another membership. Whether a new pairing code should make a scanner answer to the org who
  gave it stays an open question of [the spec](../specs/0007-scanner.md#open-questions).

## Sources

- [0059](0059-pair-a-scanner-with-a-code-and-know-it-by-a-token.md), which this record adds to
  and does not replace.
- [The scanner's spec](../specs/0007-scanner.md), D3, D7 and D14.
