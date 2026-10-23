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
([chapter 11](#11-mvp-scope-vs-beyond-mvp)). Commercial exhibitors are a separate matter: booth
terms, including any fee, are set by the booths module.

Attendees use the platform website, which works on a phone as well as on a desktop. There is no
native mobile application. Organizers work in the panel, in a browser.

The MVP targets a single market: Poland. The next ones are neighbouring — Czechia and Slovakia
have a nearly identical convention scene — and the product is multilingual from the first commit,
so entering them is a matter of adding translation catalogs.

The platform is self-hosted: our own VPS, with no lock-in to any particular cloud.

The source code is available, not open source: it is licensed under the PolyForm Internal Use
License 1.0.0. An organization may run and modify OPOS for its own internal operations; distributing
the code or modified versions is not permitted.

---

## 2. MVP goal and end-to-end flow

The MVP is the core — accounts, conventions, editions and permissions — plus two complete
modules: the programme and tickets. Further modules ([chapter 7](#7-modules)) are added onto a
finished core.

The MVP is closed once the flow below works with no manual database edits beyond step 1:

1. The admin creates the `convention-a` convention and its first head organizer with a database
   script. There is no admin interface in the MVP.
2. The head organizer signs in to the panel, creates the "Convention A 2026" edition, marks it
   active and publishes it.
3. They add a few programme items and assign a speaker account to one of them.
4. They connect the convention's own payment provider account and create a ticket type with a
   price, a quantity limit and a sales window.
5. The portal shows that programme on the convention's page — list and item details — to anyone,
   signed in or not.
6. A visitor without an account buys two tickets with only an email address. The payment goes to
   the convention's account, and the tickets arrive by email with QR codes.
7. The head organizer emails an invitation granting programme write access to the 2026 edition
   only. The invitee accepts the link and sees nothing in the panel but that edition's programme.
8. The visitor later registers in the portal on the same address — with a password, confirmed
   through a link sent to that address, or with Google — and finds both tickets under "my
   tickets". They open the convention's page from a link the convention shared, sign up for the
   2026 edition and see it under "my conventions". All of it works in a phone browser.
9. They like a few programme items and find them in their personal schedule. After an item
   starts, they review it; the speaker reads the review in the portal.
10. At the gate, an org pairs a phone with the edition by scanning a QR code from the panel. The
    phone scans a ticket, shows everything in that order, and the org ticks the tickets handed
    in; a second scan of the same ticket shows it as already used.
11. An organizer of Convention A can neither read nor change anything in Convention B.

---

## 3. Glossary

The names are consistent across code, API and interface. We introduce no synonyms, and each term
has exactly one rendering in every interface language. A rendering follows the convention scene's
own vocabulary rather than a literal translation: in Polish, **ticket** is rendered with the word
the scene uses for admission to a convention, not with the word for a ticket. What the scene calls
accreditation is the ticket; there is no separate accreditation module.

| Term | Meaning |
|---|---|
| **tenant** | the convention brand as a continuous entity, e.g. "Convention A" |
| **edition** | a specific annual instance, e.g. "Convention A 2026" |
| **programme item** | an entry in an edition's programme; `ProgramItem` in code |
| **speaker** | an account an org assigns to a programme item; reads the reviews of that item |
| **like** | a user's mark on a programme item; it adds the item to their personal schedule |
| **review** | a user's rating of a programme item, with an optional comment |
| **ticket type** | a kind of ticket an edition sells: name, price, quantity limit, sales window |
| **order** | one purchase: the buyer's email and name, the tickets bought, the payment state |
| **ticket** | admission to an edition, with its own QR code; belongs to the email address the order was placed with |
| **scanner** | a phone paired with an edition that checks and redeems tickets at the venue |
| **attendee** | an account's registration for a specific edition |
| **admin** | the person running the whole platform: creates conventions, appoints the first head organizers |
| **org** | a member of a convention's organizing team, works in the panel |
| **head** | the head organizer of a convention — an org with no permission limits |
| **user** | a convention attendee, works in the portal |
| **core** | accounts, conventions, editions and permissions — what every module builds on |
| **module** | one functional area built on the core: programme, tickets, CMS, profile, booths, friends ([chapter 7](#7-modules)) |
| **booth** | an exhibitor's stand at an edition; a virtual booth is its online counterpart |
| **locale** | interface or website language in BCP 47 form (`pl`, `en`) |

The roles are not mutually exclusive. A single account can be the head organizer of one
convention, an org in another, an attendee of a third and a speaker at a fourth — under one
password and one sign-in.

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
only stores the configuration. The rule covers conventions, not commercial exhibitors: their
terms come with the booths module.

### What belongs to the convention, and what to the edition

| Convention level | Edition level |
|---|---|
| name, address (slug), custom domain | programme — programme items, their speakers |
| convention language and time zone | programme hours computed in the convention's time zone |
| website branding (logo, colours, fonts) | per-edition website content (hero, news) |
| organizing team | tickets, types, sales limits |
| shop configuration (payment provider, currency) | attendee registrations |
| eventually: speaker profiles with a history of appearances | likes and reviews of programme items |
| | rooms, block schedule |

In the MVP these work: name, address, language, time zone, team, shop configuration, programme
with speakers, likes, reviews, tickets and attendee registrations. The remaining items already
have their place in the permission model but no functionality behind them yet.

---

## 5. Roles and permissions

Organizers hold permissions **per resource**, on two levels: convention and edition.

### 5.1 Convention level

Membership in a convention's team grants a role (`head` / `org`) plus permissions to resources
shared across all editions. An `org` membership may carry an expiry date: from that moment the
person has no access to the convention at all, as if removed from the team. A `head` membership
never expires.

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

In the MVP, **settings**, **shop**, **programme** and **tickets** are the ones that actually do
something. The remaining permissions exist in the model but have no resource to govern yet and do
not appear in the panel.

| Permission | read | write |
|---|---|---|
| shop | sees which payment provider account is connected | connects or replaces it |
| tickets | sees ticket types, orders and paired scanners | manages ticket types, cancels orders, pairs and revokes scanners |

### 5.4 Roles

**`head` — head organizer.** Bypasses every permission, on both levels. Every convention must have
at least one. Granted when the convention is created; handing the role over requires promoting the
other person first.

**`org` — organizer.** Permissions assigned item by item, separately for the convention and for
each edition, optionally until an expiry date.

Speakers, attendees and ticket buyers are not team members: they hold no permissions in the
panel and act only in the portal, on their own programme items, registrations and tickets.

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
  higher than their own — on either level — nor set an expiry later than their own. Lifting or
  extending someone's expiry grants back everything they hold, so an org does it only for a member
  who holds no more than the org.
- Nobody edits their own membership.
- A convention's last head organizer cannot be removed.

---

## 6. Addresses and domains

| Address | What is there | In the MVP |
|---|---|---|
| `opos.land` | the portal: landing page, registration, attendee account, convention pages with the programme | yes |
| `opos.land/conventions/<convention>` | a convention's page: the active edition's programme and past editions | yes |
| `panel.opos.land` | organizer panel | yes |
| `panel.opos.land/scanner` | the ticket scanner on a paired phone, without signing in | yes |
| `api.opos.land` | API | yes |
| `api.opos.land/docs` | public API documentation (Swagger UI), no sign-in | yes |
| `auth.opos.land` | sign-in service: registration, sign-in, sessions, password reset, Google | yes |
| `<convention>.opos.land` | public convention website (CMS module) | no |
| customer's own domain | the same public convention website | no |
| `admin.opos.land` | platform admin panel | no |

A convention links to its page in the portal from its own website and social media; the page has
the "Sign up" button for the active edition.

**Only the admin sets a custom domain.** The field is unique platform-wide and unverified, so
self-service would let someone claim another party's domain and intercept its traffic. Wiring up a
domain requires manual configuration on the platform side anyway. Self-service returns together
with domain ownership verification.

---

## 7. Modules

OPOS is a core plus modules. The core — accounts, conventions, editions and permissions
([chapter 5](#5-roles-and-permissions)) — is shared by every module. A module adds one functional
area on top of it; a module that organizers manage brings its own permission on the convention or
edition level.

| Module | Covers | Permission | In the MVP |
|---|---|---|---|
| programme | an edition's programme items and their speakers, the public programme on the convention's page in the portal, likes, personal schedule, reviews | programme (edition) | yes |
| tickets | an edition's ticket types, sales without an account, emailed QR tickets, scanning at the venue | shop (convention), tickets (edition) | yes |
| CMS | the public convention website: home page, programme pages, archive, per-edition content | branding (convention), website content (edition) | no |
| profile | the user's account: name, language, "my conventions", account deletion | — (the user's own data) | account settings and "my conventions" |
| booths | exhibitor booths at an edition, and virtual booths online | to be added | no |
| friends | connections between users across conventions | — (the user's own data) | no |

Modules beyond the MVP are built only after the core, the programme and tickets are finished.

### 7.1 Likes and personal schedule

- Any signed-in user likes programme items of a published edition, before or during the edition.
  A like puts the item into the user's personal schedule in the portal.
- The like count of an item is public. Who liked an item is not shown to anyone.

### 7.2 Reviews

| Rule | Value |
|---|---|
| Who reviews | a holder of a valid ticket for the edition, or a team member with access to that edition |
| When | from the item's start time on |
| How many | one review per account per item; the author edits or deletes it |
| Content | rating 1–5 and an optional comment up to 2000 characters |
| Author shown | the author's name, or "anonymous" when the author chooses so; anonymity holds towards everyone, organizers included |
| Comment visibility | public, or the item's speakers only — the author's choice |
| Public view | the average rating, the number of reviews and the public comments |
| Speaker view | every comment on their own items, public and speakers-only |
| Moderation | an org with programme write access hides a review; a hidden review disappears from every view except the panel |

### 7.3 Tickets

| Rule | Value |
|---|---|
| What is sold | tickets only; one edition per order, up to 10 tickets |
| Ticket type | name, price in the convention's currency, optional quantity limit, sales start and end |
| Buyer | email address, first and last name; no account needed |
| Payment | through the convention's own payment provider account; the money never passes through OPOS. One provider in the MVP, supporting BLIK, Przelewy24 and cards |
| Unpaid order | holds its tickets for 15 minutes, then expires and releases them |
| Delivery | an email in the buyer's language with one QR code per ticket |
| Account | tickets belong to the order's email address; an account with that address sees them under "my tickets" |
| Refund | done by the convention in its payment provider's dashboard; an org then cancels the order in the panel and its tickets stop being valid |
| Invoices | issued by the convention outside OPOS |
| Scanner | an org with tickets write access shows a pairing QR code in the panel; a phone that scans it works for that edition only, until the edition ends or someone revokes it. No sign-in on the phone |
| At the gate | a scan shows every ticket in the order with its state; the org ticks the ones handed in. Each ticket is redeemed once; the scanner works online only, and network coverage at the gate is the convention's responsibility |

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
Texts are authored in code in English and ship together with their Polish translation. English is
the fallback — a missing Polish translation shows the English original, never an empty label or a
technical identifier. Czech and Slovak
arrive together with their markets, beyond the MVP.

| Where | Which language |
|---|---|
| panel and portal | the user's choice stored on the account; browser language by default |
| convention pages in the portal | the interface in the user's language; programme content as the organizer wrote it |
| emails | the recipient's language; for an unknown address, the inviting convention's language |

**One convention = one content language.** Programme items are written in the convention's
language. Content translations — the same programme item in Czech and in English — are beyond the
MVP.

**The time zone is set per convention.** Programme hours are always shown in the convention's time
zone, not the browser's: "Saturday 14:00" has to mean the same thing to an attendee in Prague and
in Poznań.

Adding another language is a translation file — it requires no changes to code or database.

---

## 10. Personal data and privacy

We store attendees' personal data: first name, last name, email address, and what they do on the
platform: likes and reviews. Account deletion removes their likes and reviews too.

Orders store the buyer's email address, first and last name. They are the convention's sales
records, so deleting an account does not delete orders placed with its address. Payment details
stay with the payment provider; OPOS stores only the provider's payment reference.

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

- The core: accounts, conventions, editions, permissions on two levels, membership expiry
- Creating conventions and their first head organizers with a database script
- Multilingual interface (Polish, English) in the panel, portal and emails
- Language and time zone per convention
- Accounts: email with password, confirmed by email, and Google sign-in
- Password reset by email
- Portal that works in a phone browser
- Edition programme with speakers
- Convention pages in the portal: the active edition's programme, past editions, item details
- Likes, personal schedule and reviews of programme items
- Tickets: ticket types, purchase without an account through the convention's payment provider
  account, emailed QR tickets, "my tickets", order cancellation, scanning at the venue
- Organizer invitations by email
- Full data isolation between conventions
- Account deletion by the user
- Privacy policy, linked from the registration form
- Interface following the designer's designs, with no AI-generated graphics
- Demo data
- Deployment to our own VPS with backups

### Beyond the MVP

- Modules: CMS, booths (including virtual booths), friends ([chapter 7](#7-modules))
- Tickets issued by the team to staff and guests without a purchase
- Merchandise, passes and other products besides tickets; refunds triggered from the panel
- Ticket sales embedded on the convention's own website (white label, iframe, public sales API)
- Offline scanning
- Public convention website on `<convention>.opos.land` and on custom domains
- Platform admin panel at `admin.opos.land`
- Fees for commercial exhibitors
- OPOS shop for attendees
- Push notifications
- Localized portal paths (today the paths are English regardless of convention language)
- Convention content translations and a language switcher on the public website
- Further markets and languages: Czech, Slovak, German, currencies other than the złoty, local
  payment methods
- Further payment providers
- Further sign-in providers
- Convention catalogue in the portal
- Speaker profiles, rooms, block schedule
- File uploads (logos, avatars)
- Domain ownership verification and self-service for that field
- Professional email templates
- Custom permission roles beyond `head` and `org`
- Audit log of permission and team changes
- Remaining GDPR obligations
