# 0097. Read a scanner's end from its edition's last day at every check

- Status: Proposed
- Date: 2026-11-25

## Context

A scanner's access ends a day after the edition's last day unless the org sets less
([PRODUCT.md 7](../PRODUCT.md#7-modules)). The API computed that end once, when the scanner was
enabled, and wrote it to the scanner's row, which no role changes afterwards. An edition's dates
change in its settings, and nothing carried the change to its scanners.

A review of the shop's code found what follows. Orgs enable and pair the scanners days before the
convention. When the edition is then prolonged or moved by more than a day, every scanner ends a
day after the old last day, in the middle of the convention: each scan is refused, each phone
forgets its token, a scanner that has ended takes no new pairing code and holds its name until it
is revoked, so every scanner is revoked, enabled anew and paired again. Moved the other way, a
scanner outlives the day after its edition's last day. The rule as written allows both readings:
the end "a day after the edition's last day" of the day the scanner was enabled, or of today.

This record is the team's proposal after that review. The rule is a business rule of the tickets
module: its domain owner confirms it.

## Decision

- A scanner whose org set no end follows its edition. Its access ends a day after the edition's
  last day as that day stands whenever the end is judged or told: at every request of the device,
  in the count of the scanners an edition has enabled, when a new pairing code is asked for, and
  in what the panel is told.
- Such a scanner's row holds no end. An org who sets an earlier end has it written once, as
  before, and the end of an org's own access, when that is the earlier one, is written the same
  way.
- An end that was set is only ever an earlier one: a scanner ends a day after its edition's last
  day at the latest, also when the edition was shortened after its end was set.
- The API tells the end a scanner has at the moment it is read, and whether it follows the
  edition; the panel says so beside the date.
- The phone judges no end. It is told the end the scanner had when it was paired, and stays the
  scanner until the API says it is none.
- The scanners enabled before this decision whose written end equals the default of their
  edition as it stands at the migration follow the edition from then on.

## Alternatives

- **Rewrite the ends of an edition's scanners when its dates change.** The edition's settings
  would write to the tickets module's table, the application role would be granted the update of
  a column it is denied today, and a scanner whose org chose the default moment could not be told
  from one that follows.
- **Keep the written end and warn in the panel when the dates change.** The org who moves the
  dates is rarely the one who runs the gate, and the way out stays revoking and pairing every
  scanner again.
- **A column that says whether the org set the end, beside an end always written.** Two columns
  that must agree, and the written end of a following scanner would still be stale after every
  change of the dates.
- **Refuse a change of an edition's dates while it has scanners.** A convention moves its dates
  for reasons a gate does not outweigh.

## Consequences

- Prolonging or moving an edition keeps its scanners working through the new last day and the
  day after, with no step for an org. Shortening it ends them a day after the new last day.
- An edition whose last day has passed by more than a day has no scanner that stands, whatever
  ends were set, and enables none until its dates are moved.
- A scanner that follows its edition may come to end later than the access of the org who
  enabled it, when the edition is moved past that org's end. It still opens nothing from that
  end on, since the org behind a scanner is judged at every request
  ([0096](0096-pair-the-phone-that-opens-a-pairing-link-and-forget-a-scanner-only-on-a-lasting-refusal.md)),
  and works again if that org's access is extended.
- Every query that judges or tells a scanner's end joins its edition; none reads the column
  alone. No database role gains a privilege: the end is still written only when a scanner is
  enabled.
- A phone no longer drops a scanner by its own clock. One that holds a token of a scanner that
  has ended learns so at its next request, and a token left in a phone's storage opens nothing.
- A scanner enabled before this decision with an end its org typed that happens to equal the
  default follows the edition from the migration on. The two cannot be told apart, and the end
  is the same until the dates move.

## Sources

- [The scanner's spec](../specs/0007-scanner.md), D3 and D9.
- [0059](0059-pair-a-scanner-with-a-code-and-know-it-by-a-token.md), on judging the device at
  every request.
