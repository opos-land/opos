# 0022. Tell the outcome of every write in a notification

- Status: Accepted
- Date: 2026-11-10

## Context

Each form of the panel and the portal showed the outcome of its write beside itself, and not alike:
some saves showed a success message that stayed, others said nothing on success, and a refusal or a
failure appeared under the form, out of view on a long page. The team decided that every change a
screen makes to the data tells its outcome as a notification: a success, a warning or an error.

Both applications build their screens from shadcn/ui on Base UI
([0020](0020-build-the-frontends-from-shadcn-ui-with-its-default-look.md)), and their writes go
through TanStack Query mutations, but for the calls of the two-factor card.

## Decision

- The notifications are the shadcn/ui `toast` component on Base UI, in one `Toaster` per
  application, mounted by its providers.
- The `MutationCache` of each application's query client notifies every mutation. A success says
  what the mutation's `meta.success` names, a message or one worded from what the write returned,
  and "The changes are saved." when it names none. A write whose screen shows its result at once (a
  like) sets `success: false`; a screen that is nothing but the write's outcome (accepting an
  invitation) keeps its failure with `failure: false`.
- A failure is a warning when it is a refusal the member can act on: an answer below `500` with a
  code, but a `401` the session refresh could not settle. Anything else, a failure of the service or
  the network, is an error, announced at once. Both stay until closed and say the code's message
  from the catalog.
- A write outside a mutation, the two-factor card's, calls the same functions.
- Beside a form stays only the validation of its fields. A plain `403` in the panel still ends on
  the "no permissions" screen. The sign-in flows (sign-in, registration, password reset, email
  confirmation, the code of two-factor authentication) show their outcome as their next screen, and
  guidance that stays true until acted on (the lost recovery codes, the last head organizer's
  deletion) stays on its screen.

The rule is in [ARCHITECTURE.md, Frontends](../ARCHITECTURE.md#frontends).

## Alternatives

- **The message beside each form**, as before. Its place and its presence depended on the form, a
  success often said nothing, and a message below the fold went unseen.
- **A notification and the message beside the form.** Every outcome said twice.
- **Sonner.** The shadcn/ui skill names it for projects on Radix and React Aria; the `toast`
  component is Base UI's own and adds no dependency.
- **Each screen calling the notification itself.** A forgotten call goes unnoticed; the query
  client covers every mutation unless the mutation opts out.
- **Success and error alone.** A refusal the member can fix asks for something else than a failure
  to retry later.

## Consequences

- A new mutation notifies with nothing more; it names its success in `meta` when the default says
  too little, worded so that Polish needs no inflection of a name.
- Warnings and errors stack until closed. Base UI hides a notification's close button from
  assistive technology until the notification has focus.
- A notification is worded as it shows, so a change of the interface language words it again; a
  value formatted when it was raised, such as the end of an invitation's link, keeps its format.
- A change of account closes every notification, since nothing of one account outlives it
  ([ARCHITECTURE.md, Frontends](../ARCHITECTURE.md#frontends)).
- The e2e scenarios read outcomes from the notifications region (`notification` of
  `e2e/fixtures/ui.ts`), not from beside the forms.
