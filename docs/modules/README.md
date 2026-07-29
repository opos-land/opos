# Modules

OPOS is a core plus modules. The core — tenants, editions, accounts, roles, addresses, languages —
is described in [PRODUCT.md](../PRODUCT.md) and [PLAN.md](../PLAN.md). Everything a convention
actually does with the platform lives in a module, and every module is described end to end in one
file in this directory: product behaviour and implementation together.

## What a module is

> **A module owns exactly one edition-level permission resource, its own tables, its own endpoints
> and its own surface in the panel, the portal, the convention website or the mobile application.**

Anything without those four is not a module — it is a core feature or a part of another module.
The permission resource and the module carry the same identifier, so `program-schedule` names the
module, the permission and the `modules/program-schedule.md` document at once.

Some modules additionally use a tenant-level resource that already exists (`branding`, `shop`).
Those stay core: they describe the convention brand, not one edition's work.

**Every convention has every module.** There is no switch, nothing to enable and nothing to buy: a
module is how the product is divided up, not what a customer chooses from. A convention that does
not sell tickets simply never creates a ticket type.

## The modules

| Module | Does | Status | Document |
|---|---|---|---|
| `program-schedule` | building the edition's programme: items, rooms, times, publication | MVP | [program-schedule.md](program-schedule.md) |
| `program-submissions` | attendees propose programme items, organizers review them | planned | [program-submissions.md](program-submissions.md) |
| `volunteer-signups` | people apply to help, organizers build the volunteer pool | planned | [volunteer-signups.md](volunteer-signups.md) |
| `volunteer-shifts` | posts, shifts and assignments; the volunteer's own schedule | planned | [volunteer-shifts.md](volunteer-shifts.md) |
| `tickets` | ticket types, sale windows, orders, tickets | planned | [tickets.md](tickets.md) |
| `website` | the public convention website: branding, content, news | MVP | [website.md](website.md) |

`status` is a roadmap marker, not scope. What ships in the MVP is decided in
[PRODUCT.md chapter 11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp) — a module marked `MVP` may still
have parts that wait.

## How they depend on each other

| Module | Feeds | Reads |
|---|---|---|
| `program-submissions` | `program-schedule` — an accepted proposal becomes a programme item | — |
| `volunteer-signups` | `volunteer-shifts` — shifts are assigned to accepted volunteers | — |
| `website` | — | `program-schedule`, `tickets`, the open calls — for its pages and its menu |

Nothing here is a precondition: a convention can build a programme with no call open and run shifts
with a volunteer pool entered by hand. The arrows say where data flows, not what must exist first.

## Empty is the normal state

With no switch to turn a module off, what keeps an unused module out of sight is having nothing in
it. The rule is the same everywhere, and each module document states its own version of it:

- **Public surfaces follow content.** The convention website shows a programme page when the
  edition has published items, a tickets page when a type is on sale, a submission form when a call
  is open. Nothing to show means no page and no menu entry — never an empty page.
- **The panel follows permissions.** An organizer sees a module's section when their permission for
  it is at least `read`, whether or not anything has been created yet; that is where the first item
  gets created. A `head` sees every section, because a `head` bypasses every permission.
- **An empty module costs nothing.** No rows, no queries, no public pages.

## Shared pattern: submissions

`program-submissions` and `volunteer-signups` do the same thing to different content, in three
steps: the user keeps something in their own account, sends a copy of it to an edition, and
organizers decide. The mechanics are described here once; those two documents only add their own
fields and their own acceptance rules.

### The source belongs to the user

A programme card and a volunteer profile live under the **account**, outside every convention.
Nobody at any convention can see them until the user sends one. They carry no `tenantId`, stay
outside RLS and are reachable only through `/me` endpoints filtered by the account in the JWT
([PLAN.md 4.2](../PLAN.md#42-global-tables)).

The user writes a card once and offers it to as many conventions as they like, over as many years
as they like. That is the point of keeping it on their side.

### Sending takes a snapshot

Sending copies the source's content into the submission. From then on the two are independent:

- editing the source changes nothing that has already been sent;
- editing a submission changes nothing in the source;
- deleting the source leaves every submission it produced intact — `sourceId` simply empties;
- one source may go to many editions, but only once to the same edition while a submission from it
  is still live; `409 submission.already-sent` otherwise. Each module lists the statuses that count
  as live, and a submission that is not live no longer blocks a new one.

The snapshot is what organizers review, what they accept, and what the history in the next section
is built from.

### The window

Sending is possible only while that edition's call is open, and editing a sent submission only
while it is open **and** the submission is still `submitted`. A closed call answers `409
submission.call-closed`. Organizers keep deciding after the call closes; the user keeps the right
to withdraw.

A module decides whether its call has a window at all. With a window, the call opens and closes by
itself; without one it is open from the moment it is switched on until it is switched off. A module
may also leave a field editable after the window shuts, and says so in its own document.

Open calls across every convention are public, so the portal can show the user where their card can
go right now.

### Statuses

`submitted` -> `accepted` | `rejected`, and `withdrawn` from either side at any time. A module may
add its own status; it may not redefine these.

| Actor | Can |
|---|---|
| the submitter | send while the call is open; edit their own while `submitted` and the call is open; withdraw at any time; change their consent at any time |
| org, `read` | see who sent it, the list, the snapshots, the decisions and — with consent — the history |
| org, `write` | open and close the call, decide, and change a decision already made |

### Rules

- One account may send many submissions to one edition, from different sources.
- `reviewNote` is internal — it never leaves the panel and never reaches the submitter.
- A decision sends an email in the submitter's locale ([PLAN.md 6](../PLAN.md#6-localization)).
- Withdrawal by the submitter is not a decision: it clears nothing that organizers wrote.

### Shared columns

Every submission table carries `accountId`, `sourceId` (nullable), `status`, `sharesHistory`
(boolean, default `false`), `submittedAt`, `decidedAt` (nullable), `decidedBy` (nullable
`tenantMembershipId`) and `reviewNote` (nullable), plus the snapshot columns the module defines.

`accountId` is a foreign key to `accounts` with `on delete cascade`, and it is what tells organizers
who they are deciding about: the panel shows the submitter's first name, last name and email address
beside every submission, read live from the account rather than snapshotted. The snapshot covers
what was sent, not who sent it.

### Shared endpoints

`<module>` stands for the module identifier. The submitter-facing ones sit under `/me` and take
`{ tenantSlug, editionSlug }` in the body, exactly like `/me/attendances`.

| Method | Path | Who |
|---|---|---|
| GET | `/public/calls` | anyone — every published edition with an open call, filterable by module |
| GET | `/public/tenants/:slug/editions/:editionSlug/<module>/call` | anyone — whether this call is open, and its instructions |
| POST | `/me/<module>` | the submitter — `{ tenantSlug, editionSlug, sourceId, sharesHistory }` |
| GET | `/me/<module>` | the submitter — their own, across conventions |
| PATCH | `/me/<module>/:id` | the submitter — the snapshot and `sharesHistory` |
| DELETE | `/me/<module>/:id` | the submitter — withdrawal |
| GET | `/editions/:editionId/<module>` | org, `read` |
| GET | `/editions/:editionId/<module>/:id/history` | org, `read` — `403 submission.history-not-shared` without consent |
| PATCH | `/editions/:editionId/<module>/:id` | org, `write` — the decision |
| PUT | `/editions/:editionId/<module>/call` | org, `write` — the call configuration: whether it is open, its window where the module has one, and its instructions |

## Shared pattern: history across conventions

An organizer deciding on a submission wants to know whether this person has done it before. Both
submission modules answer that from the whole platform, and both answer it only when the person
said so.

**Consent is per submission and explicit.** `sharesHistory` starts `false`; the send form asks in
one sentence, covering both histories at once — what they have run and where they have
volunteered. The user may turn it on or off at any time afterwards, including years later, and the
panel stops showing the history the moment they do.

**What an organizer with consent sees**, for the submitting account, across every convention on the
platform:

| Section | Rows | Fields |
|---|---|---|
| ran programme | every `accepted` programme submission | convention name, edition name, edition dates, item title, format |
| volunteered | every `accepted` volunteer signup | convention name, edition name, edition dates, number of shifts worked |

**What never crosses**, consent or no consent:

- rejected, withdrawn and still undecided submissions — another convention's judgement is not
  anyone's business;
- unpublished editions;
- contact details, review notes, availability, the content of proposals sent elsewhere;
- anything at all when `sharesHistory` is `false`, in which case the panel says the submitter has
  not shared their history and offers nothing else.

**This is the platform's one exception to isolation between conventions**
([PRODUCT.md 10](../PRODUCT.md#10-personal-data-and-privacy)). It is not the conventions' data
crossing — it is the user's own, released by the user, about the user. Technically it is a
cross-tenant read through `GlobalDbService`, keyed by the submitter's `accountId` and listed
explicitly in the allowlist ([PLAN.md 4.6](../PLAN.md#46-tenant-isolation--rls-in-postgres)).

The history is a live query, not a snapshot: it shows what is true now, and it disappears when
consent does.

## How to write these documents

Every module document has the same seven sections, in this order, and nothing else.

| # | Section | Contains |
|---|---|---|
| 1 | What it does | whose problem it solves and how, plus one line on what part of it is in the MVP |
| 2 | Terms | new terms only, in a table |
| 3 | Flows | actor -> action -> effect, the main path |
| 4 | Permissions | what `read` allows and what `write` allows |
| 5 | Data | tables and columns belonging to this module |
| 6 | API | method, path, required permission |
| 7 | Out of scope | what it deliberately does not do, and where that lives instead |

Rules that keep this directory from turning into a pile:

1. **Sections 1-4 fit in about 120 lines together.** Sections 5-7 grow with the module, but only as
   tables. A document past roughly 400 lines becomes a directory:
   `program-schedule/README.md` holding sections 1-4 and the index, plus one file per part holding
   flows, data and API. The README never grows again.
2. **No rationale, no history, no alternatives.** The same rule as the rest of the repository:
   these documents describe the target state.
3. **A fact has one home.** Anything true of every module — error codes, pagination, RLS, the
   `tenantId` in every index, the submission pattern above — lives in the core or here, once. A
   module document assumes it and does not repeat it.
4. **Terms split by reach.** A term the whole product uses goes to the
   [glossary](../PRODUCT.md#3-glossary); a term only this module uses stays in its section 2.
5. **Section 7 is mandatory.** One line saying "not here, see X" saves three paragraphs later.
