# 0043. List every published edition on the portal's home page

- Status: Accepted
- Date: 2026-11-19

## Context

A convention's page in the portal is reached only by its link. The home page lists nothing: it
says "Fantasy conventions, in one place" and offers a sign-in. [PRODUCT.md 11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp)
kept the convention catalogue beyond the MVP, and every public route starts from one convention's
address.

Every cross-tenant query is bound by the session's account or its confirmed email address, a
secret the caller proved, or the API's own job
([ARCHITECTURE.md, Tenant isolation](../ARCHITECTURE.md#tenant-isolation)). A list across
conventions for a visitor with no account has none of these.

The shop is about to be built ([checkout and orders](../specs/0004-checkout-and-orders.md)). Its
drafts send a buyer from "the convention's page" to "the edition's shop" and name no address for
either step, and the page of an edition shows only its programme.

## Decision

- The portal's home page lists the published editions of every convention that is not suspended,
  to anyone: the coming ones and the past ones. The list is in the MVP.
- A row is an edition. It leads to the edition's page, which shows the convention's name and logo,
  when and where the edition takes place, and links to its programme and to its shop.
- Publication alone lists an edition. No convention, org or admin lists or hides one apart from
  it.
- The list is a cross-tenant query bound by publication: it reads only what anyone already reads
  one convention at a time, the public columns of published editions and of their conventions.
  This is a fourth bound a cross-tenant query may have.
- The edition's page names no guests yet. What a guest of an edition is gets a spec of its own.

The rules, the tables and the routes are in the
[spec](../specs/0014-edition-list-and-edition-page.md).

## Alternatives

- **The catalogue beyond the MVP** (the state before). A visitor who was given no link finds no
  convention, and an attendee does not see what is coming.
- **A row a convention**, leading to the convention's page. A convention has no date: coming and
  past are said of an edition, and the visitor would choose the edition a second time on the next
  page.
- **A switch of the convention's that lists it.** A second switch beside publication, and it would
  hide nothing: a published edition stays open to anyone with its link.
- **The admin chooses what is listed.** Every new edition would wait for an admin, and the admins
  would decide which conventions are seen.
- **Guests on the page now**, as a list an org writes or as the speakers of the programme. Guest
  is not a term of the glossary. A written list holds the names of people with no account, and the
  speakers appear only with the programme. Both need rules nobody has set.

## Consequences

- This is the first read across conventions that no caller's identity binds. What it answers is
  the schema of one route: a field added there is public at once for every convention, so the
  schema is reviewed as a privilege is, and its columns join `globalReads`.
- A convention that publishes an edition on production to try the platform out is listed. It
  unpublishes the edition to leave the list.
- The list grows with the platform, so it is read a page at a time from the start. Searching and
  filtering it are not built.
- An edition gains a venue and a convention a logo. The logo is the first use of the branding
  permission and of a convention's file, so the team's screens start to give that permission, and
  a deployed application's content security policy lets a page show pictures from the API.
- The edition's page becomes the place an edition's programme and shop are reached from: the
  programme moves to a page of its own, and the shop's pages sit under the edition's page.
- PRODUCT.md 2, 6 and 11, the glossary and ARCHITECTURE.md, Tenant isolation, state the rules.

## Sources

- [Edition list and edition page](../specs/0014-edition-list-and-edition-page.md)
