# 0071. Let anyone read the profile an account published

- Status: Accepted
- Date: 2026-11-21

## Context

An account holds a first name, a last name, a language and a theme. The one place it is named to
everyone is the programme, which shows a speaker by first and last name. The profile module covers
"the user's account and my conventions" ([PRODUCT.md 7](../PRODUCT.md#7-modules)), and speaker
profiles and friends are beyond the MVP
([PRODUCT.md 11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp)).

The domain owner of profile set what an account shows of itself: a public name with a nickname, an
avatar, and a profile with a description, pronouns, a city or region, links and interests, on a
page of its own that the programme leads to.

Accounts are global, and another account is read only in a tenant transaction through a tenant
table, or behind `@RequireAdmin`. A cross-tenant query is bound by the session's account or its
confirmed email address, a secret the caller proved, the API's own job, or the publication of an
edition ([ARCHITECTURE.md, Tenant isolation](../ARCHITECTURE.md#tenant-isolation);
[0043](0043-list-every-published-edition-on-the-portals-home-page.md)). A profile that anyone reads
at an address of its own, whichever convention the reader came from, has none of these. An
account's file is read by its own account, and another account's only through a tenant row that
points at it ([file storage](../specs/0012-file-storage.md)).

## Decision

- An account may publish its profile, and anyone reads a published profile, with no sign-in. The
  public profile is in the MVP.
- This is a read of another account bound by that account's own publication: it answers the public
  name and the profile of an account that published it, and nothing else of the account. It is a
  fifth bound a read outside a tenant may have.
- A profile is private until its account publishes it, and the account withdraws it at any time. A
  profile that is withdrawn, one an admin took down and one that never was answer alike.
- A profile's address holds a random identifier of its own, which never changes. The account's
  identifier stays inside the API on every public route, as before.
- The avatar is public from its upload, whether or not the profile is published: anyone reads it by
  its file's identifier, with no tenant row between.
- The public name stands wherever an account is named to everyone, so the programme shows a
  speaker by it.

The rules, the tables and the routes are in the [spec](../specs/0016-public-profile.md).

## Alternatives

- **A profile shown only inside a convention**, as a speaker's card in the programme. It would
  keep the rule that another account is read through a tenant table. A user who is no speaker
  would have nothing to show, and the same person would be read again in every convention, though
  the account is one.
- **A sign-in to read a profile.** The programme is public, and its link to a speaker would end at
  a sign-in form. Anyone registers in a minute, so it would hide nothing.
- **The account's identifier in the address.** It is the key every other table points at, and no
  public route answers it.
- **A name the account chooses for its address.** It needs rules for uniqueness, reserved words,
  a change of the name, the name of a deleted account and a name that passes for someone else.
  Nothing needs a readable address yet.
- **An avatar private until the profile is published.** One file would be read two ways, and the
  account's own pages would have to fetch a picture with the session. The avatar is the account's
  face wherever it is shown, as its name is.
- **A year of birth on the profile.** An age is the convention's data, kept with an order and never
  on the account ([PRODUCT.md 7](../PRODUCT.md#7-modules)), and a year of birth beside a picture
  and a name would mark the profiles of children and teens.

## Consequences

- This is the first read of another account that nothing of the caller binds. What it answers is
  the schema of its route: a field added there is public at once, for every account that published
  its profile, so the schema is reviewed as a privilege is, and its columns join `globalReads`.
- `opos_app_global` starts to read the parts of an account's name. It never reads an email address.
- Nothing an account holds today becomes public by this: a profile starts empty and private. The
  one change no account asked for is in the programme, where a speaker with no name was left out
  and is now shown as "Anon".
- People other than orgs upload pictures and write text that everyone reads under OPOS's address.
  That needs a way to report it and to take it down, which the spec sets, and which answers what
  [0042](0042-keep-a-cleaned-master-of-an-image-and-make-its-variants-in-imgproxy.md) left open
  for a picture of a person.
- An avatar is a file for everyone and is cached for good, as a logo is. One that was removed
  stays in the browsers that had loaded it.
- The avatar is shown on the profile's page, on the account's own pages and to the admin. A page
  that shows it elsewhere, such as the programme, first needs a rule for an account whose profile
  is taken down.
- A takedown needs a rule to rest on, so the public profile ships with the platform's terms, which
  OPOS did not have. They also say that an account is for a person of 16 or older. The privacy
  policy names what a profile holds, and the legal review of both texts confirms what the spec took
  from the law ([PRODUCT.md 10](../PRODUCT.md#10-personal-data-and-privacy)).
- The decision is accepted and not built. Once the spec is implemented, PRODUCT.md 3, 6, 7, 10 and
  11 and ARCHITECTURE.md, Tenant isolation and API conventions, state the rules.

## Sources

- [Public profile](../specs/0016-public-profile.md)
