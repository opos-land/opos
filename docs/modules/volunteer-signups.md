# Module: `volunteer-signups`

## 1. What it does

A user keeps one volunteer profile in their own account — how to reach them, what they have done
before, what they would rather do — and offers it to conventions. When an edition opens signups,
they send it together with the dates they can be there; the coordinator turns the stream of offers
into a known pool of volunteers, which [`volunteer-shifts`](volunteer-shifts.md) then assigns from.

Unlike a programme call, this one does not close before the work starts — volunteers keep signing
up during the convention, and somebody accepted on Saturday morning has to be assignable on
Saturday afternoon.

The module follows the [submission pattern](README.md#shared-pattern-submissions) and the
[history pattern](README.md#shared-pattern-history-across-conventions); only what is specific to
volunteering is described here.

In the MVP: not present.

## 2. Terms

| Term | Meaning |
|---|---|
| **volunteer profile** | what a user carries between conventions: contact, experience, preferences; one per account |
| **signup** | one person's offer to help at one edition — a profile snapshot plus the dates they can work |
| **signup call** | an edition's recruitment: open or closed, with its instructions and age requirement — this module's [call](README.md#the-window) |
| **availability** | a time window in which the person declares they can work; entered per signup, because it depends on the convention's dates |

An accepted signup makes the account a **volunteer** of that edition — the term is in the
[glossary](../PRODUCT.md#3-glossary).

## 3. Flows

| Actor | Action | Effect |
|---|---|---|
| user | fills in their volunteer profile | stored on their account; no convention sees it |
| user | edits the profile | signups already sent are untouched |
| org, `write` | opens the signup call, writes the instructions and the age requirement | the edition appears in the list of open calls, and the signup form opens on the convention website, in the portal and in the application |
| user | sends a signup: availability, the age declaration, consent | a profile snapshot becomes a `submitted` signup |
| user | edits their signup | allowed while `submitted`; availability stays editable after acceptance, because plans change |
| user | withdraws | status `withdrawn`; existing shift assignments are released and the coordinator is notified |
| user | signs up again after withdrawing or being rejected | allowed while the signup call is open — a fresh signup, deciding on it starts over |
| org, `read` | reviews signups | sees the snapshots, availability and — with consent — where the person has volunteered and what they have run |
| org, `write` | accepts | status `accepted`, the account joins the edition's volunteer pool, an email goes out |
| org, `write` | rejects | status `rejected`, an email goes out |
| org, `write` | revokes an acceptance | status back to `rejected`; assignments are released the same way as on withdrawal |

The signup call has no window: it opens when the coordinator opens it and closes when they close
it, with no dates doing it for them. Closing it changes nothing for people already accepted.

## 4. Permissions

Resource `volunteer-signups`, edition level. The profile needs no permission at all: it belongs to
its owner, and no organizer reaches it before it is sent.

| Level | Allows |
|---|---|
| `read` | the signup list, who sent it, availability, snapshots, contact details, review notes, the signup call, and the submitter's history where consent was given |
| `write` | everything in `read`, plus opening and closing the signup call, editing the instructions, deciding and revoking a decision |

Contact details sit behind `read` on purpose: a phone number is the most sensitive thing this
module stores, and nobody sees it without being given this resource explicitly.

## 5. Data

**`volunteer_profiles`** — account-owned, global, no `tenantId`, outside RLS. At most one per
account.

| Column | Type | Notes |
|---|---|---|
| `accountId` | uuid | FK cascade; unique |
| `phone` | text | nullable, up to 20 characters — the only channel that works on site |
| `preferences` | text | nullable, up to 1000 characters — free text |
| `experience` | text | nullable, up to 1000 characters |

Reachable only through `/me/volunteer-profile`, filtered by the account in the JWT.

**`volunteer_signup_calls`** — at most one per edition.

| Column | Type | Notes |
|---|---|---|
| `tenantId`, `editionId` | uuid | FK cascade; unique `(editionId)` |
| `isOpen` | boolean | default `false` |
| `instructions` | text | nullable, up to 5000 characters, in the tenant's `defaultLocale` |
| `minimumAge` | integer | nullable — shown in the form and confirmed by a declaration, never stored as a date of birth |

**`volunteer_signups`** — the snapshot, plus the shared columns from the
[pattern](README.md#shared-columns).

| Column | Type | Notes |
|---|---|---|
| `tenantId`, `editionId` | uuid | FK cascade |
| `sourceId` | uuid | nullable FK set null -> `volunteer_profiles` |
| `phone`, `preferences`, `experience` | | copied from the profile at send time, editable afterwards |
| `meetsAgeRequirement` | boolean | the declaration answering `minimumAge`; per signup, never on the profile; `false` blocks acceptance |

Partial unique index `(accountId, editionId) WHERE status in ('submitted', 'accepted')` — one
**live** signup per person per edition, those two statuses being this module's live set
([pattern](README.md#sending-takes-a-snapshot)). A `withdrawn` or `rejected` signup blocks nothing:
someone who changed their mind, or whom the coordinator turned down in March and needs in July,
signs up again and is decided on from scratch. Indexes `(tenantId, editionId, status)` and
`(accountId)`.

**`volunteer_availability`**

| Column | Type | Notes |
|---|---|---|
| `tenantId`, `signupId` | uuid | FK cascade |
| `startsAt`, `endsAt` | timestamptz | `endsAt > startsAt` |

Index `(tenantId, signupId, startsAt)`. Windows may not overlap within one signup.

## 6. API

The profile, JWT only, always the caller's own:

| Method | Path |
|---|---|
| GET, PUT, DELETE | `/me/volunteer-profile` |

Signups, following the [shared endpoints](README.md#shared-endpoints) with
`<module>` = `volunteer-signups`:

| Method | Path | Who |
|---|---|---|
| GET | `/public/calls?module=volunteer-signups` | anyone — who is recruiting right now |
| GET | `/public/tenants/:slug/editions/:editionSlug/volunteer-signups/call` | anyone |
| POST | `/me/volunteer-signups` | the volunteer — `{ tenantSlug, editionSlug, sharesHistory, availability, meetsAgeRequirement }` |
| GET | `/me/volunteer-signups` | the volunteer |
| PATCH | `/me/volunteer-signups/:id` | the volunteer — snapshot, availability, consent |
| DELETE | `/me/volunteer-signups/:id` | the volunteer — withdrawal |
| GET | `/editions/:editionId/volunteer-signups` | `volunteer-signups>=read` |
| GET | `/editions/:editionId/volunteer-signups/:id/history` | `volunteer-signups>=read` |
| PATCH | `/editions/:editionId/volunteer-signups/:id` | `volunteer-signups=write` |
| PUT | `/editions/:editionId/volunteer-signups/call` | `volunteer-signups=write` |

`POST` takes no `sourceId`: there is only one profile per account, and sending copies it. With no
source to key on, `409 submission.already-sent` means the person already has a live signup for that
edition. `409 volunteer.age-requirement` on accepting a signup whose `meetsAgeRequirement` is
`false`.

## 7. Out of scope

- **Posts, shifts, the schedule, hours worked** — [`volunteer-shifts`](volunteer-shifts.md).
- **Availability on the profile.** Dates belong to a convention, so they are entered per signup.
- **Choosing preferred posts from a list** — preferences are free text here, because signups open
  long before anyone defines the posts in [`volunteer-shifts`](volunteer-shifts.md).
- **More than one profile per account** — a person volunteers as themselves.
- **Contracts, insurance, background checks** — paper, not platform.
- **Rewarding volunteers with a free ticket** — hours are counted in `volunteer-shifts`, issuing
  the ticket is a manual act in [`tickets`](tickets.md).
