# 0066. Add a new entity on a page of its own

- Status: Proposed
- Date: 2026-11-20

## Context

The panel added an entity in two ways. An edition, a ticket type, a merchandise item, an order
recorded by hand and an invitation each had a page for adding, linked from their list. A programme
item, an add-on, a discount code, a custom field, a document, a consent and a scanner were added in
a form that stood under their list, on the same page.

The form under a list had no address, so nothing could link to it and the browser's back button did
not leave it. It lengthened every list by a form most visits did not use, and a member with read
access saw a shorter page than one with write access. Each new screen argued the choice again.

## Decision

- An entity is what a list of an application holds, with an identity of its own: an edition, a
  programme item, a ticket type, an add-on, a merchandise item, a discount code, a custom field, a
  document, a consent, a scanner, an order recorded by hand, an invitation, and a convention in the
  admin application.
- A new entity is added on a page of its own, at `new` under the address of its list. The list
  holds a link to that page, shown to a member who may add, and never the form of a new entity.
- The page for adding names itself in the browser tab, links back to the list, and after the entity
  is added leads to where the work on it goes on: the entity's own page where it has one, the list
  otherwise. What adding shows once, such as the pairing code of a scanner, is shown on that page.
- A part saved with its entity stays in that entity's form: a price tier and a sale window of a
  ticket type, a variant of a merchandise item, a speaker of a programme item. A version of a
  document is published from the document it belongs to.
- How an entity is changed is not decided here: a row that is changed in place stays so.
- `src/app/pages.test.ts` of the panel and of the admin application refuses a mutation that
  creates an entity in any file but a page routed at `new`.

## Alternatives

- **The form under the list**, as seven screens had it. It has no address, it lengthens the list,
  and it left two ways of adding to choose between on every new screen.
- **A modal or a sheet over the list.** The longer forms, a discount code with everything it
  applies to or a programme item with its speakers, do not fit one on a phone; a modal has no
  address either, and it would hold a second modal when an action in it cannot be undone
  ([0023](0023-ask-in-a-modal-before-an-action-that-cannot-be-undone.md)).
- **A page for a long form and the list for a short one.** Where the line runs is a matter of taste,
  and a form grows: the add-on's did.

## Consequences

- Adding several entities in a row costs a return to the list between them; the page for adding
  leads back there, and the list's link is one press away.
- A new entity's list links to `new`, its router entry sits beside the list's, and its page is
  written with a test of its own.
- The e2e scenarios follow the list's link before they fill the form.
- The outcome of adding is still a notification
  ([0022](0022-tell-the-outcome-of-every-write-in-a-notification.md)), read on the page the member
  is led to.

## Sources

- docs/ARCHITECTURE.md, Frontends.
