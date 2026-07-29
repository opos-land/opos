# Module: `program-schedule`

## 1. What it does

Organizers build the edition's programme: what happens, when, and in which room. The module holds
the working copy and the published one at the same time, so a schedule can be assembled over weeks
and released in one move, and corrected during the convention without taking the website down.

It is the only place programme times are entered. Everything that displays a programme — the
convention website, the mobile application, the printed grid — reads from here.

In the MVP: programme items with a title, description and times, published straight to the
convention website. Rooms, item statuses and conflict detection follow.

## 2. Terms

| Term | Meaning |
|---|---|
| **room** | a named place in the venue where programme items happen; belongs to an edition |
| **conflict** | two published items sharing a room and overlapping in time |

The programme item itself is the **event** from the [glossary](../PRODUCT.md#3-glossary).

## 3. Flows

| Actor | Action | Effect |
|---|---|---|
| org, `write` | adds a room | the room becomes available in the item form and on the grid |
| org, `write` | creates an item | the item is `draft` — visible in the panel, absent everywhere else |
| org, `write` | sets the item's room and times | times outside the edition's dates are rejected with `409`; a conflict with another published item in that room is rejected with `409`; times inside the author's declared unavailability are a warning, not a refusal |
| org, `write` | publishes an item | the item appears on the convention website and in the application |
| org, `write` | moves a published item | the change is live at once; the previous time is not kept |
| org, `write` | cancels a published item | the item stays visible, marked cancelled, and stops counting towards conflicts |
| org, `read` | opens the programme | sees the grid with drafts, without any save button |
| visitor | opens the convention website | sees published and cancelled items of a published edition, in the tenant's time zone |

Publishing an item in an unpublished edition changes nothing publicly — the edition's
`isPublished` gates the whole website. Publishing the edition then reveals exactly the items
already marked published.

## 4. Permissions

Resource `program-schedule`, edition level.

| Level | Allows |
|---|---|
| `read` | the item list and the grid, drafts included, room list, conflict and unavailability warnings |
| `write` | everything in `read`, plus creating, editing, publishing, cancelling and deleting items and rooms |

Absent permission row means `none`: the module's section does not appear in the panel and its
endpoints answer `403`.

## 5. Data

**`rooms`**

| Column | Type | Notes |
|---|---|---|
| `tenantId` | uuid | FK cascade |
| `editionId` | uuid | FK cascade |
| `name` | text | 1-100 characters |
| `capacity` | integer | nullable — informational, nothing enforces it |
| `position` | integer | display order on the grid, default `0` |

Unique `(editionId, name)` and `(id, tenantId)`. Index `(tenantId, editionId, position)`.

**`events`**

| Column | Type | Notes |
|---|---|---|
| `tenantId` | uuid | FK cascade |
| `editionId` | uuid | FK cascade |
| `roomId` | uuid | nullable FK set null; composite FK `(roomId, tenantId)` |
| `title` | text | 3-200 characters |
| `description` | text | nullable, up to 5000 characters |
| `format` | text | nullable, 1-60 characters — free text, "lecture", "workshop", "RPG session" |
| `durationMinutes` | integer | nullable, 15-600 — the length the author asked for; the grid runs on `startsAt` and `endsAt` |
| `maxParticipants` | integer | nullable — what the author expects, not a limit anything enforces |
| `requirements` | text | nullable — room, equipment, table space |
| `coHosts` | text | nullable — free text, the people running it besides the host |
| `hostName` | text | nullable — free text until a guests module exists; set from the submitter's account when the item came from a submission |
| `startsAt` | timestamptz | nullable until the item is placed on the grid; must fall inside the edition's dates |
| `endsAt` | timestamptz | nullable, `endsAt > startsAt`; must fall inside the edition's dates |
| `status` | text | `draft` \| `published` \| `cancelled`, default `draft` |
| `submissionId` | uuid | nullable, unique — set when the item came from `program-submissions` |

Index `(tenantId, editionId, startsAt)` and `(tenantId, roomId, startsAt)`.

`format`, `durationMinutes`, `maxParticipants`, `requirements` and `coHosts` are what a proposal
carries besides its title and description, so an accepted submission lands here whole
([`program-submissions`](program-submissions.md)) and the organizer placing it has everything the
author wrote. Typed in by hand they are optional, and an item can be published without any of them.

A `published` item has `startsAt` and `endsAt` set — an item with no time is a `draft`, which is
exactly what acceptance produces.

Deleting a room detaches its items rather than removing them — a room is a venue detail, an item is
programme content.

## 6. API

Panel, JWT + `X-Tenant-Slug` + the edition permission:

| Method | Path | Permission |
|---|---|---|
| GET | `/editions/:editionId/events` | `program-schedule>=read` |
| POST | `/editions/:editionId/events` | `program-schedule=write` |
| PATCH | `/editions/:editionId/events/:eventId` | `program-schedule=write` |
| DELETE | `/editions/:editionId/events/:eventId` | `program-schedule=write` |
| GET | `/editions/:editionId/rooms` | `program-schedule>=read` |
| POST | `/editions/:editionId/rooms` | `program-schedule=write` |
| PATCH | `/editions/:editionId/rooms/:roomId` | `program-schedule=write` |
| DELETE | `/editions/:editionId/rooms/:roomId` | `program-schedule=write` |

Public, unauthenticated — published editions and published or cancelled items only:

| Method | Path |
|---|---|
| GET | `/public/tenants/:slug/editions/:editionSlug/events` |
| GET | `/public/tenants/:slug/editions/:editionSlug/events/:eventId` |

`409` with the code `program-schedule.room-conflict` on an overlap in the same room; the response
carries the conflicting item's identifier and title in `params`. `409
program-schedule.outside-edition-dates` when the times do not fit inside the edition's dates, and
`409 program-schedule.item-without-time` on publishing an item that has none.

The unavailability the author declared is a warning on the item form, never a refusal — the
organizer knows things the form does not, and a proposal is not a booking.

## 7. Out of scope

- **Attendees proposing items** — [`program-submissions`](program-submissions.md).
- **Attendees signing up for items with a seat limit** — planned as its own module; the programme
  itself counts no seats.
- **Speakers as entities with a history across editions** — planned; `hostName` is free text.
- **A personal schedule for an attendee** — the mobile application, beyond the MVP.
- **Volunteer shifts** — [`volunteer-shifts`](volunteer-shifts.md); a shift is not a programme item.
