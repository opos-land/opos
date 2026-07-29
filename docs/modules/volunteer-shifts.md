# Module: `volunteer-shifts`

## 1. What it does

The coordinator defines where volunteers are needed and when, assigns people from the pool that
[`volunteer-signups`](volunteer-signups.md) produced, and sees at a glance which hours are still
uncovered. Volunteers see their own shifts in the portal and in the application, check in when they
start and check out when they finish, and the hours add up on their own.

In the MVP: not present.

## 2. Terms

| Term | Meaning |
|---|---|
| **post** | a named place or function volunteers serve at: entrance, info desk, cloakroom |
| **shift** | one post over one time window, with a headcount |
| **assignment** | one volunteer on one shift |
| **coverage** | how many of a shift's places are filled |

## 3. Flows

| Actor | Action | Effect |
|---|---|---|
| org, `write` | defines posts | posts become available when creating shifts |
| org, `write` | creates shifts on a post | each shift carries a headcount and a time window |
| org, `write` | assigns a volunteer | the shift's coverage rises; a clash with the volunteer's own other shift is rejected, a clash with their declared availability is a warning, not a refusal |
| org, `read` | opens the grid | sees posts against time, with understaffed shifts marked |
| volunteer | opens "my shifts" | sees their own assignments, in the tenant's time zone |
| volunteer | releases a shift | the assignment ends, coverage drops, the coordinator sees it in the gap list |
| volunteer or org, `write` | checks in | `checkedInAt` is stamped |
| volunteer or org, `write` | checks out | `checkedOutAt` is stamped, the hours count towards the total |
| org, `write` | closes an open shift | sets a missing `checkedOutAt` by hand for someone who forgot |
| org, `write` | withdraws a volunteer's acceptance in `volunteer-signups` | every future assignment of theirs is released automatically |

A volunteer reaches their own shifts through `/me`, not through a permission — being assigned is
what grants the view. The edition-level permission governs the coordinator's side only.

## 4. Permissions

Resource `volunteer-shifts`, edition level.

| Level | Allows |
|---|---|
| `read` | posts, shifts, assignments, coverage, hours worked |
| `write` | everything in `read`, plus creating and editing posts and shifts, assigning, releasing, checking in and out on someone's behalf and closing open shifts |

## 5. Data

**`volunteer_posts`**

| Column | Type | Notes |
|---|---|---|
| `tenantId`, `editionId` | uuid | FK cascade |
| `name` | text | 1-100 characters |
| `description` | text | nullable, up to 1000 characters — what the job actually is |
| `position` | integer | display order on the grid, default `0` |

Unique `(editionId, name)` and `(id, tenantId)`.

**`volunteer_shifts`**

| Column | Type | Notes |
|---|---|---|
| `tenantId`, `editionId` | uuid | FK cascade |
| `postId` | uuid | FK cascade; composite FK `(postId, tenantId)` |
| `startsAt`, `endsAt` | timestamptz | `endsAt > startsAt` |
| `headcount` | integer | 1-99 — how many people the shift needs |
| `note` | text | nullable, up to 500 characters |

Index `(tenantId, editionId, startsAt)` and `(tenantId, postId, startsAt)`.

**`volunteer_assignments`**

| Column | Type | Notes |
|---|---|---|
| `tenantId`, `shiftId` | uuid | FK cascade |
| `signupId` | uuid | nullable FK set null — an `accepted` row in `volunteer_signups`; empties when the account is deleted |
| `volunteerName` | text | copied when the assignment is made, so the grid and the hours survive a deleted account |
| `assignedBy` | uuid | `tenantMembershipId`, nullable after the member leaves |
| `checkedInAt`, `checkedOutAt` | timestamptz | nullable |
| `releasedAt` | timestamptz | nullable — set instead of deleting, so the gap has a history |
| `releasedBy` | uuid | nullable `accountId` — the volunteer or the coordinator |

Partial unique index `(shiftId, signupId) WHERE releasedAt is null`. Index
`(tenantId, signupId)`.

**Derived, never stored:** coverage is the count of assignments on a shift with `releasedAt` empty;
hours worked are the sum of `checkedOutAt - checkedInAt` over a volunteer's assignments. A shift
checked in but never checked out counts zero hours and shows up as open until someone closes it.

## 6. API

Panel, JWT + `X-Tenant-Slug` + the edition permission:

| Method | Path | Permission |
|---|---|---|
| GET | `/editions/:editionId/volunteer-posts` | `volunteer-shifts>=read` |
| POST, PATCH, DELETE | `/editions/:editionId/volunteer-posts[/:postId]` | `volunteer-shifts=write` |
| GET | `/editions/:editionId/volunteer-shifts` | `volunteer-shifts>=read` |
| POST, PATCH, DELETE | `/editions/:editionId/volunteer-shifts[/:shiftId]` | `volunteer-shifts=write` |
| POST | `/editions/:editionId/volunteer-shifts/:shiftId/assignments` | `volunteer-shifts=write` |
| DELETE | `/editions/:editionId/volunteer-shifts/:shiftId/assignments/:assignmentId` | `volunteer-shifts=write` — release |
| POST | `/editions/:editionId/volunteer-assignments/:assignmentId/check-in` | `volunteer-shifts=write` |
| POST | `/editions/:editionId/volunteer-assignments/:assignmentId/check-out` | `volunteer-shifts=write` |
| GET | `/editions/:editionId/volunteer-hours` | `volunteer-shifts>=read` |

The volunteer's own, JWT only:

| Method | Path |
|---|---|
| GET | `/me/volunteer-shifts` |
| DELETE | `/me/volunteer-shifts/:assignmentId` — release |
| POST | `/me/volunteer-shifts/:assignmentId/check-in` |
| POST | `/me/volunteer-shifts/:assignmentId/check-out` |

`409` with the code `volunteer.shift-overlap` when a volunteer is assigned to two shifts sharing
time, and `volunteer.not-accepted` when the signup is not `accepted`.

## 7. Out of scope

- **Recruiting volunteers** — [`volunteer-signups`](volunteer-signups.md).
- **A direct swap between two volunteers.** Releasing a shift puts it back in the gap list and the
  coordinator fills it; a negotiated hand-over between two people is not modelled.
- **Pay, settlements, per diems.** Hours are counted, nothing is calculated from them.
- **Issuing a reward ticket** — a manual act in [`tickets`](tickets.md).
- **Programme items** — a shift is not an event; see [`program-schedule`](program-schedule.md).
