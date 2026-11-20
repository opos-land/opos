# 0066. Add and change an entity on a page of its own

- Status: Proposed
- Date: 2026-11-20

## Context

The panel added and changed an entity in two ways. An edition, a ticket type, a merchandise item,
an order recorded by hand and an invitation each had a page for adding, linked from their list, and
most of them a page of their own to be changed on. A programme item, an add-on, a discount code, a
custom field, a document, a consent and a scanner were added in a form that stood under their list,
and an add-on, a discount code, a custom field, a consent and a document were changed in place: the
row of the list turned into a form.

A form in a list had no address, so nothing could link to it and the browser's back button did not
leave it. The form under a list lengthened every list by a form most visits did not use, and a row
that turned into a form pushed the rows under it away. Each new screen argued the choice again.

## Decision

- An entity is what a list of an application holds, with an identity of its own: an edition, a
  programme item, a ticket type, an add-on, a merchandise item, a discount code, a custom field, a
  document, a consent, a scanner, an order recorded by hand, an invitation, and a convention in the
  admin application.
- A new entity is added on a page of its own, at `new` under the address of its list. The list
  holds a link to that page, shown to a member who may add, and never the form of a new entity.
- An entity is changed on a page of its own too, at its id under the address of its list: the form
  filled with what the entity holds, and its deletion. The list holds no form of an entity and
  deletes none.
- The page for adding and the page of an entity name themselves in the browser tab and link back
  to the list. After adding, the member is led to where the work on the entity goes on: its own page
  where the work continues there, the list otherwise; after a deletion, to the list. What adding
  shows once, such as the pairing code of a scanner, is shown on the page for adding.
- A change the list reverses by itself stays in the row, and asks nothing: moving a row up or
  down, hiding it from the shop and showing it again, ending a discount code and letting it run
  again.
- A part saved with its entity stays in that entity's form: a price tier and a sale window of a
  ticket type, a variant of a merchandise item, a speaker of a programme item. A version of a
  document is published on the page of that document.
- `src/app/pages.test.ts` of the panel refuses a mutation that creates an entity in any file but a
  page routed at `new`, and the form of an entity in any file but such a page and the page of the
  entity itself; that of the admin application refuses the first.

## Alternatives

- **The form under the list**, as seven screens had it. It has no address, it lengthens the list,
  and it left two ways of adding to choose between on every new screen.
- **Changing a row in place**, as five lists had it. The row grows into a form, the rows under it
  move, and the form has no address to return to after a reload.
- **A modal or a sheet over the list.** The longer forms, a discount code with everything it
  applies to or a programme item with its speakers, do not fit one on a phone; a modal has no
  address either, and it would hold a second modal when an action in it cannot be undone
  ([0023](0023-ask-in-a-modal-before-an-action-that-cannot-be-undone.md)).
- **A page for a long form and the list for a short one.** Where the line runs is a matter of taste,
  and a form grows: the add-on's did.

## Consequences

- Adding several entities in a row costs a return to the list between them; the page for adding
  leads back there, and the list's link is one press away.
- A new entity gets three router entries beside each other, its list, `new` and its id, and a page
  with a test of its own for each.
- A member who only reads has no page to open for an entity whose page holds nothing but its form:
  its row shows all there is to read. A document's page is open to a reader, who reads its versions
  there.
- The e2e scenarios follow the list's link before they fill a form.
- The outcome of a write is still a notification
  ([0022](0022-tell-the-outcome-of-every-write-in-a-notification.md)), read on the page the member
  is led to.

## Sources

- docs/ARCHITECTURE.md, Frontends.
