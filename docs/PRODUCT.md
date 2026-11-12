# OPOS — product document

What we build and for whom: the intent and the business rules. The rules of the code are in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Table of contents

1. [What OPOS is](#1-what-opos-is)
2. [MVP goal and end-to-end flow](#2-mvp-goal-and-end-to-end-flow)
3. [Glossary](#3-glossary)
4. [Business model — tenant and edition](#4-business-model--tenant-and-edition)
5. [Roles and permissions](#5-roles-and-permissions)
6. [Addresses and domains](#6-addresses-and-domains)
7. [Modules](#7-modules)
8. [Design and public image](#8-design-and-public-image)
9. [Languages, markets and time zones](#9-languages-markets-and-time-zones)
10. [Personal data and privacy](#10-personal-data-and-privacy)
11. [MVP scope vs beyond MVP](#11-mvp-scope-vs-beyond-mvp)

---

## 1. What OPOS is

A multitenant platform for running fantasy conventions, with full data isolation between them.
Attendees use the portal, on a phone or a desktop; organizers use the panel; the admins use the
admin application.

**OPOS is free for conventions** and is not built to earn from the scene; the attendee accounts it
gathers are the base for later products, such as virtual booths and an OPOS shop.

The MVP targets Poland; Czechia and Slovakia come next.

---

## 2. MVP goal and end-to-end flow

The MVP is the core plus the programme and tickets; other modules are built only after it. It is
done when this flow works with no manual database edits:

1. The admin creates a convention and its first head in the admin application.
2. The head creates an edition, marks it active and publishes it.
3. They add programme items and assign a speaker to one.
4. They connect the convention's own payment provider account and put tickets on sale.
5. The convention's page in the portal shows the programme to anyone.
6. A visitor buys tickets; the payment goes to the convention's account.
7. The head invites an org to this edition's programme alone, and that is all the org sees.
8. The visitor registers, by email or Google, and signs up for the edition, on a phone.
9. They like programme items, see them in their personal schedule and review one for the speaker.
10. At the gate, an org checks the visitor's tickets with a phone.
11. An organizer of one convention can neither read nor change anything in another.

---

## 3. Glossary

Each term has one name in code, API and interface, no synonyms, and exactly one rendering in every
interface language, following the scene's own vocabulary rather than a literal translation: in
Polish, **ticket** is rendered with the scene's word for admission to a convention, not the word for
a ticket; what the scene calls accreditation is the ticket.

| Term | Meaning |
|---|---|
| **tenant** | a convention brand across the years, e.g. "Convention A" |
| **edition** | its annual instance, e.g. "Convention A 2026" |
| **programme item** | an entry in an edition's programme; `ProgramItem` in code |
| **speaker** | an account an org assigns to a programme item |
| **like** | a user's mark adding a programme item to their personal schedule |
| **review** | a user's rating of a programme item |
| **ticket type** | a kind of ticket an edition sells |
| **order** | one purchase of tickets for an edition, with its payment |
| **ticket** | admission to an edition |
| **scanner** | a device checking tickets at the venue, with no account signed in |
| **attendee** | an account's registration for an edition |
| **admin** | runs the platform; creates conventions and their first heads; works in the admin application |
| **org** | a member of a convention's organizing team; works in the panel |
| **head** | a convention's head organizer: an org with no permission limits |
| **user** | a convention attendee; works in the portal |
| **core** | accounts, conventions, editions and permissions |
| **module** | a functional area built on the core |
| **booth** | an exhibitor's stand at an edition, or online as a virtual booth |
| **locale** | a language in BCP 47 form (`pl`, `en`) |
| **two-factor authentication** | a second sign-in step an account turns on for itself; 2FA, `mfa` in code |
| **suspended** | of a convention: taken off the platform by the admin until restored |

The roles are not exclusive: one account can be a head, an org, an attendee and a speaker, each in a
different convention.

---

## 4. Business model — tenant and edition

**A tenant is the convention brand**, not a single edition: its team, branding, configuration and
address carry over between editions, and an attendee keeps their history with it.

**A suspended convention is off for everyone but the admin**: its page is not found, its programme
items leave every personal schedule, and its organizers see only that it is suspended. Restored, it
is as it was. Only a suspended convention can be deleted, at once and for good, with everything it
owns; the accounts stay ([0031](adr/0031-suspend-a-tenant-before-deleting-it.md)).

**OPOS does not touch the conventions' money.** Ticket payments go straight to a payment provider
account the convention owns, and OPOS charges no fees.

| Convention level | Edition level |
|---|---|
| name, address, custom domain, language, time zone | programme items, speakers, likes, reviews |
| team, shop (payment provider, currency), branding | tickets, attendee registrations, website content |

The panel keeps the levels apart, so the organizers of one edition never meet the convention's
management: an edition opens to an org with a permission in it or read access to settings, the
convention settings to an org with a permission there, and a menu shows only what the organizer's
permissions open.

---

## 5. Roles and permissions

### 5.1 Permissions and roles

An org holds permissions **per resource** on two levels, each **none** (the default), **read** or
**write**: a new org has no access until granted, and need not have it in every edition.

| Level | Permissions |
|---|---|
| convention | settings (data and team), shop (payment provider account), branding |
| edition | programme, tickets (sales and scanners), website content |

A **head** bypasses every permission, and the membership never expires. Every convention keeps at
least one, handed over by promoting another member first; a demoted head keeps only the permissions
the demotion assigns. An **org** membership may expire, and from then on gives no access at all.

Speakers, attendees and ticket buyers hold no permissions. An org with programme write access
assigns speakers by a confirmed account's address: up to 10 per programme item, 100 new addresses
per convention an hour. An edition holds up to 1000 programme items.

### 5.2 Anti-escalation policy

- Only a head edits or removes a head, and the last head cannot be removed.
- Nobody edits their own membership.
- An org with settings write access manages orgs, but grants no one more than they hold, on either
  level. Lifting or extending an expiry grants back everything, so they do it only for a member
  holding no more than they do; lowering a permission or shortening access grants nothing, so any
  org managing the team may do it.
- An org whose access expires grants nothing past their end date — access, invitation or scanner —
  and raises no permission of a member whose access lasts longer.

### 5.3 Organizer invitations

An org with settings write access, or a head, invites by email. The invitation sets the whole
membership — role, permissions on both levels, expiry — within [5.2](#52-anti-escalation-policy).
A confirmed account outside the team joins at once; any other address gets a link, valid 7 days,
that works once and only for an account whose confirmed address is the invited one. An invitation
stands only while its sender could still send it, and exists only in its link until accepted. A
convention sends up to 20 an hour.

---

## 6. Addresses and domains

| Address | What is there | MVP |
|---|---|---|
| `opos.land` | the portal | yes |
| `opos.land/conventions/<convention>` | a convention's page: programme, past editions, sign-up | yes |
| `panel.opos.land` | the panel; the scanner at `/scanner` | yes |
| `api.opos.land` | the API; public documentation at `/docs` | yes |
| `<convention>.opos.land`, a custom domain | the public convention website | no |
| `admin.opos.land` | the admin application | yes |

**Only the admin sets a convention's address and custom domain.** Changing the address breaks every
old link, and no address is a word the platform uses itself, such as `panel` or `api`. The address
of a deleted convention is never given to another
([0031](adr/0031-suspend-a-tenant-before-deleting-it.md)).

---

## 7. Modules

**Every module has a domain owner**, who knows how conventions run that area and sets the module's
rules, a built module's included. Rules nobody with that knowledge has set are not guessed: for a
module still waiting for its owner, this document states only what it delivers and the rules any
shape of it keeps. Reviews, tickets with the scanner, and attendee registrations wait for their
owners.

| Module | Covers | MVP |
|---|---|---|
| programme | programme items, speakers, likes, personal schedule, reviews | yes |
| tickets | ticket sales, checking tickets at the venue | yes |
| profile | the user's account and "my conventions" | yes |
| CMS | the public convention website | no |
| booths | exhibitor booths, at the venue and virtual | no |
| friends | connections between users | no |

**Likes.** A signed-in user likes programme items of a published edition, before or during it, and
can take a like back. The like count is public; who liked an item is not.

**Reviews.** Users review programme items and a speaker reads the reviews of their own; the rest is
set by the programme's domain owner. Any shape keeps these rules:

| Rule | Value |
|---|---|
| Belongs to | a programme item; goes with the item and with its author's account |
| Organizers | act on it with the programme permission of the item's edition |

**Tickets.** What is sold, on what terms, and how tickets reach the buyer and are checked are set by
the domain owner of tickets. Any shape keeps these rules:

| Rule | Value |
|---|---|
| Money | goes to the convention's own payment provider account, never through OPOS |
| Provider credentials | given by an org with shop write access; stored encrypted, never shown again |
| Scanner | serves one edition; its access ends no later than the enabling org's; revocable |
| Link without sign-in | an order or ticket link carries a secret nobody can guess |

---

## 8. Design and public image

OPOS's public image matters as much as its features.

- **No AI-generated graphics**: images, logos and icons come from a designer or a licensed icon set.
- **No template look**: screens follow the designer's designs, not a component library's defaults.
- **Honest placeholders**: until a design exists, the component library's default look, unchanged,
  and real copy.
- **Every screen names itself** in the browser tab: the screen, then its edition or convention.
- **Light and dark**: every screen offers a toggle between a light and a dark theme. A signed-in
  account keeps its choice on the account, on every device; a visitor's stays in the browser. With
  no choice, the interface follows the system's theme.

---

## 9. Languages, markets and time zones

The MVP speaks **Polish**, the default, and **English**; a missing Polish text falls back to
English. The interface follows the user's choice, else the browser's language; an email, the
recipient's language, or for an address with no account, the inviting convention's.

**One convention, one content language and one time zone**: programme items are written in its
language, and their hours always show in its zone, so "Saturday 14:00" means the same in Prague
and in Poznań.

---

## 10. Personal data and privacy

OPOS stores an attendee's name, email address and activity; payment details stay with the payment
provider.

**Account deletion is self-service**, after a fresh sign-in, and takes likes, reviews, memberships
and registrations with it. Orders stay as the convention's sales records; a last head hands the
role over first.

A password is set only after the email address is confirmed. A link from an email acts only when
the button on its page is pressed. An email address leads to an account only once confirmed.

**Two-factor authentication is each account's own choice**, required by no role. Once on, it guards
every sign-in, password reset and account deletion. Ten one-time recovery codes, shown once and
stored hashed, replace a lost device and turn it off; turning it off signs out the other sessions,
removes the unused codes and sends an email, and the hash of a used code stays until the account is
deleted. A person who has lost both device and codes asks the admin.

Supabase hosts the database and sign-in in the EU on our behalf. Production data never leaves
production: Dev holds demo data and the team's own accounts. Backups are encrypted; our own copies
are kept up to three months. Emails reach the mail provider only over an encrypted connection.
There are no tracking or advertising cookies; the sign-in cookie is
strictly necessary. **A tracker runs only with the visitor's consent**: analytics, advertising or any
other tool the portal does not strictly need, allowed or refused per category in the consent banner
and withdrawn as easily from the footer; with no tracker, no banner shows. The panel, which shows
attendees' data, runs none
([0026](adr/0026-run-a-tracker-only-with-consent-and-none-in-the-panel.md)). **The privacy policy
ships with the MVP**, after a legal review, in every
interface language.

---

## 11. MVP scope vs beyond MVP

**In the MVP:**

- The core: accounts, conventions, editions, two-level permissions with expiry, data isolation
- The admin application: conventions with their first heads, their addresses, suspension and
  deletion ([0029](adr/0029-ship-four-web-applications.md)); organizer invitations by email
- Polish and English; language and time zone per convention
- Sign-in by email or Google, confirmation and reset by email, two-factor authentication
- The programme with speakers on the convention's page, likes, personal schedule, reviews
- Tickets sold to the convention's own account and checked at the venue; attendee registrations
- Account deletion; a privacy policy linked from registration
- A portal for phone browsers; the designer's interface, with no AI-generated graphics
- Demo data; our own server and Supabase in the EU, with backups and a Dev environment

**Beyond the MVP:**

- Modules: CMS with the website on `<convention>.opos.land` and custom domains, booths, friends
- Domain ownership verification with self-service
- Tickets without a purchase, merchandise and passes, refunds from the panel, sales embedded on a
  convention's website, offline scanning
- Fees for commercial exhibitors; an OPOS shop
- Push notifications; professional email templates
- Localized portal paths; content translations with a language switcher on the public website
- Czech, Slovak, German; other currencies, payment methods and providers; more sign-in providers
- Our own address during Google sign-in; changing an email address, confirmed by both addresses
- Convention catalogue, speaker profiles, rooms, block schedule, file uploads
- Custom roles, an audit log of team changes
- The remaining GDPR obligations: record of processing, data export, log retention
