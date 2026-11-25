# 0103. Refuse a list of variants built on variants the item no longer has

- Status: Proposed
- Date: 2026-11-25

## Context

The variants of a merchandise item that exist are put as a whole list: one the list leaves out
goes, one it names anew is made, and each is hidden or shown as the list says
([catalog](../specs/0003-catalog.md)). The panel's editor fills its rows when it reads the item
and sends them when an org saves. A page left open does not read the item again by itself.

Two orgs of an edition who hold `tickets` at `write`, or one org in two tabs, can so undo each
other without knowing. A list built on an old reading deletes a variant the other org added since,
makes again one the other deleted, at no stock, and puts back whether a variant is hidden. The
writes of a tenant run one after another, which orders them and tells neither of the other. Only
a variant an order names is safe: its foreign key refuses the deletion
([0048](0048-keep-what-an-order-names-with-foreign-keys-that-do-not-cascade.md)).

A review of the shop's code found this together with the same loss for the stock, where the
editor wrote the number of every row. The stock was settled first: the editor writes only a
number the org changed in the form, and the number of a variant the save made. This record is the
team's proposal for the list itself. What an org's save may undo is a business rule of the
tickets module: its domain owner confirms it.

## Decision

A list of variants built on variants the item no longer has is refused.

- The request that puts the list may name the variants it was built on: each by its identifier,
  with whether it was hidden. The panel's editor always names them, as the item was when its rows
  were filled.
- The API reads the item under the tenant's write lock and compares. Where the item has another
  set of variants, or one of them is hidden where it was shown or shown where it was hidden, the
  request is refused with `409` and a code of its own, before anything else of it is read, and
  nothing is written.
- The panel tells the refusal as a warning, reads the item again and fills the editor anew with
  the variants as they are. What the org had changed in the form is entered again.
- A request that names no variants is taken as it stands, as before.
- The stock is no part of what is compared. Each number is set by a request of its own, and the
  editor leaves a number alone that its org did not change.

## Alternatives

- **Let the last save win.** What was there. An org loses a variant it added, or sees one it
  deleted for a reason back in the shop at no stock, and nothing tells either of them.
- **A version of the item, sent back with every change.** A counter or the time of the last
  change on the item's row, compared for every write of the item. It would refuse a list of
  variants because someone renamed the item, set a picture or changed a number of stock, none of
  which the list undoes, and it needs a column, a migration and a field on every request that
  changes an item. The variants a form was built on are what its list can undo, and the request
  can name them with no change to the database.
- **Compare the stock too.** A change of one number by someone else would refuse a whole form of
  them. The stock needs no refusal: a number is set alone, and the editor writes only those its
  org changed, so two orgs who change different numbers both keep theirs.
- **Require the variants read in every request.** It would break every caller for a check that
  serves a form. A script that puts the list it wants, with nothing read before, has nothing to
  name.
- **Routes that add, delete, hide and show one variant each.** Two orgs would then never undo
  each other by a list. It replaces the route and the editor, which ticks many combinations and
  saves them at once, for a clash that is rare.
- **Merge the two changes in the API.** The API would have to tell a variant the form left out on
  purpose from one it never saw, which needs the reading the form was built on all the same, and
  an org would save a list other than the one on its screen.

## Consequences

- An org is never surprised by a variant gone, back or hidden: the later of two saves is refused
  and shows the variants as they are.
- The org whose save is refused enters its changes again. The clash needs two people on the same
  item at the same time, so this is rare, and the form is one table.
- The editor keeps its save off until the item is read again after a save: a save sent before
  that would name the variants as they were and be refused for the org's own change.
- The check is as good as the reading the request names. A caller that names none keeps the old
  behaviour, which is its own choice.
- A change of the item's axes takes variants away with it, so a form of variants built before it
  is refused the same way, with the same message, and not for a value it no longer finds.
- The other lists put whole, a ticket type's price tiers and an item's axes among them, keep the
  last save: a form of them filled before someone else's change still undoes it. Each would name
  a reading of its own, in a record of its own.

## Sources

- The review of the shop's code of 2026-11-25, the finding on the variants editor writing over
  another org's changes.
- [Catalog](../specs/0003-catalog.md);
  [ARCHITECTURE.md](../ARCHITECTURE.md#modules-waiting-for-their-domain-owner), the catalog.
