# Module: `program-submissions`

## 1. What it does

A user keeps their programme items in their own account — a talk they give, a workshop they run, a
game they master — and offers them to conventions. When an edition opens its call, they pick a card
and send it; the convention reviews what arrived and, on acceptance, it becomes a programme item in
[`program-schedule`](program-schedule.md) without anyone retyping it.

Writing it down once and offering it for years is the point: the same card goes to three
conventions this spring and to their next editions two years later, and the person editing it is
its author, not an organizer.

The module follows the [submission pattern](README.md#shared-pattern-submissions) and the
[history pattern](README.md#shared-pattern-history-across-conventions); only what is specific to
programme proposals is described here.

In the MVP: not present.

## 2. Terms

| Term | Meaning |
|---|---|
| **programme card** | a programme item kept in a user's account, ready to be offered to conventions; belongs to no convention |
| **call** | the window in which an edition accepts programme submissions, with its own instructions |
| **unavailability** | a window inside the edition's dates in which the author cannot run their item; entered per submission, because it depends on the convention's dates |

A card sent to an edition becomes a **submission**; an accepted submission becomes an **event**
([glossary](../PRODUCT.md#3-glossary)). Three nouns, one chain, no synonyms.

## 3. Flows

| Actor | Action | Effect |
|---|---|---|
| user | writes a card in "my programme items" | stored on their account; no convention sees it |
| user | edits or deletes a card | submissions already sent are untouched |
| org, `write` | opens the call, sets its window and instructions | the edition appears in the list of open calls, and the form opens on the convention website |
| user | sends a card to an edition | a snapshot is copied into a `submitted` submission; a confirmation email goes out |
| user | marks when they cannot run it | the send form asks for the hours inside the edition's dates that are out of the question; no window means every hour suits them |
| user | ticks the consent box while sending | organizers of that edition may see where they have run programme and volunteered before |
| user | edits their submission | allowed while `submitted` and the call is open; the card is unaffected |
| user | withdraws | status `withdrawn`; a submission already accepted detaches from its programme item, and the item stays as a `draft` for the organizers to handle |
| org, `read` | reviews the list | sees who sent it, the snapshots, the declared unavailability, the decisions and — with consent — the history |
| org, `write` | accepts | status `accepted`, a `draft` programme item is created, the submitter is emailed |
| org, `write` | waitlists | status `waitlisted`, no programme item, no email until the status changes again |
| org, `write` | rejects | status `rejected`, the submitter is emailed |
| org, `write` | closes the call | the form stops accepting; deciding continues |

Acceptance copies the whole snapshot — `title`, `description`, `format`, `durationMinutes`,
`maxParticipants`, `requirements` and `coHosts` — into the new `events` row, sets its `hostName`
from the submitter's account and its `submissionId`, and leaves the times and room empty. Placing
it on the grid is the organizers' work in [`program-schedule`](program-schedule.md); nothing the
author wrote is retyped there. The declared unavailability is not copied: it stays on the
submission, and the item form reads it through `submissionId`.

## 4. Permissions

Resource `program-submissions`, edition level. A card needs no permission at all: it belongs to its
author, and no organizer reaches it before it is sent.

| Level | Allows |
|---|---|
| `read` | the submission list, who sent it — first name, last name and email address — the snapshots, the declared unavailability, decisions, review notes, the call configuration, and the submitter's history where consent was given |
| `write` | everything in `read`, plus opening and closing the call, editing its instructions, deciding, changing a decision and writing review notes |

Accepting also writes a programme item, and that write is deliberately not gated by
`program-schedule` — a programme reviewer needs no scheduling rights. The created item is a
`draft`, so it reaches nobody until someone with `program-schedule=write` places it.

## 5. Data

**`program_cards`** — account-owned, global, no `tenantId`, outside RLS.

| Column | Type | Notes |
|---|---|---|
| `accountId` | uuid | FK cascade |
| `title` | text | 3-200 characters |
| `description` | text | up to 5000 characters |
| `format` | text | free text, 1-60 characters — "lecture", "workshop", "RPG session" |
| `durationMinutes` | integer | 15-600 |
| `maxParticipants` | integer | nullable — what the author expects, not a limit anything enforces |
| `requirements` | text | nullable — room, equipment, table space |
| `coHosts` | text | nullable — free text, the people running it besides the author |

Index `(accountId)`. Reachable only through `/me/program-cards`, filtered by the account in the JWT.

**`program_submission_calls`** — at most one per edition.

| Column | Type | Notes |
|---|---|---|
| `tenantId`, `editionId` | uuid | FK cascade; unique `(editionId)` |
| `opensAt`, `closesAt` | timestamptz | nullable; empty `closesAt` means open until switched off |
| `isOpen` | boolean | default `false` — the manual switch, checked together with the window |
| `instructions` | text | nullable, up to 5000 characters, in the tenant's `defaultLocale` |

**`program_submissions`** — the snapshot, plus the shared columns from the
[pattern](README.md#shared-columns).

| Column | Type | Notes |
|---|---|---|
| `tenantId`, `editionId` | uuid | FK cascade |
| `sourceId` | uuid | nullable FK set null -> `program_cards`; empties when the card is deleted |
| `title`, `description`, `format`, `durationMinutes`, `maxParticipants`, `requirements`, `coHosts` | | copied from the card at send time, editable while the call is open |
| `status` | text | the shared set plus `waitlisted` |

Indexes `(tenantId, editionId, status)` and `(accountId)`. Partial unique index
`(editionId, sourceId) WHERE status in ('submitted', 'waitlisted', 'accepted')` — one live
submission per card per edition; a waitlisted card is still in play, and those three statuses are
this module's live set ([pattern](README.md#sending-takes-a-snapshot)).

**`program_submission_unavailability`** — when the author cannot run the item.

| Column | Type | Notes |
|---|---|---|
| `tenantId`, `submissionId` | uuid | FK cascade |
| `startsAt`, `endsAt` | timestamptz | `endsAt > startsAt`; must fall inside the edition's dates |

Index `(tenantId, submissionId, startsAt)`. Windows may not overlap within one submission, and a
window reaching outside the edition's dates answers `409 program-submissions.outside-edition-dates`.
No rows mean the author is free throughout the edition — the absence of a constraint, not an
unanswered question.

## 6. API

The card library, JWT only, always the caller's own:

| Method | Path |
|---|---|
| GET, POST | `/me/program-cards` |
| GET, PATCH, DELETE | `/me/program-cards/:cardId` |

Submissions, following the [shared endpoints](README.md#shared-endpoints) with
`<module>` = `program-submissions`:

| Method | Path | Who |
|---|---|---|
| GET | `/public/calls?module=program-submissions` | anyone — where a card can be sent right now |
| GET | `/public/tenants/:slug/editions/:editionSlug/program-submissions/call` | anyone |
| POST | `/me/program-submissions` | the submitter — `{ tenantSlug, editionSlug, sourceId, sharesHistory, unavailability }` |
| GET | `/me/program-submissions` | the submitter |
| PATCH | `/me/program-submissions/:id` | the submitter — the snapshot, `sharesHistory` and `unavailability` |
| DELETE | `/me/program-submissions/:id` | the submitter |
| GET | `/editions/:editionId/program-submissions` | `program-submissions>=read` |
| GET | `/editions/:editionId/program-submissions/:id/history` | `program-submissions>=read` |
| PATCH | `/editions/:editionId/program-submissions/:id` | `program-submissions=write` |
| PUT | `/editions/:editionId/program-submissions/call` | `program-submissions=write` |

`unavailability` is a list of windows sent whole: a `PATCH` replaces the previous list rather than
merging into it. An empty list is a valid answer and means the author is free throughout.

## 7. Out of scope

- **Placing accepted items in time and space** — [`program-schedule`](program-schedule.md). The
  declared unavailability warns the organizer placing the item there; it never blocks them.
- **Syncing a submission back into the card**, or a card back into an already accepted item. The
  snapshot is one-way, on purpose.
- **Appearances organizers typed in by hand.** The history is built from accepted submissions, so a
  programme item created straight in the panel counts towards nobody's record.
- **Scoring by several reviewers, votes, review rounds** — a single decision by one organizer is
  what this module records.
- **Attachments and images** — file uploads are beyond the MVP platform-wide.
- **Volunteers offering help** — [`volunteer-signups`](volunteer-signups.md); the same pattern,
  different content.
