# Public profile

- Status: Draft
- Domain owner: the domain owner of profile ([CONTRIBUTORS.md](../../CONTRIBUTORS.md))
- Decisions: [0071](../adr/0071-let-anyone-read-the-profile-an-account-published.md)

## Goal

An account shows who it is. It gets a public name with a nickname, an avatar, and a profile it may
publish: a page of its own in the portal that anyone reads, and that a speaker's name in the
programme leads to. Whoever finds a profile that should not be there reports it, and an admin takes
it down under the platform's terms, which arrive with it. It serves steps 8 and 9 of the MVP flow
([PRODUCT.md 2](../PRODUCT.md#2-mvp-goal-and-end-to-end-flow)): the visitor who registered has an
account to fill in, and the programme leads from a programme item to who its speaker is.

It builds on [file storage](0012-file-storage.md) and [image variants](0013-image-variants.md),
which keep the avatar, and on [platform administration](0001-platform-administration.md), whose
application and log the takedown uses.

## Business rules

Every rule is the domain owner's. Where one follows from a document, a record, another spec or a
law, it names it.

### The public name

| #   | Rule                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | An account's name has three parts, each optional: a first name, a nickname and a last name. A nickname is up to 50 characters.                                                                                                |
| N2  | The account chooses the order of its name: the nickname between the first and the last name, which is the default, or after them.                                                                                             |
| N3  | The nickname stands in the quotation marks of the reader's language when another part stands beside it, and bare when it is the only part.                                                                                    |
| N4  | An account with no part of a name is shown as "Anon", in the reader's language.                                                                                                                                               |
| N5  | This is the account's public name: what stands wherever the account is named to everyone, on its profile and, for a speaker, in the programme. A speaker with no part of a name is shown as "Anon" and is no longer left out. |
| N6  | The panel and the admin application show an account by its first and last name and its email address as before, and a checkout fills the ticket holder's name in from the first and the last name as before.                  |
| N7  | No part of a name holds a control character or a character that turns the direction of the text.                                                                                                                              |

### The profile

| #   | Rule                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | An account has one profile. It holds a description, pronouns, a city or region, links and interests, and shows the account's avatar. Every one of them is optional.                                                                                                                                                                  |
| P2  | The description is plain text of up to 500 characters. Its line breaks are kept; nothing in it is formatted and no address in it becomes a link.                                                                                                                                                                                     |
| P3  | The pronouns are a text of up to 30 characters, and the city or region one of up to 80. N7 holds for them and for the description.                                                                                                                                                                                                   |
| P4  | A profile has up to three links, each an `https` address of up to 200 characters. A link is shown as its address and opens in a new tab. Nothing is fetched from it, no preview and no icon ([0026](../adr/0026-run-a-tracker-only-with-consent-and-none-in-the-panel.md)).                                                          |
| P5  | The interests are chosen from the platform's list, the same for everyone: tabletop role-playing games, LARP, board games, card games, miniature wargames, video games, literature, comics, manga and anime, film and television, cosplay, crafts. None of them tells anything of a person's health, beliefs, origin or private life. |
| P6  | A profile holds no email address, no age and no year of birth, and nothing of what the account did: no convention it attended, no like, no review and no order.                                                                                                                                                                      |
| P7  | A profile is private until its account publishes it. The account withdraws it at any time, and a withdrawn profile keeps what it holds. A profile that holds nothing can be published.                                                                                                                                               |
| P8  | A published profile has a page of its own in the portal, which anyone reads, with no sign-in. Its address holds a random identifier that never changes and is not the account's ([0071](../adr/0071-let-anyone-read-the-profile-an-account-published.md)).                                                                           |
| P9  | A profile that is withdrawn, one that is taken down and one that never was answer alike: as not found.                                                                                                                                                                                                                               |
| P10 | The page shows the public name, the avatar and what the profile holds, and asks search engines not to list it.                                                                                                                                                                                                                       |
| P11 | In the programme, a speaker's name leads to the speaker's profile while it is published.                                                                                                                                                                                                                                             |
| P12 | What an account writes is shown as it was written, in whatever language. Nothing translates it.                                                                                                                                                                                                                                      |
| P13 | Deleting the account takes its profile, its avatar and the reports of its profile ([PRODUCT.md 10](../PRODUCT.md#10-personal-data-and-privacy)).                                                                                                                                                                                     |

### The avatar

| #   | Rule                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | An account has at most one avatar, an image. Only the account itself uploads, replaces and removes it.                                                                                                    |
| A2  | An avatar is public from its upload, whether or not the profile is published: anyone who has its address reads it. The form that takes it says so.                                                        |
| A3  | It is shown as a square, cut from the middle of the picture ([image variants](0013-image-variants.md), V6).                                                                                               |
| A4  | A replaced or removed avatar is gone: its address answers as not found.                                                                                                                                   |
| A5  | An account with no avatar is shown by the initials of its public name. No picture stands in for it ([PRODUCT.md 8](../PRODUCT.md#8-design-and-public-image)).                                             |
| A6  | The avatar is shown on the profile's page, on the account's own pages and to the admin. The programme shows none.                                                                                         |
| A7  | An account uploads a picture it may show: of the person whose account it is, or one it holds the rights to. The form that takes it says so, and a picture of someone else is taken down through a report. |

### Reports

| #   | Rule                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | The page of a published profile offers to report it, to anyone, with no sign-in.                                                                                                                                                      |
| R2  | A report names one reason: someone else's picture or identity, offensive or unlawful content, spam or advertising, or another one. It may add a note of up to 1000 characters, and the email address of who sends it.                 |
| R3  | A report keeps the profile, the reason, the note, the time and, when one was given, the email address with the language of the page the report came from. It keeps nothing else of who sent it, and only the admin reads the address. |
| R4  | Reports are limited by the network address they come from. A profile holds at most 20 open reports: one sent beyond that is answered like any other and is not kept.                                                                  |
| R5  | No bot check stands before a report. The portal has none yet ([0052](../adr/0052-stand-in-for-the-bot-check-until-the-portal-has-one.md)), and a report moves no money and holds no stock.                                            |
| R6  | A report is open until an admin closes it or takes its profile down.                                                                                                                                                                  |
| R7  | Who gave an email address gets an email that the report arrived, and another that says what came of it: the profile taken down, or the report closed (Regulation (EU) 2022/2065, Article 16). Who gave none gets no answer.           |
| R8  | An email to who sent a report is a fixed text in the language of R3. It holds no word of the report, so a report cannot make OPOS write to a stranger in the sender's words.                                                          |
| R9  | A closed report is removed twelve months after it was closed, its email address with it.                                                                                                                                              |

### Taking down and restoring

| #   | Rule                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | The admin application lists the open reports, the newest first, and the closed ones when asked. A report leads to the profile it reports, and shows the email address of who sent it when one was given.                                                                                                                                                                                                                   |
| T2  | The admin sees a profile as it is now: the public name, the avatar, what the profile holds, its state and its reports. No history is kept: not what it held when it was reported, and not what changed since.                                                                                                                                                                                                              |
| T3  | An admin takes a profile down with a reason: someone else's picture or identity, offensive or unlawful content, or spam or advertising. Each is a rule of the platform's terms (M2), so "another one" is no reason for a takedown. The admin may add a sentence of up to 500 characters for the account.                                                                                                                   |
| T4  | A profile taken down is withdrawn at once and cannot be published. Its avatar is removed and its open reports are closed.                                                                                                                                                                                                                                                                                                  |
| T5  | The account gets an email in its language that says what was done, the reason and the rule of the terms it rests on, whether it followed a report, the admin's sentence, that an admin decided it and no program, and how to contest it: by asking for a review, or by writing to the contact address of the terms (Regulation (EU) 2022/2065, Article 17). The page where the account changes its profile shows the same. |
| T6  | An account whose profile is taken down keeps changing it, and may upload a new avatar. That avatar is shown nowhere to the public, since the profile has no page (A6).                                                                                                                                                                                                                                                     |
| T7  | The account asks for a review once it has put things right. The request stays until the profile is restored. The admin sends no refusal: a profile that is not restored stays taken down.                                                                                                                                                                                                                                  |
| T8  | The admin application lists the profiles taken down, those asking for a review first.                                                                                                                                                                                                                                                                                                                                      |
| T9  | An admin restores a profile: it can be published again, and its account publishes it. Nothing becomes public by the restoring alone. The account gets an email that says so.                                                                                                                                                                                                                                               |
| T10 | An admin clears the name of an account with a reason of T3: its three parts go, and the account is shown as "Anon". It blocks nothing: the account may give itself a name again. It needs no takedown. The account gets an email as T5 describes, whose way to contest is the contact address.                                                                                                                             |
| T11 | An admin changes nothing else of a profile: no text, no link and no interest.                                                                                                                                                                                                                                                                                                                                              |
| T12 | Closing a report, taking a profile down, restoring it and clearing a name each leave an entry in the log ([platform administration](0001-platform-administration.md), L1–L3). The reports a takedown closes leave none of their own.                                                                                                                                                                                       |
| T13 | Taking a profile down, closing a report and clearing a name ask first in a modal: no screen brings back the avatar, the open report or the name ([0023](../adr/0023-ask-in-a-modal-before-an-action-that-cannot-be-undone.md)). The modal of a takedown and of a cleared name takes its reason. Restoring asks nothing.                                                                                                    |
| T14 | An admin opens the page of any account by its email address, as for the reset of two-factor authentication ([platform administration](0001-platform-administration.md), C1). An account with no profile is reached that way, for its name. Looking an account up changes nothing and leaves no entry.                                                                                                                      |

### The platform's terms

| #   | Rule                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | The public profile ships with the platform's terms. They say what a name and a profile may not hold, that an admin takes a profile down and clears a name, how a profile is reported and how a decision is contested, and they name a contact address. |
| M2  | Each reason of T3 is a rule of the terms, and an email of T5 or T10 names that rule.                                                                                                                                                                   |
| M3  | An account is for a person of 16 or older, and the terms say so. Nothing asks for an age and none is kept (P6). A younger attendee needs no account: a ticket names its holder, whoever ordered it.                                                    |
| M4  | Registration says that creating an account accepts the terms and links them, beside the privacy policy. No box is ticked. The page where an account changes its profile links them where it publishes and where it uploads an avatar.                  |
| M5  | The terms have a page of their own in the portal, in every interface language. Like the privacy policy, their text ships after a legal review ([PRODUCT.md 10](../PRODUCT.md#10-personal-data-and-privacy)).                                           |
| M6  | The privacy page says what a profile holds, that a published profile, an avatar and the public name are read by anyone, and what a report keeps and for how long.                                                                                      |

### The glossary

The glossary gains five terms, each with one rendering in every interface language
([PRODUCT.md 3](../PRODUCT.md#3-glossary)):

| Term                 | Meaning                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------- |
| **profile**          | what an account shows of itself to everyone once it publishes it                        |
| **public name**      | an account's first name, nickname and last name in the order it chose; "Anon" with none |
| **avatar**           | an account's picture, public from its upload                                            |
| **profile report**   | a notice from anyone that a published profile should not be there                       |
| **platform's terms** | the rules of using OPOS that an account accepts when it is created                      |

## Shape

### Tables

The three new tables are platform level, outside RLS, as `accounts` is.

| Table              | Holds                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `accounts`         | gains `nickname`, empty when not set, and `name_order`, the order of N2                                                                                                                                                                                                                                                                                                                          |
| `account_profiles` | a row an account from the first time it changes its profile or uploads an avatar, going with its account: `account_id`, the primary key; `public_id`, random, given by the database and never changed; `published_at`; `taken_down_at` with `taken_down_reason`, `taken_down_note` and `taken_down_after_report`; `review_requested_at`; `description`, `pronouns`, `city`, `links`, `interests` |
| `account_avatars`  | a row an account while it has an avatar, going with its profile: `account_id`, `file_id`. A replaced avatar is a new row: the row is added and removed, never changed                                                                                                                                                                                                                            |
| `profile_reports`  | `id`, `account_id`, going with its profile, `reason`, `note`, `email` and `locale`, both empty when no address was given, `created_at`, `closed_at`                                                                                                                                                                                                                                              |

The database refuses a row of `account_profiles` that is published and taken down at once.

`admin_actions.action` gains `profile-report.close`, `profile.take-down`, `profile.restore` and
`account.clear-name`, each with the account as its subject.

### Database roles

| Role              | On                 | May                                                                                                                                            |
| ----------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `opos_app`        | `accounts`         | update `nickname` and `name_order` too                                                                                                         |
| `opos_app`        | `account_profiles` | read; insert and update what the profile holds, `published_at` and `review_requested_at`; never `public_id` or what a takedown sets; no delete |
| `opos_app`        | `account_avatars`  | read, insert, delete                                                                                                                           |
| `opos_app`        | `profile_reports`  | insert; read which profile a report is of and when it was closed, for the limit of R4 and the job of R9, and nothing a report says; delete     |
| `opos_app_global` | `accounts`         | read the identifier, the three parts of the name and their order; never the email address                                                      |
| `opos_app_global` | `account_profiles` | read what a published profile's page shows, and whether it is published                                                                        |
| `opos_app_global` | `account_avatars`  | read                                                                                                                                           |
| `opos_admin`      | `accounts`         | read `nickname` and `name_order` too; update the three parts of the name                                                                       |
| `opos_admin`      | `account_profiles` | read; update `published_at`, what a takedown sets and `review_requested_at`                                                                    |
| `opos_admin`      | `account_avatars`  | read, delete                                                                                                                                   |
| `opos_admin`      | `profile_reports`  | read; update `closed_at`                                                                                                                       |

### Files

This spec declares one kind of file to [file storage](0012-file-storage.md): `profile-avatar`. It
is an account's, a JPEG, PNG or WebP of up to 5 MB, and `account_avatars.file_id` points at it. It
is for everyone. It is kept under a fixed label, not the name it was uploaded under, so that name
reaches no reader.

| Variant | Box       | Fit   | Made              | Shown on                                                                                               |
| ------- | --------- | ----- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| `large` | 320 × 320 | cover | with the upload   | the profile's page, the page where the account changes its profile, a profile in the admin application |
| `small` | 96 × 96   | cover | by its first read | the account's page, the lists of the admin application                                                 |

### Routes

Account routes, behind a session:

| Route                             | Does                                                                                                                                                                    | Refuses with                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `PATCH /me`                       | as before, and takes the nickname and the order of the name                                                                                                             |                                                                                    |
| `GET /me/profile`                 | the account's profile and its state: published or not, taken down or not with what T5 says, a review asked for or not. An account with no profile yet gets an empty one |                                                                                    |
| `PUT /me/profile`                 | sets what the profile holds                                                                                                                                             |                                                                                    |
| `PUT /me/profile/avatar`          | takes a file and makes it the avatar                                                                                                                                    | `file.type-refused`, `file.too-large`, `file.limit-reached`, `storage.unavailable` |
| `DELETE /me/profile/avatar`       | removes the avatar                                                                                                                                                      |                                                                                    |
| `POST /me/profile/publication`    | publishes the profile                                                                                                                                                   | `profile.taken-down`                                                               |
| `DELETE /me/profile/publication`  | withdraws it                                                                                                                                                            |                                                                                    |
| `POST /me/profile/review-request` | asks for a review                                                                                                                                                       | `profile.not-taken-down`                                                           |

Public routes, without sign-in:

| Route                                         | Does                                                                                                                                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /public/profiles/{profileId}`            | a published profile: the parts of the public name and their order, the avatar and what the profile holds. Any other answers `request.not-found`                                                            |
| `POST /public/profiles/{profileId}/reports`   | keeps a report of a published profile, sends the email of R7 to the address it gave, and answers nothing. A profile that is not published answers `request.not-found`; nothing is kept and nothing is sent |
| `GET /public/avatar-files/{fileId}/{variant}` | a variant of an account's avatar. A file that is no account's avatar now and an undeclared variant answer as not found                                                                                     |
| the programme items of a published edition    | a speaker is the parts of its public name, their order, and the identifier of its profile while that is published                                                                                          |

An avatar travels in an answer as its file's identifier. Reports share a rate limit per client
address.

Admin routes, each needing the admin:

| Route                                          | Does                                                                        | Refuses with        |
| ---------------------------------------------- | --------------------------------------------------------------------------- | ------------------- |
| `GET /admin/profile-reports`                   | a page of the open reports, or of the closed ones, the newest first         |                     |
| `GET /admin/profile-reports/{reportId}`        | a report and the account of its profile                                     | `request.not-found` |
| `POST /admin/profile-reports/{reportId}/close` | closes it and sends the email of R7                                         | `request.not-found` |
| `GET /admin/profiles`                          | a page of the profiles taken down, those asking for a review first          |                     |
| `POST /admin/accounts/find`                    | the identifier of the account an email address names (T14)                  | `account.not-found` |
| `GET /admin/profiles/{accountId}`              | T2, for any account: one with no profile shows an empty one                 | `request.not-found` |
| `POST /admin/profiles/{accountId}/take-down`   | T3–T5, with the reason and the sentence; answers whether the email was sent | `request.not-found` |
| `POST /admin/profiles/{accountId}/restore`     | T9; answers whether the email was sent                                      | `request.not-found` |
| `POST /admin/accounts/{accountId}/clear-name`  | T10, with the reason; answers whether the email was sent                    | `request.not-found` |

Taking down a profile that is taken down, restoring one that is not, closing a closed report and
clearing a name that has no part change nothing, leave no entry and send no email.

A job of the API removes the closed reports of R9, once a day.

### Emails

Each is a fixed text with no word a visitor or another account wrote, but for the admin's sentence
of T3 in the third.

| Email                | To                        | Says                                                                                      |
| -------------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| a report arrived     | the address a report gave | that the report was received (R7)                                                         |
| a report's outcome   | the address a report gave | that the profile was taken down, or that the report was closed and the profile stays (R7) |
| a profile taken down | the account               | T5                                                                                        |
| a profile restored   | the account               | that it may be published again (T9)                                                       |
| a name cleared       | the account               | T10                                                                                       |

### Screens

The portal, each built for 360 px first:

| Screen                          | At                           | Holds                                                                                                                                                                                       |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| registration                    | `/register`                  | the sentence and the link of M4                                                                                                                                                             |
| the platform's terms            | `/terms`                     | M1–M3                                                                                                                                                                                       |
| the account                     | `/account`                   | the name gains the nickname and its order, with the public name as it will be shown; a section with the avatar, the profile's state and the way to it                                       |
| the profile, changed            | `/account/profile`           | the avatar with A2 and A7 said beside it, what the profile holds, publishing and withdrawing, the link to the published page and to the terms; while taken down, T5 and asking for a review |
| a profile                       | `/profiles/<profile>`        | P10, and the way to report it                                                                                                                                                               |
| reporting a profile             | `/profiles/<profile>/report` | the reason, the note and the email address of R2, with what R3 and R7 do with the address                                                                                                   |
| the programme, a programme item | as before                    | a speaker by its public name, leading to its profile (P11)                                                                                                                                  |
| the privacy page                | `/privacy`                   | M6                                                                                                                                                                                          |

The admin application:

| Screen              | Holds                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| profile reports     | the table of T1                                                                                      |
| a report            | its reason, note, time and email address, the profile it reports, closing it                         |
| profiles taken down | the table of T8, and finding an account by its email address (T14)                                   |
| a profile           | T2; taking down with the reason and the sentence of T3; restoring; clearing the name with its reason |
| log                 | the four new entries by name                                                                         |

### Seed

Demo accounts with a nickname in each order; a published profile with every field set and an
avatar the seed draws as it draws its other pictures; a profile never published; one taken down
that asks for a review; one open report with an email address and one without.

## Tenant isolation and permissions

- `account_profiles`, `account_avatars` and `profile_reports` are global tables, as `accounts` is:
  no `tenant_id`, no RLS, limited by privileges
  ([ARCHITECTURE.md, Tenant isolation](../ARCHITECTURE.md#tenant-isolation)).
- A published profile is read outside every tenant, by `opos_app_global`, bound by the account's
  own publication ([0071](../adr/0071-let-anyone-read-the-profile-an-account-published.md)). It
  joins the table of ARCHITECTURE.md and its columns join `globalReads`. What it answers is fixed
  by its schema in the contract: a field added there is public at once, for every account that
  published its profile.
- An avatar is read by the identifier of its file: the read answers the picture and nothing of the
  account, and a file `account_avatars` does not point at is not found before the bucket is asked.
- A report is kept by one statement that finds a published profile by its public identifier. The
  route answers the same whatever it found.
- The email address a report gave is read by `opos_admin` alone. The API sends the first email of
  R7 from the request itself and reads the address back on no route of the portal.
- The account's identifier leaves the API on no public route: a profile is named by its public
  identifier, an avatar by its file's.
- The account's own routes reach the profile of the session's account alone. An account cannot
  publish a profile taken down, set what a takedown sets or delete its profile's row, so it cannot
  end a takedown by itself.
- The programme's read of its speakers stays in the tenant transaction, through
  `program_item_speakers`; it gains the nickname, the order and the published profile's
  identifier.
- The admin routes run behind `@RequireAdmin` on `opos_admin`, with a sign-in younger than 30
  minutes ([platform administration](0001-platform-administration.md), A7). The admin finds an
  account by its email address there alone, and the lookup answers the account's identifier and
  nothing else. No admin route serves a file ([file storage](0012-file-storage.md)): the admin
  application shows an avatar from its public address.

## Tests

Integration, in `packages/db/test`:

- The privileges of each role on the new columns and tables, each broken once for `verify`:
  `opos_app` sets no `public_id`, nothing a takedown sets and deletes no profile; it reads nothing
  a report says, its email address included; `opos_app_global` reads no email address.
- A row published and taken down at once is refused; an avatar of another account's file is
  refused; a second avatar of one account is refused.
- Deleting an account takes its profile, its avatar and the reports of its profile.
- The seed, run twice, changes no row count.

Integration, in `apps/api/test`:

- The public name: every combination of parts in both orders through `PATCH /me` and in the
  programme; a speaker with no part is listed; a speaker's profile is named only while published,
  and never by the account's identifier.
- The profile: each limit of P2–P5 and N7 refused; publishing, withdrawing and publishing again
  keep one public identifier; a withdrawn, a taken-down and an unknown profile answer alike on
  every public route.
- The avatar: a file of a type the kind does not take, one over the limit and one whose content is
  not what its type says are refused; it is read with the profile never published; a replaced or
  removed one, and one of a profile taken down, answer as not found at the old address; the name
  it was uploaded under is in no answer.
- Reports: kept for a published profile alone; the twenty-first open report of a profile is
  answered alike, not kept and sends nothing; the rate limit per address; with an email address,
  the email that it arrived goes out in the language of the report and holds no word of the note;
  without one, none goes; a report closed twelve months ago is removed by the job and a younger
  one stays.
- Every admin route against every actor; a takedown withdraws, removes the avatar, closes the open
  reports, keeps the reason and sends the email in the account's language with the rule of the
  terms and the ways to contest; "another one" is refused as a takedown's reason; who gave an
  address with a report gets the outcome, of a takedown and of a closing; publishing is refused
  while taken down; a review request is refused when not taken down; restoring publishes nothing;
  clearing a name shows "Anon" in the programme and sends its email; an account is found by its
  email address and an unknown address is refused; each action leaves its entry, and one that
  changes nothing leaves none.

e2e, each scenario on its own accounts and checking the BFF boundary; the first on a mobile
viewport too:

1. A visitor registers, with the terms linked beside the privacy policy; the account sets a
   nickname, fills its profile in, uploads an avatar and publishes; a visitor with no session reads
   the page; the account withdraws and the page is not found.
2. The programme shows a speaker by its public name, leads to the published profile, and shows a
   speaker with no name as "Anon".
3. A visitor reports a profile and gives an email address; an admin takes the profile down with a
   reason; the visitor gets both emails; the account reads the reason and the email, uploads a new
   avatar and asks for a review; the admin sees the request and the new avatar and restores; the
   account publishes again.
4. An admin finds an account by its email address and clears its name; the programme shows "Anon";
   the log holds an entry for each action.

## Out of scope

- A speaker's programme items on its profile, and an avatar beside a speaker in the programme.
- A name the account chooses for its profile's address.
- Friends, a list of an edition's attendees and searching the profiles
  ([PRODUCT.md 11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp)).
- A bot check before a report, until the portal has one.
- A check of an account's age: M3 is what the account declares by accepting the terms.
- A history of a profile's changes, and a copy of what a report was sent about.
- A refusal of a review request, and a complaint beyond asking for a review or writing to the
  contact address.
- Blocking an account, and an admin changing what a profile says.
- The nickname in the panel, in the admin application's lists and in a checkout.
- What a shared link shows of a profile's page.
- Who answers for the data, how to reach them and the legal ground of each purpose, on the privacy
  page: the privacy policy's own legal review, which also confirms what this spec took from the
  law.
