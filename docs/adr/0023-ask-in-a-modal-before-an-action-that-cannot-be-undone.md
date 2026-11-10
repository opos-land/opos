# 0023. Ask in a modal before an action that cannot be undone

- Status: Accepted
- Date: 2026-11-11

## Context

The panel asked twice before it deleted an edition or a programme item and before it removed a
member from the team: the button gave way, in the page, to a "Yes, delete" button and a cancel.
Turning two-factor authentication off asked nothing, and the portal opened the account's deletion
in the page. None of them said what goes with the data. The team decided that every action the
interface cannot undo asks first in a modal that says what will happen and that it cannot be
undone.

## Decision

- An action cannot be undone when no screen brings back what it ends: the deletion of an edition,
  of a programme item or of the account, a removal from the team, whose way back is a new
  invitation, and turning two-factor authentication off, after which the authenticator app's
  codes and the recovery codes never work again.
- Such an action asks in a modal, the shadcn/ui `alert-dialog` on Base UI. Its title names what
  goes, its text says what goes with it and that it cannot be undone, and only its own button acts;
  cancelling or Escape changes nothing. `IrreversibleAction` of each application's `shared/ui` is
  this modal for an action of one press, and adds that it cannot be undone to what the caller says.
- The modal stays while the action runs and closes once it settles; the outcome is a notification
  ([0022](0022-tell-the-outcome-of-every-write-in-a-notification.md)).
- The account's deletion holds the confirmation that it is the account's owner, the password or
  Google again, in its modal, which opens by itself on the return from Google or from the code of
  two-factor authentication.
- A change the same screen reverses, such as an org's access to an edition, a speaker, the
  publication or the activation of an edition, asks nothing.

## Alternatives

- **The two-step button in the page**, as before. It read as one more button, said nothing of what
  goes with the data, and two-factor authentication had none.
- **The browser's `confirm()`.** Its buttons cannot be worded or translated, and it cannot say
  what goes with the data.
- **A modal before every write.** A question asked before every reversible change is answered
  without reading.
- **Undo instead of asking**, a deletion held back with an "Undo" in its notification. The API
  deletes at once, and a held deletion would have to outlive the tab.
- **Typing the name of what goes.** More than the risk asks for today.

## Consequences

- A new action that cannot be undone uses `IrreversibleAction`, or composes the `alert-dialog` the
  same way when it needs more than one press, as the account's deletion does.
- While a modal is open the page behind it does not respond. A failed action closes its modal, so
  its notification is read on the page; the account's deletion keeps its modal open to ask for the
  confirmation again or to say what the last head does first.
- The e2e scenarios confirm in the modal (`getByRole('alertdialog')`).
