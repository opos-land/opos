# OPOS — product document

What we build and for whom. The way it gets built is described in [PLAN.md](PLAN.md).

## Table of contents

1. [What OPOS is](#1-what-opos-is)
2. [MVP goal and end-to-end flow](#2-mvp-goal-and-end-to-end-flow)
3. [Glossary](#3-glossary)
4. [Business model — tenant and edition](#4-business-model--tenant-and-edition)
5. [Roles and permissions](#5-roles-and-permissions)
6. [Addresses and domains](#6-addresses-and-domains)
7. [Mobile application](#7-mobile-application)
8. [Languages, markets and time zones](#8-languages-markets-and-time-zones)
9. [Personal data and privacy](#9-personal-data-and-privacy)
10. [MVP scope vs beyond MVP](#10-mvp-scope-vs-beyond-mvp)

---

## 1. What OPOS is

A multitenant SaaS for running fantasy conventions: programme, tickets, attendee registrations and
a public convention website. One installation serves many conventions with full data isolation
between them.

An attendee can use either the platform website or the mobile application — both do the same thing
([chapter 7](#7-mobile-application)). Organizers work in the panel, in a browser.

The MVP targets a single market: Poland. The next ones are neighbouring — Czechia and Slovakia
have a nearly identical convention scene — and the product is multilingual from the first commit,
so entering them is a matter of adding translation catalogs.

The platform is self-hosted: our own VPS, with no lock-in to any particular cloud.

---

## 2. MVP goal and end-to-end flow

The MVP is a skeleton with one complete vertical feature — the convention programme. Further
modules (tickets, payments, speakers, rooms) are added onto a finished skeleton.

The MVP is closed once the flow below works without touching the database by hand:

1. The platform admin creates the `convention-a` convention and appoints its first head organizer.
2. The head organizer signs in to the panel, creates the "Convention A 2026" edition, marks it
   active and publishes it.
3. They add a few programme items.
4. The public convention website shows that programme: home page, programme, item details.
5. The head organizer emails an invitation granting programme write access to the 2026 edition
   only. The invitee accepts the link and sees nothing in the panel but that edition's programme.
6. An attendee registers (email/password or Google) — in the portal or in the mobile application —
   follows a link on the convention website, signs up for the 2026 edition and sees it under
   "my conventions". The same account works in both places.
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
| **user** | a convention attendee, works in the portal or the mobile application |
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
- Billing is handled at convention level, not edition level.
- An attendee sees the history of their visits to a given convention across the years.

**OPOS does not touch the conventions' money.** The shop configuration points at a payment
provider account owned by the convention, and ticket revenue flows directly to the organizer.
The platform neither processes nor holds attendee payments — it only stores the configuration.

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
| `<convention>.opos.land` | public convention website |
| customer's own domain | the same public convention website |
| `admin.opos.land` | reserved for a future platform admin panel |

The mobile application has no address of its own — it uses the same API. "Sign up" links on the
convention website open the application when it is installed, and the portal otherwise.

**Only the platform admin sets a custom domain.** The field is unique platform-wide and
unverified, so self-service would let someone claim another party's domain and intercept its
traffic. Wiring up a domain requires manual configuration on the platform side anyway.
Self-service returns together with domain ownership verification.

---

## 7. Mobile application

**In the MVP the application is a stub** — a second entrance to the portal's features, kept
deliberately minimal. It exists to prove that one account, one API contract, sign-in and the
release pipeline work end to end on iOS and Android. The attendee-facing value — the programme,
a personal schedule, push notifications — arrives beyond the MVP, on top of a proven skeleton.
The stub contains:

- registration and sign-in (email with password, and Google),
- password reset — a link out to the portal's form,
- "my conventions" — the list of editions the attendee is signed up for,
- signing up for an edition and withdrawing,
- account settings, language change, account deletion.

What it does not contain: the organizer panel or the public convention websites. Organizers work
in a browser, and a convention website is public and indexed, so it stays on the web.

**One account, two entrances.** The same account, the same data, the same permissions. An attendee
can create an account in the application and sign in with it in the portal, and the other way
round.

**Entry from a link.** The "Sign up" button on a convention website and links from emails open the
application when it is installed, landing straight on the right edition. Without the application
the same link opens the portal.

**Distribution in the MVP:** test releases through TestFlight and Google Play's internal channel.
Store publication is beyond the MVP — the review process, developer accounts and store
requirements are a separate track, independent of whether the code is ready.

---

## 8. Languages, markets and time zones

Supported languages in the MVP: **Polish and English**. The default interface language is Polish.
Texts are authored in code in English, and English is the fallback — a missing Polish translation
shows the English original, never an empty label or a technical identifier. Czech and Slovak
arrive together with their markets, beyond the MVP.

| Where | Which language |
|---|---|
| panel and portal | the user's choice stored on the account; browser language by default |
| mobile application | the user's choice stored on the account; device language by default |
| public convention website | the language the organizer set for the convention, regardless of the visitor's browser |
| emails | the recipient's language; for an unknown address, the inviting convention's language |

**One convention = one public website language.** Content translations — the same programme item
in Czech and in English — are beyond the MVP.

**The time zone is set per convention.** Programme hours are always shown in the convention's time
zone, not the browser's: "Saturday 14:00" has to mean the same thing to an attendee in Prague and
in Poznań.

Adding another language is a translation file — it requires no changes to code or database.

---

## 9. Personal data and privacy

We store attendees' personal data: first name, last name, email address.

**Account deletion is self-service.** The user deletes the account from settings; their sign-in
identities, sessions and edition registrations go with it. The single exception: an account that
is a convention's last head organizer must hand that role over first — otherwise the convention
would be left without an owner.

Database backups contain personal data, so they are encrypted and share the retention policy of
production data.

**The privacy policy ships with the MVP.** It is published on the platform website and linked
from every registration form — in the portal and in the mobile application. The remaining
obligations stay beyond the MVP: record of processing activities, data export and log retention.

---

## 10. MVP scope vs beyond MVP

### In the MVP

- Multilingual interface (Polish, English) in the panel, portal, convention website and emails
- Language and time zone per convention
- Accounts: email with password, and Google sign-in
- Password reset by email
- Mobile application for iOS and Android — a stub of the portal's scope, as test releases
- Conventions and editions
- Edition programme
- Public convention website with programme and archive
- Permissions on two levels
- Organizer invitations by email
- Full data isolation between conventions
- Account deletion by the user
- Privacy policy, linked from every registration form
- Demo data
- Deployment to our own VPS with backups

### Beyond the MVP

- Email verification — first in the queue
- Mobile application release in the App Store and Google Play
- Push notifications
- Programme and personal schedule in the mobile application
- Localized public website paths (today the paths are English regardless of convention language)
- Convention content translations and a language switcher on the public website
- Further markets and languages: Czech, Slovak, German, currencies other than the złoty, local
  payment methods
- Ticketing and payments
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
