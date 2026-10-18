# OPOS — product document

What we build and for whom. The way it gets built is described in [PLAN.md](PLAN.md).

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

A multitenant platform for running fantasy conventions: programme, tickets, attendee registrations
and a public convention website. One installation serves many conventions with full data isolation
between them.

**OPOS is free for conventions.** The platform charges conventions nothing and is not built to
earn from the convention scene. Convention OPOS is the starting point: the attendee accounts it
gathers are the base for later attendee-facing products, such as virtual booths and an OPOS shop
([chapter 11](#11-mvp-scope-vs-beyond-mvp)).

Attendees use the platform website, which works on a phone as well as on a desktop. There is no
native mobile application. Organizers work in the panel, in a browser.

The MVP targets a single market: Poland. The next ones are neighbouring — Czechia and Slovakia
have a nearly identical convention scene — and the product is multilingual from the first commit,
so entering them is a matter of adding translation catalogs.

The platform is self-hosted: our own VPS, with no lock-in to any particular cloud.

---

## 2. MVP goal and end-to-end flow

The MVP is the core — accounts, conventions, editions and permissions — plus one complete module,
the programme. Further modules ([chapter 7](#7-modules)) are added onto a finished core.

The MVP is closed once the flow below works without touching the database by hand:

1. The platform admin creates the `convention-a` convention and appoints its first head organizer.
2. The head organizer signs in to the panel, creates the "Convention A 2026" edition, marks it
   active and publishes it.
3. They add a few programme items.
4. The public convention website shows that programme: home page, programme, item details.
5. The head organizer emails an invitation granting programme write access to the 2026 edition
   only. The invitee accepts the link and sees nothing in the panel but that edition's programme.
6. An attendee registers in the portal — with email and password, confirmed through a link sent
   to that address, or with Google — follows a link on the convention website, signs up for the
   2026 edition and sees it under "my conventions". All of it works in a phone browser.
7. An organizer of Convention A can neither read nor change anything in Convention B.

---

## 3. Glossary

The names are consistent across code, API and interface. We introduce no synonyms.

| Term | Meaning |
|---|---|
| **tenant** | the convention brand as a continuous entity, e.g. "Convention A" |
| **edition** | a specific annual instance, e.g. "Convention A 2026" |
| **event / programme item** | an entry in an edition's programme |
| **attendee** | an account's registration for a specific edition |
| **admin** | the person running the whole platform: creates conventions, appoints the first head organizers |
| **org** | a member of a convention's organizing team, works in the panel |
| **head** | the head organizer of a convention — an org with no permission limits |
| **user** | a convention attendee, works in the portal |
| **core** | accounts, conventions, editions and permissions — what every module builds on |
| **module** | one functional area built on the core: programme, CMS, profile, accreditation, booths, friends ([chapter 7](#7-modules)) |
| **booth** | an exhibitor's stand at an edition; a virtual booth is its online counterpart |
| **locale** | interface or website language in BCP 47 form (`pl`, `en`) |

The roles are not mutually exclusive. A single account can be the platform admin, head organizer
of one convention, an org in another and an attendee of a third — under one password and one
sign-in.

---

## 4. Business model — tenant and edition

**A tenant is the convention brand**, not a single edition. Conventions are series run by the same
team year after year; the largest ones have been running for two or three decades without a break.

That split gives us:

- The organizing team, branding and configuration carry over from edition to edition.
- The convention address stays the same between editions, so SEO does not suffer.
- An attendee sees the history of their visits to a given convention across the years.

**OPOS does not touch the conventions' money.** It charges conventions no fees, and the shop
configuration points at a payment provider account owned by the convention, so ticket revenue
flows directly to the organizer. The platform neither processes nor holds attendee payments — it
only stores the configuration.

### What belongs to the convention, and what to the edition

| Convention level | Edition level |
|---|---|
| name, address (slug), custom domain | programme — programme items |
| public website language and time zone | programme hours computed in the convention's time zone |
| website branding (logo, colours, fonts) | per-edition website content (hero, news) |
| organizing team | tickets, types, sales limits |
| shop configuration (payment provider, currency) | attendee registrations |
| eventually: speakers with a history of appearances | rooms, block schedule |

In the MVP these work: name, address, custom domain, language, time zone, team, programme and
attendee registrations. The remaining items already have their place in the permission model but
no functionality behind them yet.

---

## 5. Roles and permissions

Organizers hold permissions **per resource**, on two levels: convention and edition.

### 5.1 Convention level

Membership in a convention's team grants a role (`head` / `org`) plus permissions to resources
shared across all editions:

- **settings** — convention data and team composition
- **branding** — logo, colours, website appearance
- **shop** — payment provider, currency

### 5.2 Edition level

Access to a specific edition is optional — a team member may, but need not, have access to every
edition:

- **programme** — the edition's programme items
- **website content** — the edition's hero and news
- **tickets** — the edition's tickets

### 5.3 Permission values

Every permission takes one of three values: **none / read / write**. The default is none — a new
team member starts with no access at all and receives it explicitly.

In the MVP, **settings** and **programme** are the ones that actually do something. The remaining
permissions exist in the model but have no resource to govern yet and do not appear in the panel.

### 5.4 Roles

**`head` — head organizer.** Bypasses every permission, on both levels. Every convention must have
at least one. Granted when the convention is created; handing the role over requires promoting the
other person first.

**`org` — organizer.** Permissions assigned item by item, separately for the convention and for
each edition.

### 5.5 Example

Jan is the head organizer of Convention A, helps out at Convention B (the 2027 edition's programme
and nothing else) and attends Convention C. All on one account:

| Where | Role | What they can do |
|---|---|---|
| Convention A | head | everything, in every edition |
| Convention B | org | nothing at convention level |
| Convention B, 2027 edition | — | write access to the programme; nothing else |
| Convention C, 2026 edition | attendee | only their own registration |

In the panel Jan switches convention context in the top bar.

### 5.6 Anti-escalation policy

- Only a head organizer edits or removes another head organizer.
- An org with write access to settings manages other orgs, but cannot grant anyone a permission
  higher than their own — on either level.
- Nobody edits their own membership.
- A convention's last head organizer cannot be removed.

---

## 6. Addresses and domains

| Address | What is there |
|---|---|
| `opos.land` | platform website: landing page, registration and attendee account |
| `panel.opos.land` | organizer panel |
| `api.opos.land` | API |
| `auth.opos.land` | sign-in service: registration, sign-in, sessions, password reset, Google |
| `<convention>.opos.land` | public convention website |
| customer's own domain | the same public convention website |
| `admin.opos.land` | reserved for a future platform admin panel |

"Sign up" links on the convention website lead to the portal, landing straight on the right
edition.

**Only the platform admin sets a custom domain.** The field is unique platform-wide and
unverified, so self-service would let someone claim another party's domain and intercept its
traffic. Wiring up a domain requires manual configuration on the platform side anyway.
Self-service returns together with domain ownership verification.

---

## 7. Modules

OPOS is a core plus modules. The core — accounts, conventions, editions and permissions
([chapter 5](#5-roles-and-permissions)) — is shared by every module. A module adds one functional
area on top of it; a module that organizers manage brings its own permission on the convention or
edition level.

| Module | Covers | Permission | In the MVP |
|---|---|---|---|
| programme | an edition's programme items and the public programme on the convention website | programme (edition) | yes |
| CMS | the public convention website: home page, programme pages, archive, per-edition content | branding (convention), website content (edition) | home page, programme and archive |
| profile | the user's account: name, language, "my conventions", account deletion | — (the user's own data) | account settings and "my conventions" |
| accreditation | admitting attendees, staff and guests to an edition | to be added | no |
| booths | exhibitor booths at an edition, and virtual booths online | to be added | no |
| friends | connections between users across conventions | — (the user's own data) | no |
| tickets | an edition's tickets, types and sales limits | tickets (edition) | no |

Modules beyond the MVP are built only after the core and the programme are finished.

---

## 8. Design and public image

OPOS is user-facing: attendees and organizers meet it directly, and its public image matters as
much as its features.

- **No AI-generated graphics.** Illustrations, logos, images and icons in the product and in its
  public materials are made by a human designer or come from a licensed icon set — never from an
  image generator.
- **No generic template look.** Screens follow the designer's designs. A UI component library is a
  starting point for the code, not the final appearance.
- **Placeholders are honest.** Until a design exists, a screen uses plain blocks and real copy,
  not stand-in artwork.

---

## 9. Languages, markets and time zones

Supported languages in the MVP: **Polish and English**. The default interface language is Polish.
Texts are authored in code in English, and English is the fallback — a missing Polish translation
shows the English original, never an empty label or a technical identifier. Czech and Slovak
arrive together with their markets, beyond the MVP.

| Where | Which language |
|---|---|
| panel and portal | the user's choice stored on the account; browser language by default |
| public convention website | the language the organizer set for the convention, regardless of the visitor's browser |
| emails | the recipient's language; for an unknown address, the inviting convention's language |

**One convention = one public website language.** Content translations — the same programme item
in Czech and in English — are beyond the MVP.

**The time zone is set per convention.** Programme hours are always shown in the convention's time
zone, not the browser's: "Saturday 14:00" has to mean the same thing to an attendee in Prague and
in Poznań.

Adding another language is a translation file — it requires no changes to code or database.

---

## 10. Personal data and privacy

We store attendees' personal data: first name, last name, email address.

**Registration with a password requires a confirmed email address.** The account starts working
once its owner clicks the link sent to that address. A Google sign-in counts as confirmed.

**Account deletion is self-service.** The user deletes the account from settings; their sign-in
identities, sessions and edition registrations go with it. The single exception: an account that
is a convention's last head organizer must hand that role over first — otherwise the convention
would be left without an owner.

Database backups contain personal data, so they are encrypted and share the retention policy of
production data.

**The privacy policy ships with the MVP.** It is published on the platform website and linked
from the registration form. The remaining obligations stay beyond the MVP: record of processing
activities, data export and log retention.

---

## 11. MVP scope vs beyond MVP

### In the MVP

- The core: accounts, conventions, editions, permissions on two levels
- Multilingual interface (Polish, English) in the panel, portal, convention website and emails
- Language and time zone per convention
- Accounts: email with password, confirmed by email, and Google sign-in
- Password reset by email
- Portal that works in a phone browser
- Edition programme
- Public convention website with programme and archive
- Organizer invitations by email
- Full data isolation between conventions
- Account deletion by the user
- Privacy policy, linked from the registration form
- Interface following the designer's designs, with no AI-generated graphics
- Demo data
- Deployment to our own VPS with backups

### Beyond the MVP

- Modules: accreditation, booths (including virtual booths), friends, tickets ([chapter 7](#7-modules))
- OPOS shop for attendees
- Push notifications
- Personal schedule in the portal
- Localized public website paths (today the paths are English regardless of convention language)
- Convention content translations and a language switcher on the public website
- Further markets and languages: Czech, Slovak, German, currencies other than the złoty, local
  payment methods
- Payments
- Further sign-in providers
- Attendee comments
- Convention catalogue in the portal
- Speakers, rooms, block schedule
- File uploads (logos, avatars)
- Domain ownership verification and self-service for that field
- Professional email templates
- Custom permission roles beyond `head` and `org`
- Audit log of permission and team changes
- Remaining GDPR obligations
