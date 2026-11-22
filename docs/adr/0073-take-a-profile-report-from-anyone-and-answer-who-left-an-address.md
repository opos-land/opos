# 0073. Take a profile report from anyone and answer who left an address

- Status: Accepted
- Date: 2026-11-21

## Context

A published profile is read by anyone
([0071](0071-let-anyone-read-the-profile-an-account-published.md)), so the person who finds their
own picture or name on someone else's profile may have no account and want none. A host has to
give anyone an easy way to say that something it holds should not be there, to confirm that the
notice arrived when the sender left a contact, and to tell the sender what was decided
(Regulation (EU) 2022/2065, Article 16). The duty holds for a host of any size.

A form open to everyone is open to abuse: a flood of reports, reports of one profile again and
again, and a form that sends email to whatever address is typed into it. The portal has no bot
check yet ([0052](0052-stand-in-for-the-bot-check-until-the-portal-has-one.md)).

## Decision

- Anyone reports a published profile from its page, with no sign-in and no bot check.
- A report names one reason and may add a note and the sender's email address. It keeps nothing
  else of the sender.
- Reports are limited by the network address they come from, and a profile holds a limited number
  of open ones. A report beyond the limit of its profile is answered like any other and not kept,
  so the answer tells nobody whether a profile is already reported.
- A report of a profile that is not public answers as a profile that is not there.
- Who left an address gets two emails: that the report arrived, and what came of it. Each is a
  fixed text in the language of the page the report came from, with no word of the report in it.
- Only the admin reads what a report says. The API's own role adds a report and counts the open
  ones, and reads neither the note nor the address.
- A closed report is removed twelve months after it was closed, its address with it.

## Alternatives

- **A sign-in to report.** It would keep strangers out and with them the person the form is for:
  someone whose picture was taken has to be able to say so without joining the platform.
- **Asking for an email address always.** The regulation asks for a way to leave one, not for one.
  A required address would be typed in falsely as often as truly, and each false one would get
  mail.
- **Quoting the report in the confirmation.** The address is unverified, so the form would send a
  stranger whatever text the sender wrote. A fixed text makes it a notice and nothing else.
- **Waiting for the bot check.** The form moves no money and holds no stock; what a flood costs is
  an admin's attention, which the two limits bound. The check joins the form when the portal has
  one.
- **Keeping who reported, by account or network address.** It would let an admin block a sender,
  and it is personal data of people who only wanted something removed. The limits need no record.
- **Keeping reports for good.** A closed report still holds an accusation against an account and
  perhaps a stranger's address. Twelve months cover a dispute about the decision.

## Consequences

- A report is anonymous unless the sender chooses otherwise, so an admin cannot ask a question
  back and judges the profile as it is.
- The limit of open reports means that the reports of a profile nobody looks at stop being kept.
  The list of open reports is what an admin works from.
- An email address in a report is the one place OPOS keeps the address of someone with no account
  and no order. The privacy page says so, and the removal job is what keeps the promise.
- No complaint system is built for a sender who disagrees with the outcome: the regulation asks
  one of platforms that are no micro or small enterprise (Article 20). The outcome email names the
  contact address instead.

## Sources

- [Public profile](../specs/0016-public-profile.md), R1 to R9
