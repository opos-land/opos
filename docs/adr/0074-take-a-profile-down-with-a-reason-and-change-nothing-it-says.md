# 0074. Take a profile down with a reason and change nothing it says

- Status: Accepted
- Date: 2026-11-21

## Context

People who are no organizers put a name, a picture and a text under OPOS's address
([0071](0071-let-anyone-read-the-profile-an-account-published.md)), and some of it will have to
go. The admin is the one role that reaches across accounts, its every action logged
([0030](0030-guard-admin-access-with-its-own-role-application-and-second-factor.md)). A host that
restricts what a user put up tells the user what it did, under which rule, whether a notice came
first, whether a person or a program decided, and how to contest it (Regulation (EU) 2022/2065,
Article 17).

A name is not part of the profile: it shows in the programme whether or not a profile is
published, so taking a profile down leaves an offending name where it was.

## Decision

- An admin takes a profile down with one of the reasons the platform's terms hold a rule for
  ([0072](0072-ship-the-platforms-terms-and-accept-them-by-creating-an-account.md)), and may add a
  sentence for the account. The profile stops being public at once and cannot be published, its
  avatar is removed and its open reports are closed.
- The account is told by email and on the page where it changes its profile: what was done, the
  rule, whether a report came first, the admin's sentence, that a person decided, and how to
  contest it.
- The account keeps changing a profile taken down, may upload a new avatar, and asks for a review.
  The admin restores the profile or leaves it: no refusal is sent.
- Restoring lifts the takedown and publishes nothing. The account publishes again itself.
- An admin clears the name of an account as an action of its own, with a reason: the three parts
  go and the account is shown as "Anon". It blocks nothing, and the account may enter a name again.
- An admin changes nothing else: no text, no link, no interest, and uploads no picture.
- The admin sees a profile as it is now. Nothing keeps what it held when it was reported or how it
  changed since.
- Every one of these actions leaves an entry in the log, in the transaction that makes it.

## Alternatives

- **An admin edits the profile.** The text would stand under the account's name in words the
  account did not write, and each edit would be a judgement the admin has to defend line by line.
  Taking the whole down and saying why leaves the words to their author.
- **Removing only the field at fault.** It is an edit by another name, and needs a reason and a
  notice for each field. One state for the whole profile is one decision to explain and to contest.
- **Restoring publishes the profile again.** The account may have withdrawn it meanwhile, or may
  not want it back. Nothing becomes public without the account's own press.
- **A takedown that also clears the name.** Most takedowns are about a picture or a text, and the
  account would lose its name in every programme for it. Most bad names sit on accounts with no
  profile at all, which a takedown cannot reach.
- **Blocking a name after clearing it.** It needs a list of what may not be typed, which never
  ends. The admin clears it again, and an account that keeps at it breaks the terms as a whole.
- **Keeping the avatar of a profile taken down.** The picture is the most likely thing to be
  someone else's, and it is public by its own address whatever the profile's state.
- **A copy of the profile at the time of the report.** It would keep, for the admin's
  convenience, exactly the content judged unfit, with no rule for how long.
- **A refusal sent for a review request.** It is a second decision with its own reasons and its
  own way to contest. A profile not restored stays as the first decision left it, and the account
  writes to the contact address.

## Consequences

- An admin who opens a profile after a report may find it already changed, and decides on what is
  there. A profile put right before the admin looked stays.
- A takedown cannot be fully undone: restoring does not bring the avatar back. So it asks first in
  a modal, as closing a report and clearing a name do
  ([0023](0023-ask-in-a-modal-before-an-action-that-cannot-be-undone.md)).
- An account whose profile stays taken down has no page, and the avatar it uploads meanwhile is
  shown to nobody but itself and the admin.
- Blocking an account is not built. Until it is, an account that returns to the same breach is
  taken down again each time.
- The admin's database role reads a profile and writes only the state of a takedown, the closing
  of a report, the removal of an avatar and the three parts of a name.

## Sources

- [Public profile](../specs/0016-public-profile.md), T1 to T14
