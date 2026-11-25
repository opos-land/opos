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
5. The portal lists the edition on its home page, and the edition's page shows anyone when and
   where it takes place and leads to its programme.
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

| Term                          | Meaning                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| **tenant**                    | a convention brand across the years, e.g. "Convention A"                                           |
| **edition**                   | its annual instance, e.g. "Convention A 2026"                                                      |
| **programme item**            | an entry in an edition's programme; `ProgramItem` in code                                          |
| **speaker**                   | an account an org assigns to a programme item                                                      |
| **like**                      | a user's mark adding a programme item to their personal schedule                                   |
| **review**                    | a user's rating of a programme item                                                                |
| **ticket type**               | a kind of ticket an edition sells                                                                  |
| **order**                     | one checkout of an edition with its payment: at most one ticket, with its add-ons and merchandise  |
| **ticket**                    | admission to an edition                                                                            |
| **scanner**                   | a device checking tickets at the venue, with no account signed in                                  |
| **attendee**                  | an account's registration for an edition                                                           |
| **admin**                     | runs the platform; creates conventions and their first heads; works in the admin application       |
| **org**                       | a member of a convention's organizing team; works in the panel                                     |
| **head**                      | a convention's head organizer: an org with no permission limits                                    |
| **user**                      | a convention attendee; works in the portal                                                         |
| **core**                      | accounts, conventions, editions and permissions                                                    |
| **module**                    | a functional area built on the core                                                                |
| **booth**                     | an exhibitor's stand at an edition, or online as a virtual booth                                   |
| **locale**                    | a language in BCP 47 form (`pl`, `en`)                                                             |
| **two-factor authentication** | a second sign-in step an account turns on for itself; 2FA, `mfa` in code                           |
| **suspended**                 | of a convention: taken off the platform by the admin until restored                                |
| **venue**                     | where an edition takes place: the name of the place, its address and its city                      |
| **shop**                      | where an edition sells, opened by its organizers once what selling needs is set                    |
| **consent**                   | a sentence of the convention's own that a buyer accepts with an order, required or optional        |
| **price tier**                | a price of a ticket type within a date window                                                      |
| **supporter price**           | a higher price a buyer may choose for a ticket type, in place of its price tier's                  |
| **perk**                      | something a ticket type includes: shown, never sold separately                                     |
| **add-on**                    | an optional extra bought with a ticket: unlimited, limited by a capacity or headcount only         |
| **merchandise item**          | a product an edition sells, picked up at the edition and never shipped                             |
| **variant**                   | a buyable option of a merchandise item, with its own stock                                         |
| **size chart**                | a picture of the measurements of a merchandise item's sizes                                        |
| **pre-order deadline**        | the moment until which a variant may sell without a stock limit                                    |
| **ticket holder**             | the person a ticket is issued to, named in its order when its buyer names them                     |
| **age band**                  | child, teen or adult: a ticket holder's age on the edition's first day                             |
| **guardian consent**          | a guardian's written consent for a teen, brought on paper to the edition                           |
| **custom field**              | a short text an edition asks a ticket holder for, never anything sensitive                         |
| **buyer**                     | who places an order and pays for it: a visitor under an email address, or an account under its own |
| **payment**                   | money a payment provider reports for an order                                                      |
| **payment attempt**           | one try at paying an order at its payment provider                                                 |
| **hold**                      | what an unpaid order keeps of stock and capacity, for thirty minutes                               |
| **QR code**                   | what a paid order is found by at the edition                                                       |
| **order link**                | an emailed link that opens one order without a sign-in                                             |
| **manual order**              | a sale made outside the shop, recorded by an org: at a desk, by invoice or complimentary           |
| **discount code**             | a code a buyer enters at checkout to lower the price of an order, down to free entry               |
| **profile**                   | what an account shows of itself to everyone once it publishes it                                   |
| **public name**               | an account's first name, nickname and last name in the order it chose; "Anon" with none            |
| **avatar**                    | an account's picture, public from its upload                                                       |
| **profile report**            | a notice from anyone that a published profile should not be there                                  |
| **platform's terms**          | the rules of using OPOS that an account accepts when it is created                                 |

The roles are not exclusive: one account can be a head, an org, an attendee and a speaker, each in a
different convention.

---

## 4. Business model — tenant and edition

**A tenant is the convention brand**, not a single edition: its team, branding, configuration and
address carry over between editions, and an attendee keeps their history with it.

**A suspended convention is off for everyone but the admin**: its page is not found, its editions
leave the portal's list, its programme items leave every personal schedule, and its organizers see
only that it is suspended. Restored, it
is as it was. Only a suspended convention can be deleted, at once and for good, with everything it
owns; the accounts stay ([0031](adr/0031-suspend-a-tenant-before-deleting-it.md)).

**OPOS does not touch the conventions' money.** Ticket payments go straight to a payment provider
account the convention owns, and OPOS charges no fees.

| Convention level                                                            | Edition level                                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| name, address, custom domain, language, time zone                           | venue, programme items, speakers, likes, reviews                                           |
| team, shop (payment provider account, seller's details, currency), branding | the shop with its documents and consents, tickets, attendee registrations, website content |

The panel keeps the levels apart, so the organizers of one edition never meet the convention's
management: an edition opens to an org with a permission in it or read access to settings, the
convention settings to an org with a permission there, and a menu shows only what the organizer's
permissions open.

---

## 5. Roles and permissions

### 5.1 Permissions and roles

An org holds permissions **per resource** on two levels, each **none** (the default), **read** or
**write**: a new org has no access until granted, and need not have it in every edition.

| Level      | Permissions                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------- |
| convention | settings (data and team), shop (payment provider account, seller's details), branding (logo) |
| edition    | programme, tickets (the edition's shop, sales and scanners), website content                 |

A permission on one level grants none on the other: an org with the tickets of an edition opens
its shop, and learns of the convention's provider account and seller's details only whether they
are ready; an org with the shop permission alone opens no shop.

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

| Address                                        | What is there                                                             | MVP |
| ---------------------------------------------- | ------------------------------------------------------------------------- | --- |
| `opos.land`                                    | the portal: the editions of every convention, coming and past             | yes |
| `opos.land/conventions/<convention>`           | a convention's page: its active edition, its other editions, sign-up      | yes |
| `opos.land/conventions/<convention>/<edition>` | an edition's page: when and where it takes place, its programme, its shop | yes |
| `opos.land/profiles/<profile>`                 | a profile its account published                                           | yes |
| `panel.opos.land`                              | the panel; the scanner at `/scanner`                                      | yes |
| `api.opos.land`                                | the API; public documentation at `/docs`                                  | yes |
| `<convention>.opos.land`, a custom domain      | the public convention website                                             | no  |
| `admin.opos.land`                              | the admin application                                                     | yes |

**Publishing an edition lists it.** The portal's home page lists the published editions of every
convention that is not suspended, to anyone: the coming ones, an edition under way among them, then
the past ones. Publication alone decides it: no convention, org or admin lists or hides an edition
apart from it ([0043](adr/0043-list-every-published-edition-on-the-portals-home-page.md)). A
published edition has a page of its own, a past one too, which shows the convention's name and
logo and the edition's dates and venue, and leads to its programme and, while it is open, to its
shop. A convention with no logo shows none.

**A link says what it leads to.** Where a link to the portal is shared, and to a search engine, the
page it leads to is named before anyone opens it: a convention, an edition, its programme, a
programme item, its shop or a published profile by its name, with when and where an edition takes
place and what a programme item or a profile says of itself, and with the convention's logo or the
profile's avatar as its picture. A convention's pages that anyone may open are named in the
convention's language; every other page as it names itself in the tab, in the default language. A
page that shows a stranger nothing asks search engines to leave it out: an account's own pages and
its personal schedule, the page a confirmation link opens, the second step of signing in, a
checkout and an order. An address nothing is at says so to a search engine too
([0091](adr/0091-fill-the-head-of-the-portals-pages-on-a-server-beside-it.md)).

**Only the admin sets a convention's address and custom domain.** Changing the address breaks every
old link, and no address is a word the platform uses itself, such as `panel` or `api`. The address
of a deleted convention is never given to another
([0031](adr/0031-suspend-a-tenant-before-deleting-it.md)).

---

## 7. Modules

**Every module has a domain owner**, who knows how conventions run that area and sets the module's
rules, a built module's included. Rules nobody with that knowledge has set are not guessed: for a
module still waiting for its owner, this document states only what it delivers and the rules any
shape of it keeps. Reviews and attendee registrations wait for their owners; the tickets module has
its owner's rules and is built one [spec](specs/README.md) at a time.

| Module    | Covers                                                       | MVP |
| --------- | ------------------------------------------------------------ | --- |
| programme | programme items, speakers, likes, personal schedule, reviews | yes |
| tickets   | ticket sales, checking tickets at the venue                  | yes |
| profile   | the user's account, its public profile and "my conventions"  | yes |
| CMS       | the public convention website                                | no  |
| booths    | exhibitor booths, at the venue and virtual                   | no  |
| friends   | connections between users                                    | no  |

**Likes.** A signed-in user likes programme items of a published edition, before or during it, and
can take a like back. The like count is public; who liked an item is not.

**Reviews.** Users review programme items and a speaker reads the reviews of their own; the rest is
set by the programme's domain owner. Any shape keeps these rules:

| Rule       | Value                                                              |
| ---------- | ------------------------------------------------------------------ |
| Belongs to | a programme item; goes with the item and with its author's account |
| Organizers | act on it with the programme permission of the item's edition      |

**The public profile.** An account shows who it is: a public name, an avatar, and a profile it may
publish, on a page of its own in the portal that a speaker's name in the programme leads to. The
rules are the domain owner's:

| Rule        | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public name | a first name, a nickname and a last name, each optional, in the order the account chose; with none, "Anon". It stands wherever the account is named to everyone, a speaker in the programme too. The panel and the admin application show the first and the last name with the email address                                                                                                                                                                                                                                           |
| Profile     | a description, pronouns, a city or region, links and interests from the platform's list, each optional and shown as written; never an email address, an age or anything the account did                                                                                                                                                                                                                                                                                                                                                |
| Publication | private until its account publishes it, and withdrawn at any time with what it holds kept. Anyone reads a published profile, with no sign-in, at an address whose random identifier never changes and is not the account's; search engines are asked to leave it out. A withdrawn, a taken-down and an unknown profile answer alike ([0071](adr/0071-let-anyone-read-the-profile-an-account-published.md))                                                                                                                             |
| Avatar      | one picture, the account's own to upload, replace and remove, of itself or one it may show; public from its upload, whether or not the profile is published. An account with none is shown by its initials                                                                                                                                                                                                                                                                                                                             |
| Report      | anyone reports a published profile, with no sign-in: a reason, and a note and an email address when the sender gives them. Who gave an address is told that the report arrived and what came of it, in a fixed text. A closed report is removed twelve months after its closing ([0073](adr/0073-take-a-profile-report-from-anyone-and-answer-who-left-an-address.md))                                                                                                                                                                 |
| Takedown    | the admin takes a profile down under a rule of the platform's terms: it stops being public, cannot be published and loses its avatar, and its account is told what was done, why, that a person decided and how to contest it. The account changes the profile and asks for a review; a restored profile is published by its account alone. The admin changes nothing a profile says, and clears a name that breaks the terms, which blocks nothing ([0074](adr/0074-take-a-profile-down-with-a-reason-and-change-nothing-it-says.md)) |

**Tickets.** What is sold, on what terms, and how tickets reach the buyer and are checked are set by
the domain owner of tickets. Any shape keeps these rules:

| Rule                 | Value                                                                           |
| -------------------- | ------------------------------------------------------------------------------- |
| Money                | goes to the convention's own payment provider account, never through OPOS       |
| Provider credentials | given by an org with shop write access; stored encrypted, never shown again     |
| Scanner              | serves one edition; its access ends no later than the enabling org's; revocable |
| Link without sign-in | an order or ticket link carries a secret nobody can guess                       |

**The shop's setup.** A convention sets once what each of its editions sells with: its own payment
provider account, and its seller's details, the legal entity a buyer's contract is with and the
address buyers write to. It sells in one currency, PLN. Each edition holds its legal documents and
its consents, and opens a shop of its own.

| Rule                         | Value                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opening                      | needs the provider account ready to sell, the seller's details complete, and a published version of the edition's shop terms and privacy policy; a refusal names what is missing                                                                                                                                                                                                                                                                  |
| While a shop is open         | the account stays connected and ready to sell, the details stay complete, and the last document standing for the shop terms or the privacy policy is neither hidden nor deleted                                                                                                                                                                                                                                                                   |
| While a payment is under way | which is while an order awaits payment, and for 24 hours from the end of the hold of an expired order with a payment attempt nobody confirmed: the account is not disconnected, and takes new credentials only of the same account, or once its own can no longer be read or its provider refuses them ([0093](adr/0093-change-a-provider-account-under-a-payment-only-where-the-payment-loses-nothing.md))                                       |
| Publication                  | an edition is published without an open shop, and a shop may open before its edition is published; buyers reach the shop only while both hold                                                                                                                                                                                                                                                                                                     |
| Documents                    | published as PDF versions that never change: a correction is a new version, and a published version stays readable by its link for as long as the convention is on the platform                                                                                                                                                                                                                                                                   |
| Consents                     | their wording, and which of them a buyer must accept, are the convention's own: OPOS ships no legal text of a shop and requires no consent of a buyer by itself; a consent links one document for good, and the sentence of a consent an order accepted is never changed: another sentence is a new consent, asked for in place of the old one, which is hidden ([0094](adr/0094-attest-in-an-order-each-consent-exactly-as-its-buyer-saw-it.md)) |
| Limits                       | 30 documents an edition, 50 versions a document, 20 consents an edition; 20 checks of credentials with the provider a convention an hour                                                                                                                                                                                                                                                                                                          |

**The catalog.** Each edition sets what it sells and on what terms: ticket types, add-ons,
merchandise, and what it asks of a ticket holder. Every price is a gross amount in the
convention's currency.

| Rule             | Value                                                                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ticket types     | each has a sale window, a capacity or none, the age bands it allows, and price tiers: a price within a date window; the tiers of one ticket type never overlap, and where none covers a moment the ticket type is not on sale |
| Supporter prices | fixed amounts a buyer may choose instead of the tier's price; only those above the price in force are offered                                                                                                                 |
| Perks            | shown to the buyer as what a ticket type includes; never sold separately, with no price and no stock                                                                                                                          |
| Add-ons          | optional extras bought with a ticket, at a price that may be zero: without a limit, limited by a capacity, or headcount only, which records interest and reserves nothing; an add-on may have one picture                     |
| Merchandise      | items with option axes and the variants that exist, stock held per variant; picked up at the edition and never shipped; sold with a ticket, and on its own where the edition turns merch-only orders on                       |
| Pre-order        | until the edition's pre-order deadline a variant may sell without a stock limit; after it, only from a number an org entered                                                                                                  |
| Pictures         | a picture and a size chart of an item and the picture of an add-on are images, for everyone once their item or add-on is not hidden and their edition is published, and for the edition's orgs alone before that              |
| Ticket holders   | an edition sets the two ages that divide child, teen and adult by age on its first day, may link a guardian consent form, and asks its own custom fields: short texts, never anything sensitive                               |
| Limits           | 50 ticket types, 50 add-ons, 200 merchandise items, 100 variants and ten pictures an item, 20 custom fields an edition                                                                                                        |

**Checkout and orders.** A buyer orders in the edition's shop while the edition is published and
its shop is open: a visitor under an email address typed twice, an account under its own, with no
place in the convention's team. An order is one checkout with its payment: at most one ticket, for
one ticket holder, with its add-ons and merchandise, or merchandise alone
([0083](adr/0083-hold-at-most-one-ticket-in-an-order.md)).

| Rule                          | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The shop                      | shows what is on sale with its price in force, or the org's "sales closed" message; it never shows how much is left, but "Sold out" and the places left of an add-on below its threshold                                                                                                                                                                                                                                                                                                  |
| Placing                       | the API enforces every rule the shop displays; an order needs a passed bot check, every required consent and, for a teen, the acknowledgement that the guardian's consent is brought on paper; a checkout sent again, as after an answer that never arrived, places no second order: the buyer is answered with the order it placed ([0102](adr/0102-place-one-order-for-a-checkout-however-often-it-is-sent.md))                                                                         |
| The total                     | an order is placed at the total the buyer saw or not at all: a different one is shown and confirmed first; a tier or a sale window that ended less than 30 minutes before still holds for a buyer whose total rests on it; the lines of one order come to at most 21 474 836.47 PLN before a discount code, and a cart above that is neither priced nor placed, in the shop or as a manual order ([0100](adr/0100-refuse-a-cart-whose-lines-come-to-more-than-an-order-keeps.md))         |
| The consents accepted         | an order attests each consent as its buyer saw it, with the version of the document shown beside it: a consent whose document changed since places no order until the buyer reads the version in force and accepts the consent again ([0094](adr/0094-attest-in-an-order-each-consent-exactly-as-its-buyer-saw-it.md))                                                                                                                                                                    |
| The hold                      | a placed order awaits payment and holds its stock and capacity for 30 minutes; a payment attempt starts only within the hold, and a payment made counts whenever its confirmation comes; the provider is asked once more about each payment attempt of an expired order that nobody confirmed, an hour after the end of the hold, so a payment whose confirmation was lost is still found ([0104](adr/0104-ask-the-provider-once-more-about-each-payment-attempt-of-an-expired-order.md)) |
| Paying                        | an order is paid only when its payment provider confirms the payment to OPOS; the buyer's return to the shop is never proof of it; an order with nothing to pay is paid at once                                                                                                                                                                                                                                                                                                           |
| A payment that does not match | another amount than the total never pays the order: it needs review by an org; a payment an order no longer needs is refused where the provider can, and the buyer is told where the money is ([0081](adr/0081-take-ticket-payments-into-the-conventions-account-and-review-one-that-does-not-match.md))                                                                                                                                                                                  |
| A paid order                  | has one QR code, sent with its confirmation, and an order link that opens it without a sign-in; a visitor's order under the confirmed email of an account becomes that account's                                                                                                                                                                                                                                                                                                          |
| Naming the ticket holder      | a name or nickname is the buyer's to give or leave out: an order is its buyer's by its email address, and one with no name is sold and scanned like any other ([0076](adr/0076-let-a-buyer-leave-the-ticket-holders-name-out.md))                                                                                                                                                                                                                                                         |
| The order's data              | the ticket holder's name, age band, answers and consents, each consent with the exact document version and the time, are the convention's: kept with the order, never on the account                                                                                                                                                                                                                                                                                                      |
| What an order keeps           | its prices, whatever the catalog does later; what it names is hidden and never deleted, and a capacity or a stock is never set below what orders hold                                                                                                                                                                                                                                                                                                                                     |
| Emails                        | a fixed text with the convention's name, in the recipient's language or the convention's for an address with no account, listed on the order and sent again after a failed send; what a sent one said is kept, without its QR code and its order link                                                                                                                                                                                                                                     |
| Limits                        | three orders awaiting payment a buyer in an edition: an account counts the orders on it, a visitor those under the email address that are on no account ([0099](adr/0099-count-an-accounts-unpaid-orders-apart-from-a-visitors-under-its-email.md)); the result page of an order opens for 24 hours, in the browser that placed it                                                                                                                                                        |

**Discount codes.** An org with tickets write access to an edition sets its discount codes, and
with read access sees each code's uses against its limit
([0061](adr/0061-lower-a-price-with-a-discount-code-and-give-free-entry-with-one-of-100-percent.md)).

| Rule        | Value                                                                                                                                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A code      | belongs to one edition: 4 to 40 letters, digits and hyphens, unique in it and read without regard to case, with a percent or an amount, a usage limit or none, and a validity window                                                                                                       |
| Applies to  | the ticket types, add-ons and merchandise items the org names; never a ticket type excluded from discounts, whatever the org named                                                                                                                                                         |
| In checkout | an order takes one code, entered at the Summary; it lowers the lines it applies to together, as one line of its own: a percent of their sum, rounded to the grosz half up, or an amount, at most their sum                                                                                 |
| A refusal   | a code that is unknown, outside its window, ended, used up or applies to nothing in the cart is refused alike: the buyer is told only that it cannot be used for the order ([0062](adr/0062-keep-a-discount-codes-terms-in-the-api-and-refuse-every-unusable-code-alike.md))               |
| A use       | is held, released and taken again with its order's stock: it counts against the limit while the order holds. A code used up after the buyer entered it places no order; a payment after the hold whose use is gone needs review, until an org raises the limit or declines it              |
| Free entry  | a 100% code for a ticket type: its holder checks out as any buyer, pays for merchandise at its price and gets a QR code; an order with nothing left to pay is paid at once. A person paid for outside the shop who should hold a QR code ahead of the edition gets one, not a manual order |
| Ending      | an org ends a code and lets it run again; a code an order used is never deleted and stays on its orders, and a limit is never set below the uses orders hold                                                                                                                               |

**Buyer self-service.** What a buyer does once the order is placed, without writing to the
convention.

| Rule                | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The order link      | opens one order without a sign-in: its lines, its status, its QR code while it is paid and the edition's pick-up information. Its page changes nothing and tells nothing of the buyer or the ticket holder ([0063](adr/0063-open-an-order-link-by-a-token-after-the-hash-found-across-tenants.md))                                                                                                                                                                                                                                                                                                                                                                                                     |
| Its validity        | until 30 days after its edition ends, and for a link sent later than that 30 days from its sending; a changed email of the order ends every link sent before                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| An expired link     | shows nothing of the order and offers a fresh link to the order's email, sent at most once an hour for an order; the answer is the same whether a link was sent or not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| An account's orders | a signed-in account sees, on a convention's page, its own orders in that convention, the newest first, and acts on no other                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| A paid order        | offers "Resend QR code", which sends its confirmation again to the order's email, and "Buy more". An order an org moved to another email stays among the account's orders and offers neither ([0101](adr/0101-send-nothing-of-an-order-to-the-address-it-left-or-at-its-old-accounts-asking.md))                                                                                                                                                                                                                                                                                                                                                                                                       |
| An unpaid order     | within its hold offers "Pay now", which starts a new payment attempt without changing the order; after the hold nothing starts, and the buyer begins a new checkout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Buy more            | a checkout for the same edition and ticket holder that sells no ticket: the add-ons and the merchandise of the order's ticket type, or the merchandise alone. An add-on already bought is not bought again; merchandise is. A discount code lowers it as it lowers a first order ([0098](adr/0098-price-a-buy-more-cart-with-its-discount-code-in-the-accounts-own-quote.md)). Once paid it joins the first order's QR code, each order on a shared code is canceled on its own, and the code is refused once all of them are. An order an org moved to another email is added to no longer. A visitor has none ([0064](adr/0064-add-to-a-paid-order-with-an-order-of-its-own-on-the-same-qr-code.md)) |
| Pick-up information | an edition says where and when merchandise is handed over; an org with tickets write access sets it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**Order management.** An org with the tickets permission of an edition works on its orders in the
panel: reading them needs read access, every change write access.

| Rule               | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finding            | orders are searched by number, name, email or QR code and filtered by status, by what they hold and by date; those that need review come first, and the edition shows how many there are                                                                                                                                                                                                                                                                                                                                                                                                  |
| Corrections        | made on a paid order: the ticket holder's name, which changes nothing else; the order's email, which gives it a new QR code and order link and ends the old ones, the only way a ticket passes to another person; a merchandise line's variant, for another of the same item while that one has stock. Each tells the buyer what changed. The address an order left is told that the order moved, and nothing of the order after that: an email still waiting to go there is not sent ([0101](adr/0101-send-nothing-of-an-order-to-the-address-it-left-or-at-its-old-accounts-asking.md)) |
| Manual orders      | a sale outside the shop is recorded at the prices in force, a complimentary one at zero, also while the shop is closed; it takes stock and capacity like any order, is handed over as it is recorded, and has no email, no QR code and no account ([0055](adr/0055-record-a-sale-made-outside-the-shop-as-a-manual-order.md))                                                                                                                                                                                                                                                             |
| Canceling          | a paid order is canceled whole, with a reason: what it held returns, its QR code is refused, and its buyer is told. OPOS returns no money: that is between the convention and the buyer ([0056](adr/0056-cancel-and-decline-an-order-without-returning-money.md))                                                                                                                                                                                                                                                                                                                         |
| Settling a review  | an order that needs review is marked paid, at the total it was placed at, or declined with a reason; one that holds nothing takes again what it held, and is refused while that is gone                                                                                                                                                                                                                                                                                                                                                                                                   |
| Handing out        | on an order's page an org marks a line of a paid order as handed out, or takes a mark back, for a buyer whose QR code cannot be read                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Emails             | every email of the edition's orders is in one list, searched by the address it went to or by its order's number; an org reads what one said as it went out, in the convention's language, without the QR code and the order link, which only its recipient sees, and with no word of an account ([0068](adr/0068-keep-what-a-sent-email-of-an-order-said-without-what-hands-the-order-over.md))                                                                                                                                                                                           |
| Production numbers | once the pre-order deadline has passed: the count of every variant, what paid orders hold apart from what awaits payment and needs review, as a file too                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**The pre-edition reminder.** A few days before the edition every buyer gets one email with what
they need at the gate.

| Rule       | Value                                                                                                                                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| When       | an org with tickets write access sets how many days before the edition's first day it goes out, at 9:00 in the convention's time zone; with no number set, none is sent                                                            |
| Who        | once to the email of every QR code of the edition that an order not canceled still holds: orders sharing a code get one. A manual order, which has no email, gets none, and neither does an order paid after the reminder went out |
| What       | the QR code, the edition's opening hours as an org wrote them and its pick-up information; for a child or a teen as the ticket holder, the guardian rules and the address of the consent form                                      |
| Once       | a reminder is sent once an edition: changing the number of days after it went out sends nothing again                                                                                                                              |
| Suspension | a suspended convention sends none, and a reminder missed on its day is not sent late                                                                                                                                               |

**Sales reports.** An org with tickets read access to an edition sees how it sells, as it sells,
and takes away the lists the convention works from.

| Rule          | Value                                                                                                                                                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The dashboard | the revenue, the tickets of each ticket type, the merchandise of each variant, the count of each add-on, headcount-only ones among them, the ticket holders in each age band and the answers to each custom field with how many orders gave each; it shows the orders as they are when it is opened |
| What counts   | sold is what "Paid" and "Paid - manual" orders hold; what orders awaiting payment and needing review hold is shown apart; an expired, declined or canceled order counts nowhere                                                                                                                     |
| Revenue       | the totals of the "Paid" orders, and apart from them of the "Paid - manual" ones, whose money did not go through the provider                                                                                                                                                                       |
| Over time     | the revenue and the tickets of the sold orders, summed day by day up to today and drawn as charts; an order counts on the day it was paid, in the convention's time zone                                                                                                                            |
| The lists     | three files a spreadsheet opens: the ticket holders, a row an order with a ticket; the merchandise pick list, a row a merchandise line of a paid order with whether it was handed out; the payments, a row a payment attempt with where the money is and what the provider's module keeps of it     |
| In a file     | a date is in the convention's time zone, an amount is a number with its currency beside it, and a text somebody typed never runs as a formula                                                                                                                                                       |

**The scanner.** At the gate and at the desk a phone with no account signed in reads a buyer's QR
code, for one edition
([pairing and refusals](adr/0096-pair-the-phone-that-opens-a-pairing-link-and-forget-a-scanner-only-on-a-lasting-refusal.md),
[when access ends](adr/0097-read-a-scanners-end-from-its-editions-last-day-at-every-check.md)).

| Rule             | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enabling         | an org with tickets write access names a scanner and is shown a pairing code once; the phone that opens it within 15 minutes becomes the scanner, in place of any scanner it was, and a code that is refused leaves the phone as it was. Up to 20 are enabled an edition, each under a name of its own                                                                                                                                                                                            |
| A scanner's page | each scanner has a page of its own: what it handed out, with the orders it marked last, and a new pairing code, shown once, which takes the scanner from the phone that held it; a revoked, ended or stopped scanner gets none, and an org gives none to a scanner that works longer than its own access                                                                                                                                                                                          |
| Access           | ends a day after the edition's last day unless the org sets less, never later than the access of the org who enabled it, and at once when any org with tickets write access revokes it. The last day is the one the edition has at the moment: a scanner whose org set no end follows the edition when its dates change, and an end the org set stays, never past a day after the last day                                                                                                        |
| Stopped          | while the org who enabled it is in the team but cannot write the edition's tickets, by an access that has ended or a lowered permission, the scanner reads and marks nothing; its phone stays the scanner, says why and offers to try again, and the scanner works again once the org can. The panel shows it as stopped, with the reason. A scanner whose org left the team stays stopped for good, and its phone forgets it, as it forgets a scanner revoked, ended or given a new pairing code |
| A scan           | shows the ticket holder, the ticket type with its perks, the add-ons and the merchandise, and what was already handed out; for a child it says a guardian must be present, for a teen that the guardian's consent is brought on paper                                                                                                                                                                                                                                                             |
| "Not valid"      | a code of a canceled order, a replaced one, one of another edition and an unknown one, each with its reason; a code shared by several orders shows those not canceled                                                                                                                                                                                                                                                                                                                             |
| Handing out      | the org marks entry or items on the scanner; a scan marks nothing by itself, and a line is marked once, with the time and the scanner. A mark made by mistake is taken back in the panel                                                                                                                                                                                                                                                                                                          |
| What it reads    | QR codes alone: a scanner searches no order by a name, an email or a number, and works online alone                                                                                                                                                                                                                                                                                                                                                                                               |

---

## 8. Design and public image

OPOS's public image matters as much as its features.

- **No AI-generated graphics**: images, logos and icons come from a designer or a licensed icon set.
- **No template look**: screens follow the designer's designs, not a component library's defaults.
- **Honest placeholders**: until a design exists, the component library with a published tweakcn
  theme, its text kept readable, and real copy
  ([0090](adr/0090-build-the-frontends-from-shadcn-ui-with-tweakcns-amber-minimal-theme-until-a-design-exists.md)).
- **Every screen names itself** in the browser tab: the screen, then its edition or convention.
- **The shop is for everyone**: its pages and the buyer's pages meet WCAG 2.1 AA, and the whole
  checkout works on a screen 360 px wide
  ([0084](adr/0084-meet-wcag-2-1-aa-on-the-shops-and-the-buyers-pages.md)).
- **Light and dark**: every screen offers a toggle between a light and a dark theme. A signed-in
  account keeps its choice on the account, on every device; a visitor's stays in the browser. With
  no choice, the interface follows the system's theme.

---

## 9. Languages, markets and time zones

The MVP speaks **Polish**, the default, and **English**; a missing Polish text falls back to
English. **The interface is in Polish until a language is chosen**, whatever the browser asks
for: a signed-in account keeps its choice on the account, on every device, and a visitor's stays in
the browser; every screen offers the choice
([0092](adr/0092-show-polish-until-a-language-is-chosen.md)). An email is in the recipient's
language, or for an address with no account, the inviting convention's.

**One convention, one content language and one time zone**: programme items are written in its
language, and their hours always show in its zone, so "Saturday 14:00" means the same in Prague
and in Poznań.

---

## 10. Personal data and privacy

OPOS stores an attendee's name, email address and activity, and what the account put on its profile;
payment details stay with the payment provider. With an order it stores what the convention needs of
its ticket holder: a name or nickname when the buyer gives one, an age band, the answers to the
edition's custom fields, the consents accepted and the buyer's email address. Of a payment it keeps
the amount, the time and the provider's number of the transaction, and nothing of a card or a bank
account. Of an email of an order it keeps what the email said as it went out, for as long as the
order, without the QR code and the order link.

**Account deletion is self-service**, after a fresh sign-in, and takes likes, reviews, memberships
and registrations with it, and the profile, its avatar and the reports of it. Orders stay as the convention's sales records; a last head hands the
role over first.

**Orders are kept for at least five years** from the end of their edition, as the convention's
sales records. Nothing purges them, so an edition that has an order is not deleted, and neither is
its convention ([0082](adr/0082-keep-orders-for-at-least-five-years-from-the-end-of-their-edition.md)).

**Creating an account accepts the platform's terms**: registration says so and links them beside
the privacy policy, and no box is ticked. They say what a name and a profile may not hold, how a
profile is reported and taken down, and how a decision is contested. **An account is for a person
of 16 or older**; nothing asks for an age and none is kept, and a younger attendee needs no
account, since a ticket names its holder whoever ordered it
([0072](adr/0072-ship-the-platforms-terms-and-accept-them-by-creating-an-account.md)).

A password is set only after the email address is confirmed. A link from an email acts only when
the button on its page is pressed. An email address leads to an account only once confirmed.

**Two-factor authentication is each account's own choice**, required of one role alone: an admin,
whose role holds only with the second factor it was granted with
([0030](adr/0030-guard-admin-access-with-its-own-role-application-and-second-factor.md)). Once on,
it guards every sign-in, password reset and account deletion. Ten one-time recovery codes, shown
once and stored hashed, replace a lost device and turn it off; turning it off signs out the other
sessions, removes the unused codes and sends an email, and the hash of a used code stays until the
account is deleted. A person who has lost both device and codes asks the admin, who resets it; an
admin who lost both has the role taken away first.

**Every action of an admin is logged**: who, what, on which convention or account, and when. The
log holds identifiers and a convention's address, never an email address; no admin can change or
remove an entry, and an entry outlives the convention and the accounts it names
([0030](adr/0030-guard-admin-access-with-its-own-role-application-and-second-factor.md)).

Supabase hosts the database and sign-in in the EU on our behalf. Production data never leaves
production: Dev holds demo data and the team's own accounts. Backups are encrypted; our own copies
are kept up to three months. **Uploaded files stay in the EU behind OPOS**, in an encrypted bucket of
each environment that no browser reaches
([0041](adr/0041-keep-uploaded-files-in-an-s3-bucket-behind-the-api.md)): only inert types, a PDF
or a picture, each checked against its content. A picture is kept without what a camera wrote into
it, no place, time, device or copyright field
([0042](adr/0042-keep-a-cleaned-master-of-an-image-and-make-its-variants-in-imgproxy.md)). A file
goes with what it was uploaded for, with its edition, its convention or its account; a removed one
can be recovered by the operators for three months, as a backup can. Emails reach the mail provider only over an encrypted connection.
There are no tracking or advertising cookies; the sign-in cookie is
strictly necessary. **A tracker runs only with the visitor's consent**: analytics, advertising or any
other tool the portal does not strictly need, allowed or refused per category in the consent banner
and withdrawn as easily from the footer; with no tracker, no banner shows. The panel, which shows
attendees' data, and the admin application run none
([0026](adr/0026-run-a-tracker-only-with-consent-and-none-in-the-panel.md)). **The privacy policy
and the platform's terms ship with the MVP**, after a legal review, in every
interface language.

---

## 11. MVP scope vs beyond MVP

**In the MVP:**

- The core: accounts, conventions, editions, two-level permissions with expiry, data isolation
- The admin application: conventions with their first heads, their addresses, suspension and
  deletion ([0029](adr/0029-ship-four-web-applications.md)); organizer invitations by email
- Polish and English; language and time zone per convention
- Sign-in by email or Google, confirmation and reset by email, two-factor authentication
- The list of every convention's published editions on the portal's home page; an edition's page
  with its venue and the convention's logo
- The programme with speakers on the edition's programme page, likes, personal schedule, reviews
- Tickets and merchandise ([0085](adr/0085-sell-merchandise-in-the-mvp.md)) sold to the
  convention's own account and checked at the venue; discount
  codes, down to free entry; sales made outside the shop recorded as manual orders; attendee
  registrations
- The public profile: a public name with a nickname, an avatar, a profile an account publishes,
  its reports and its takedown by the admin
- Account deletion; a privacy policy and the platform's terms linked from registration
- File uploads, as far as a feature's spec asks for them
- A portal for phone browsers; the designer's interface, with no AI-generated graphics
- Demo data; hosting and Supabase in the EU, with backups and a Dev environment

**Beyond the MVP:**

- Modules: CMS with the website on `<convention>.opos.land` and custom domains, booths, friends
- Domain ownership verification with self-service
- Tickets issued ahead with no order, passes, shipping of merchandise, refunds from the panel,
  sales embedded on a convention's website, offline scanning
- Fees for commercial exhibitors; an OPOS shop
- Push notifications; professional email templates
- Localized portal paths; content translations with a language switcher on the public website
- Czech, Slovak, German; other currencies, payment methods and providers; more sign-in providers
- Our own address during Google sign-in; changing an email address, confirmed by both addresses
- Searching and filtering the list of editions, rooms, block schedule
- A speaker's programme items on its profile, an avatar beside a speaker in the programme, an
  address the account chooses for its profile, searching the profiles
- Custom roles, an audit log of team changes
- The remaining GDPR obligations: record of processing, data export, log retention
