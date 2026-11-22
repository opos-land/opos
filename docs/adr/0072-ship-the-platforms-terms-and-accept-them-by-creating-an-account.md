# 0072. Ship the platform's terms and accept them by creating an account

- Status: Accepted
- Date: 2026-11-21

## Context

OPOS had a privacy policy to ship and no terms of its own: the one legal text a user met was a
convention's, in its shop, and the product said that OPOS ships no legal text and requires no
consent by itself ([PRODUCT.md 7](../PRODUCT.md#7-modules)).

The public profile lets anyone with an account put a name, a picture and a text under OPOS's
address, and lets an admin take them down
([0071](0071-let-anyone-read-the-profile-an-account-published.md)). A takedown needs a rule it
rests on: a host that restricts what a user put up tells the user which rule of its terms was
broken (Regulation (EU) 2022/2065, Article 17), and those rules have to be written where the user
could read them before (Article 14).

An account also needs a lowest age. In Poland a person consents to the processing of personal
data from 16, the regulation's own age, which Polish law did not lower (Regulation (EU) 2016/679,
Article 8); below that a parent has to, and has to be shown to have.

## Decision

- OPOS has terms of its own, the platform's terms, on a page of the portal in every interface
  language. The public profile does not ship without them.
- They say what a name and a profile may not hold, each as a rule a takedown names; that an admin
  takes a profile down and clears a name; how a profile is reported and how a decision is
  contested; and a contact address.
- Creating an account accepts them. Registration says so and links them beside the privacy policy.
  No box is ticked, and nothing records an acceptance apart from the account itself.
- An account is for a person of 16 or older, and the terms say so. Nothing asks for an age and
  none is kept.
- Their text ships after a legal review, as the privacy policy's does.

## Alternatives

- **A box to tick at registration.** Accepting terms is the contract an account is, not a consent
  to processing, so the law asks for no separate act, and a box beside the one button adds a step
  to the form a phone fills in. A consent a convention needs of a buyer stays a box in its shop.
- **Recording the version an account accepted.** It matters once the terms change in a way an
  account has to accept again. There is one version, and the first change of that kind brings its
  own decision.
- **A date of birth, or a box "I am 16 or older".** A date of birth is data OPOS has no other use
  for, and with a name and a picture it marks the accounts of teens. A box checks nothing a
  sentence of the terms does not say.
- **No lowest age, with a parent's consent below 16.** It needs a way to reach and to verify a
  parent, which nothing here has. A younger attendee needs no account: a ticket names its holder,
  whoever ordered it.
- **Taking a profile down with no written rule.** The account would be told that its profile is
  gone and not what it broke, which is what the regulation forbids.

## Consequences

- The sentence that OPOS ships no legal text holds for a shop alone: its terms, its privacy policy
  and its consents stay the convention's own.
- A reason of a takedown is a rule of the terms and the reverse: adding a reason means adding the
  rule, in every language, and "another reason" can be a report's and never a takedown's.
- The terms page and the privacy page in the repository are drafts until their legal review, which
  also confirms the lowest age and the way of acceptance. The contact address they name is a
  placeholder until the real one exists.
- An account made before the terms existed accepted none. Whether any such account exists at the
  first release, and what it is then asked, is settled with that release.
- Nothing stops a person under 16 from creating an account. The rule is what the account declares,
  and an account found to break it is handled as any other breach of the terms.

## Sources

- [Public profile](../specs/0016-public-profile.md), M1 to M6
