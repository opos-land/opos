# Programme across convention scales

- Date: 2026-11-14
- Domain owner: the programme's domain owner (not yet named in
  [CONTRIBUTORS.md](../../CONTRIBUTORS.md))
- Source: desk research, a synthetic persona walkthrough, an independent review; no organiser
  interviewed yet
- Status: non-binding ([briefs](README.md)); worked toward a spec
- Companions: [research](0003-programme-across-convention-scales/research.md) (facts and their
  sources), [personas](0003-programme-across-convention-scales/personas.md) (the synthetic
  walkthrough), [wireframes](0003-programme-across-convention-scales/wireframes/index.html) (87
  screens in 17 sections)

One programme module, configured per convention, serving four real talk-centric conventions:
Nordcon, Fantasmagoria, Dni Fantastyki (DF) and Pyrkon. Worldcon is a stress test of the model,
not a customer. The module's rules come from its domain owner
([PRODUCT.md 7](../PRODUCT.md#7-modules)); everything here is a proposal for that owner and the
team, and every recommendation is a default to accept or replace.

**Contents.** [1 Example](#1-a-concrete-example-dni-fantastyki-from-proposal-to-a-live-move) ·
[2 Goal](#2-goal-and-the-four-conventions) · [3 Glossary](#3-glossary-of-new-terms) ·
[4 Model](#4-the-model) · [5 Feature matrix](#5-the-feature-matrix) ·
[6 Screens](#6-screens-index) · [7 PRODUCT.md](#7-what-changes-against-docsproductmd) ·
[8 Work order](#8-work-order) · [9 Worldcon](#9-worldcon-what-it-breaks) ·
[10 Walkthrough](#10-persona-walkthrough-summary-and-link) ·
[11 Checks](#11-checks-with-real-people) · [12 Risks](#12-risks) ·
[13 Open questions](#13-open-questions)

## 1. A concrete example: Dni Fantastyki from proposal to a live move

DF's 2026 calendar carries the example: the call for proposals runs from 7 May to 30 June, decisions
go out by 15 July, the preliminary programme on 10 July asks for confirmation by 25 July, the
programme comes out on 6 August and the festival runs 21–23 August. Two items follow it: the
proposed talk "Destiny in fantasy sagas" and the team-made guest panel "AI in organising
conventions". Both are invented, as are **all people on the screens**; other item titles are
partly real (Nordcon 2024, Fantasmagoria 2025, Pyrkon 2025–2026) and partly invented. Where a
step's screen shows the same flow with another convention's data, the step is the same.

| #   | Step                         | What happens                                                                                                                                                                                                                                                                                                                                                       | Screen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Proposal                     | On 12 May an invented speaker proposes the talk "Destiny in fantasy sagas" in the Literature block: 50 minutes, 12+. The form shows only fields whose dictionaries DF has filled, so there is no content-warning field. She follows its status and could edit or withdraw it until the call closed.                                                                | [ab-dni-proposal](0003-programme-across-convention-scales/wireframes/03-portal-my-schedule-proposing-an-item-speaker-screen.html#ab-dni-proposal), [ab-dni-proposal-mine](0003-programme-across-convention-scales/wireframes/16-portal-sign-ups-lottery-declines-and-empty-states.html#ab-dni-proposal-mine)                                                                                                                                                                                                                                                                                                          |
| 2   | Proposal selection           | On 8 July a block coordinator sees the block's 27 proposals with scores the team alone sees, and accepts, puts on the reserve list or rejects each. Decisions leave together from an outbox after a preview of text and recipients.                                                                                                                                | [ab-dni-proposals](0003-programme-across-convention-scales/wireframes/07-panel-building-the-programme.html#ab-dni-proposals), [ab-dni-proposal-detail](0003-programme-across-convention-scales/wireframes/17-panel-item-list-proposals-announcements-and-re-import.html#ab-dni-proposal-detail), [ab-pyrkon-decisions](0003-programme-across-convention-scales/wireframes/13-panel-programme-team-people-panels-and-the-programme-release.html#ab-pyrkon-decisions)                                                                                                                                                   |
| 3   | A team-made panel            | The team builds the guest panel "AI in organising conventions" outside the call: a moderator from the programme team, a head of a small convention, a zone coordinator of a large convention and a volunteer who takes part remotely. One of five seats stays free for open candidacy, since DF turned speaker recruitment on for guest panels.                    | [ab-dni-panel-casting](0003-programme-across-convention-scales/wireframes/13-panel-programme-team-people-panels-and-the-programme-release.html#ab-dni-panel-casting), [ab-dni-candidacy](0003-programme-across-convention-scales/wireframes/16-portal-sign-ups-lottery-declines-and-empty-states.html#ab-dni-candidacy)                                                                                                                                                                                                                                                                                               |
| 4   | Grid conflict                | On 9 July the grid places the panel on Saturday at 14:00 in Sala Rycerska, second floor. A warning names the conflict: the moderator also co-hosts "Tolkien and mythology" at 14:00 in Sala Kominkowa. It warns and does not block.                                                                                                                                | [ab-dni-grid](0003-programme-across-convention-scales/wireframes/07-panel-building-the-programme.html#ab-dni-grid)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 5   | Confirmation                 | Each cast member confirms each item, not a whole schedule, by 25 July. A speaker who presses "I can't" gives a reason and another time, and the team sees the entry as declined. On 3 August, before publication, the team takes the moderator off the Tolkien talk, so the conflict ends without a public change.                                                 | [ab-dni-confirm](0003-programme-across-convention-scales/wireframes/12-portal-the-speaker-from-acceptance-to-the-day-of-the-item.html#ab-dni-confirm), [ab-dni-decline](0003-programme-across-convention-scales/wireframes/16-portal-sign-ups-lottery-declines-and-empty-states.html#ab-dni-decline), [ab-dni-people-admin](0003-programme-across-convention-scales/wireframes/13-panel-programme-team-people-panels-and-the-programme-release.html#ab-dni-people-admin), [ab-dni-status](0003-programme-across-convention-scales/wireframes/15-panel-head-dictionaries-team-and-programme-status.html#ab-dni-status) |
| 6   | Publication                  | On 6 August the programme is published. DF makes no named release; a convention that does (Fantasmagoria) names the point, and door cards and the day poster carry its name. Pre-release warnings show and do not block.                                                                                                                                           | [ab-medium-release](0003-programme-across-convention-scales/wireframes/13-panel-programme-team-people-panels-and-the-programme-release.html#ab-medium-release), [ab-small-prints](0003-programme-across-convention-scales/wireframes/14-panel-the-programme-during-the-convention.html#ab-small-prints)                                                                                                                                                                                                                                                                                                               |
| 7   | Before the festival          | An attendee finds the panel: Sala Rycerska is up stairs only, entry is free and first come. The author meeting with the guest of honour in the same room has 296 likes for 80 seats, so it says it will likely be full. Her schedule warns about two liked items that overlap.                                                                                     | [ab-dni-item](0003-programme-across-convention-scales/wireframes/02-portal-programme-item-and-entry.html#ab-dni-item), [ab-dni-full-room](0003-programme-across-convention-scales/wireframes/16-portal-sign-ups-lottery-declines-and-empty-states.html#ab-dni-full-room), [ab-dni-plan](0003-programme-across-convention-scales/wireframes/11-portal-changes-now-and-next-rooms-reminders.html#ab-dni-plan)                                                                                                                                                                                                           |
| 8   | Live move                    | Saturday 11:24: the sound fails in Sala Rycerska. An org moves "Destiny in fantasy sagas" (12:00) to Namiot 3 in the moat, step-free and free at that hour. Before saving, the dialog names who will be told (128 likes and the cast), warns that the tent seats 60 against 128 likes, would warn if the room were taken, and offers a door card for the old room. | [ab-dni-move-live](0003-programme-across-convention-scales/wireframes/14-panel-the-programme-during-the-convention.html#ab-dni-move-live)                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 9   | The attendee sees the change | She gets an email naming the old and new room. The item carries "Moved 11:24, previously Sala Rycerska", the changes page lists it, and now and next and the room page show the new place.                                                                                                                                                                         | [ab-pyrkon-moved](0003-programme-across-convention-scales/wireframes/11-portal-changes-now-and-next-rooms-reminders.html#ab-pyrkon-moved), [ab-medium-changes](0003-programme-across-convention-scales/wireframes/11-portal-changes-now-and-next-rooms-reminders.html#ab-medium-changes), [ab-dni-now](0003-programme-across-convention-scales/wireframes/11-portal-changes-now-and-next-rooms-reminders.html#ab-dni-now), [ab-dni-room](0003-programme-across-convention-scales/wireframes/11-portal-changes-now-and-next-rooms-reminders.html#ab-dni-room)                                                          |

The example touches every part of the model in section 4 but seats: dictionaries, two switches,
the programme person and the cast, conflicts, confirmation, publication, notifications and a live
change.

## 2. Goal and the four conventions

**OPOS serves four kinds of talk-centric convention with one programme module configured per
convention.** What matters is function, not scale of traffic. The promise to the small end is
checkable: **a small convention does not have to set anything up and never sees fields without
data** ([4.7](#47-field-visibility)). Worldcon (4,000–10,000 members, a hybrid programme,
membership with voting rights) only tests the model.

The typical Polish fantasy convention is mostly talks, panel discussions and author meetings; an
RPG session is one item among many. Of DF 2026's 368 entries, 168 are talks and panel discussions
with 142 people, and 11 are RPG sessions. Three findings shape the module
([research 2](0003-programme-across-convention-scales/research.md#2-what-talk-centric-programmes-need)):

- **People are the axis.** Attendees look for a guest or a speaker, not a room; every attendee
  guide studied has a people list and profiles.
- **Conventions write fields into titles** ("[PRELEKCJA]", "(18+)", "[ENG]") because their tools
  lack them. Format, age, warnings and language become data, and import turns tags into fields.
- **The hardest process is a three-party agreement:** the team sets times, the speaker confirms
  each item, the attendee learns of every change. No tool studied marks a changed item itself.

### The four conventions

Source key: **NB** [Nordcon 2024 booklet](https://nordcon.gkf.org.pl/2024/informator); **FP**
[Fantasmagoria 2025 programme v8](https://fantasmagoria.gniezno.pl/media/docs/2025_07/Program_full_v8.pdf);
**DS** the DF 2026 programme sheet; **DW** the DF website; **PW** the Pyrkon website and rules;
**PE** Pyrkon's eBilet page; **PAP** press figures. Exact links are in
[research 8](0003-programme-across-convention-scales/research.md#8-sources). A cell marked
*(assumption)* has no source and waits for the organisers' answer
([11](#11-checks-with-real-people)).

|                        | Nordcon                                                                                                                                                 | Fantasmagoria                                                                     | Dni Fantastyki                                                                                      | Pyrkon                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Where and when         | Jastrzębia Góra, 3–8 December 2024; run by the Gdańsk fantasy club (NB)                                                                                 | Gniezno, two buildings, MOK and II LO (FP)                                        | Wrocław, the OPT Zamek castle, 21–23 August 2026 (DW)                                               | Poznań fairgrounds, three days and two nights (PW)          |
| People                 | no figure; the booklet printed 400 copies (NB)                                                                                                          | no figure                                                                         | about 10,000–16,000; sources conflict (DW)                                                          | 58,000 in 2024, over 66,000 in 2025; 280 guests (PAP)       |
| Programme size         | no count published                                                                                                                                      | no count published                                                                | 368 entries, 142 people (DS)                                                                        | 2,000–2,400 items (PW)                                      |
| Structure              | two talk rooms, Main Street for the main items, RPG and board-game rooms, buildings A and B; talk, games and films programmes with their own heads (NB) | about 27 rooms, zones and attractions; the room carries the block's identity (FP) | 21 spaces on five levels, seven blocks, a yearly theme line (DS, DW)                                | 20–24 zones, each with a zone coordinator (PW)              |
| Building the programme | the head of the talk programme assembles it (NB); types or imports it *(assumption)*                                                                    | call for proposals; import of the sheet behind the PDF *(assumption)*             | call for proposals 7 May–30 June (DW); who decides is not public; block coordinators *(assumption)* | call per zone behind an account, 17 December–10 April (PW)  |
| Entry to items         | free *(assumption)*                                                                                                                                     | free; sign-ups for workshops and RPG *(assumption)*                               | free, first come; 12 paid partner workshops by email or form (DS)                                   | tokens reserve half the seats, the rest from the queue (PE) |
| Tickets                | at the door or none *(assumption)*                                                                                                                      | sold in OPOS *(assumption)*                                                       | an external ticket service (DW)                                                                     | eBilet (PE)                                                 |
| Changes and print      | a 40-page A5 booklet; "part of the schedule may change"; a notice board (NB)                                                                            | the published PDF reached version 8 (FP)                                          | the sheet and the Konwencik app (DS)                                                                | its own app since June 2026 (PW)                            |

Neither Nordcon's nor Fantasmagoria's settings in OPOS were discussed with their organisers, and
neither publishes how it takes proposals. DF's selection process is not public either.

### Two axes instead of three sizes

"Small, medium, large" mixes two things. DF has a bigger programme than Fantasmagoria and a simpler
configuration. The model therefore has no modes; each convention sits somewhere on two axes:
**programme size** (items and people) and **depth of configuration** (switches turned on, rungs of
the seat ladder used, dictionaries filled).

```mermaid
quadrantChart
    title Programme size against depth of configuration
    x-axis Small programme --> Large programme
    y-axis Shallow configuration --> Deep configuration
    quadrant-1 Large and deep
    quadrant-2 Small but deep
    quadrant-3 Small and shallow
    quadrant-4 Large but shallow
    Nordcon: [0.08, 0.08]
    Fantasmagoria: [0.22, 0.52]
    Dni Fantastyki: [0.36, 0.42]
    Pyrkon: [0.92, 0.8]
    Worldcon stress test: [0.6, 0.95]
```

Positions are rough. Fantasmagoria's size is an assumption, since it publishes no item count; its
depth and Nordcon's rest on assumed switches ([4.1](#41-switches)).

## 3. Glossary of new terms

The terms of [PRODUCT.md 3](../PRODUCT.md#3-glossary) hold. These are the new ones this brief
uses, each with one English term and one Polish rendering.

| Term                       | Polish                      | Meaning                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **programme person**       | „osoba programu”            | an entry for a person or group on the convention's programme, kept at tenant level, optionally linked to an account ([4.5](#45-programme-person))                                                                                                                     |
| **cast**                   | „obsada”                    | the people on a programme item; a cast entry is person × item × role × state                                                                                                                                                                                          |
| **programme release**      | „wydanie programu”          | a named point in the changelog, such as "Programme 1"; printouts and "changes since" count from it ([4.6](#46-programme-release))                                                                                                                                     |
| **changelog**              | „lista zmian”               | the record of every change to a published item, with its time                                                                                                                                                                                                         |
| **switch**                 | „przełącznik”               | an edition setting that turns on a feature creating an obligation to people; off by default                                                                                                                                                                           |
| **programme dictionaries** | „słowniki programu”         | the edition's lists the head fills: rooms, blocks, formats, age scale, warnings, languages, accessibility features, entry labels                                                                                                                                      |
| **block**                  | „blok”                      | a part of the programme with its own coordinator and call, such as DF's Literature. One entity; its displayed name (block, zone or track, „blok”, „strefa”, „ścieżka”) is an edition setting picked from that closed list. "Zone" in this brief means Pyrkon's blocks |
| **theme line**             | „linia tematyczna”          | an edition's yearly theme an item may belong to, such as DF's "Szlakiem Przeznaczenia"                                                                                                                                                                                |
| **proposal**               | „zgłoszenie”                | an item submitted through the call for proposals                                                                                                                                                                                                                      |
| **proposal selection**     | „ocena zgłoszeń”            | the team's assessment and decision on proposals, visible to the team only; never a review                                                                                                                                                                             |
| **open candidacy**         | „kandydatura”               | a person volunteering for an item the team composes, under the speaker recruitment switch                                                                                                                                                                             |
| **confirmation**           | „potwierdzenie”             | a cast member's answer for one item: confirmed or cannot                                                                                                                                                                                                              |
| **sign-up**                | „zapis”                     | a binding seat on an item, accepted, waiting or not accepted                                                                                                                                                                                                          |
| **token**                  | „token”                     | a unit of a per-person limit on accepted sign-ups, as at Pyrkon                                                                                                                                                                                                       |
| **entitlement**            | „prawo”                     | a typed fact "this person may do this in this edition", such as admission or programme sign-ups, derived from a ticket, a registration, a grant or an import. An attendee's, never an org's. The Polish rendering differs from „uprawnienie” on purpose               |
| **permission**             | „uprawnienie”               | an org's access to a resource ([PRODUCT.md 5.1](../PRODUCT.md#51-permissions-and-roles)); unchanged                                                                                                                                                                   |
| **item code**              | „kod punktu”                | an optional human-readable code of an item, unique in its edition ([4.4](#44-item-identity-and-code))                                                                                                                                                                 |
| **entry label**            | „etykieta wejścia”          | a dictionary entry telling how to get in, with an optional link, such as "half the seats by tokens on eBilet"                                                                                                                                                         |
| **seat ladder**            | „drabina dostępu do miejsc” | the five rungs of limits on entry to an item ([4.2](#42-seat-ladder-and-allocation-method))                                                                                                                                                                           |
| **allocation method**      | „sposób przydziału”         | first come, first served, or a lottery                                                                                                                                                                                                                                |
| **gżdacz**                 | „gżdacz”                    | the Polish fandom word for a convention volunteer, used at Pyrkon; written "gżdacz (volunteer)" once per screen                                                                                                                                                       |

## 4. The model

**Much data, few switches.** Rooms, blocks, formats, tags, languages, accessibility features,
entry labels, mode and links are lists and values a convention fills in itself. While a list is
empty, its field, filter and warning do not exist. A switch exists only where turning it on
creates an obligation to people: a seat on an item, a decision on a proposal, a decision on a
person, a rating of an item.

Settings live on the edition, so a finished edition keeps the rules it ran under; only programme
people sit at convention level ([4.5](#45-programme-person)). There are no modes: the default is
already the small convention. From the second edition the preset is a copy of the previous one, as
in the shop brief's B1.3 ([0001](0001-convention-shop.md)); a first edition starts from a
checklist.

**Rules nobody configures:** conflicts warn and never block; standard lengths only suggest;
hiding, cancelling and moving are always available; a stream is a link, never an embed
([0026](../adr/0026-run-a-tracker-only-with-consent-and-none-in-the-panel.md)); notifications
follow one table ([4.8](#48-notifications)); entitlement types are a closed platform list;
isolation, org permissions and the content language belong to the core. Merging people, sending in
bulk, cancelling an item and putting a reserve item into a slot ask first in a modal that names
what goes ([0023](../adr/0023-ask-in-a-modal-before-an-action-that-cannot-be-undone.md)).

### 4.1 Switches

Four switches per edition, all off by default. This table is the single source of truth for which
convention turns which on; the matrix, the settings screens and the screens index follow it. Every
Nordcon, Fantasmagoria and DF value is an assumption about how it would use OPOS; Pyrkon's follow its published practice, except speaker recruitment.

| Convention      | Sign-ups                             | Call for proposals  | Speaker recruitment (open candidacy) | Reviews                 |
| --------------- | ------------------------------------ | ------------------- | ------------------------------------ | ----------------------- |
| Nordcon         | off *(assumption)*                   | off *(assumption)*  | off *(assumption)*                   | off *(assumption)*      |
| Fantasmagoria   | on, workshops and RPG *(assumption)* | on *(assumption)*   | off *(assumption)*                   | on *(assumption)*       |
| Dni Fantastyki  | off *(assumption)*                   | on *(assumption)*   | on, guest panels *(assumption)*      | off *(assumption)*      |
| Pyrkon          | on, tokens (PE)                      | on, per zone (PW)   | off *(assumption)*                   | off: collects none (PW) |
| Worldcon (test) | on, lottery                          | on, selected tracks | on                                   | no data                 |

| Switch              | Turns on                                                                                                             | Depends on                                                        | Off: the convention sees              | Turned off after use                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Sign-ups            | the sign-ups mode on an item: binding capacity, signing up and off, a waiting list, the list for orgs                | accounts; capacity from the room or the item                      | capacity as information; no button    | new sign-ups close; accepted sign-ups and the waiting list are kept and honoured until each item; the modal names how many |
| Call for proposals  | the proposal form for accounts, a window, statuses, a reserve list, decisions from an outbox; an idea without a host | accounts; blocks optional                                         | orgs add items themselves, as today   | the window closes; submitted proposals keep their status and still get a decision                                          |
| Speaker recruitment | open candidacy only: a person volunteers for an item the team composes, with a role and availability                 | accounts; the cast                                                | the team casts people itself          | no new candidacies; existing ones stay with the team until it decides                                                      |
| Reviews             | reviews under the domain owner's rules                                                                               | programme items; a variant for attendees only would need sign-ups | no reviews in the portal or the panel | existing reviews are hidden and kept, and show again when it is turned back on; account deletion still takes them          |

**Always available, shown once used:** the cast with roles, confirmation, availability and panel
composition by the team, which conventions use with speaker recruitment off. Settings show unused
features collapsed under "Not used (3)", never as empty lists. A parameter changed after the first
sign-up applies to new sign-ups only. Who turns switches on and off is
[Q10](#q10-who-turns-switches-on-and-off).

### 4.2 Seat ladder and allocation method

Instead of independent flags, two axes. The first is the **limit**: each rung contains the one
below. The second is the **allocation method**, available from rung 2.

| Rung                         | The attendee gets                                                                                                      | Pattern                     | Used by                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------- |
| 0. No limits                 | walks in                                                                                                               | DF talks, Worldcon panels   | Nordcon, DF, Fantasmagoria talks                        |
| 1. Label and link            | how to get in; capacity as information; "likely full" and "Room full"                                                  | Konwencik, Pyrkon's tiles   | DF's partner workshops; Pyrkon if tokens stay on eBilet |
| 2. Sign-ups and waiting list | signs up with an account                                                                                               | Sched; Worldcon table talks | Fantasmagoria *(assumption)*                            |
| 3. Limit per person          | a number of accepted sign-ups, an opening date, a priority                                                             | Pyrkon's tokens             | Pyrkon                                                  |
| 4. Split and forfeit         | part of the seats for sign-ups, the rest for the queue; a reservation lapses before the start; the scanner at the room | Pyrkon only                 | Pyrkon                                                  |

| Method                   | The result falls            | Results                           |
| ------------------------ | --------------------------- | --------------------------------- |
| First come, first served | at the moment of signing up | accepted or waiting               |
| Lottery                  | after the window closes     | accepted, waiting or not accepted |

**Eight configurations to test:** rungs 0 and 1 have no allocation (2), and rungs 2, 3 and 4 each
take either method (3 × 2 = 6). The window is a date or a rule relative to the item's day ("the day
before, 8:00–19:00"). A lottery result is stored once and never changes, so the race for the first
second disappears.

**One override level.** The edition sets the default and the item may override it; there is no
rule per format. A convention that wants sign-ups on its workshops sets the sign-ups mode on those
items. "Masterclass" at Fantasmagoria is a room, not a format.

**A full room at free entry.** Most talk-centric items are rung 0. Before the convention an item
with more likes than seats says "likely full: 214 likes, 80 seats"; during it an org can set "Room
full" on the item and in now and next. The like count is never presented as sign-ups.

**Rung 2 needs no ticket:** any signed-in account may sign up. A condition on a ticket or its day
is an entitlement and waits for [step 8](#8-work-order).

### 4.3 Building spectrum

Rungs 2 and 3 are parallel channels: one edition can run a call in some blocks and recruitment in
others. At every rung, the cast confirms each item.

| Rung                   | Who brings the item                            | Who brings the person                               | Decision                                      | Pattern                                             |
| ---------------------- | ---------------------------------------------- | --------------------------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| 0. The org types it    | org                                            | org, as a programme person                          | none                                          | Nordcon *(assumption)*; OPOS today                  |
| 1. Import from a sheet | org, in bulk, and again when the sheet changes | org                                                 | none                                          | Konwencik; Fantasmagoria *(assumption)*             |
| 2. Call for proposals  | the proposer                                   | the proposer and their invited co-hosts             | accepted, reserve, declined                   | DF, Pyrkon                                          |
| 3. Speaker recruitment | the team                                       | the person volunteers, the team invites with a role | about the person, then about the cast         | Worldcons 2022–2026; DF guest panels *(assumption)* |
| Every rung             | —                                              | —                                                   | each cast member confirms or cannot, per item | ZSFP guide, pretalx, Arisia                         |

### 4.4 Item identity and code

Changes, likes, calendars and exports all hang on the item staying the same item.

- **Every item has a stable id**, never reused. A change of title, cast, time or room keeps it, so
  likes stay and the change shows as a change of that item.
- **An item code is optional**: unique in the edition, set by the team or generated on first
  publication, never reused. Once published it does not change, even when the item moves to
  another block; a prefix such as "LIT" is frozen with it. It appears in exports, on printouts and
  door cards. The subscribed calendar uses the stable id.
- **Re-import** matches sheet rows to existing items by code, else by title and start time, and
  shows new, changed and missing rows before anything is saved. A missing row is never deleted
  automatically. Likes stay on matched items
  ([ab-medium-reimport](0003-programme-across-convention-scales/wireframes/17-panel-item-list-proposals-announcements-and-re-import.html#ab-medium-reimport)).
  Rows that cannot be read (an unknown room, an unreadable time, a person without an email) are
  fixed or skipped one by one
  ([ab-medium-import-errors](0003-programme-across-convention-scales/wireframes/17-panel-item-list-proposals-announcements-and-re-import.html#ab-medium-import-errors)).
- **A reserve item put into a cancelled item's slot is a new item.** Likes of the cancelled item do
  not move to it; the people who liked the cancelled one get its cancellation, which may name what
  now runs in the slot.
- **Exports carry stable ids and changes since a release**, so a convention's own app (Konwencik,
  Pyrkon's app) can mark changed items too.

### 4.5 Programme person

| Part                     | Rule                                                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Programme person         | an entry at tenant level (the convention brand), optionally linked to one account: display name (a pseudonym is fine), bio, photo, links, a contact address for the team                                    |
| Group                    | a programme person whose members are accounts, such as a club; it names one contact member who confirms and receives mail                                                                                   |
| Cast entry               | person × item × role × state (invited, confirmed, declined), with participation on site or remote and a recording and photo consent                                                                         |
| Edition                  | shows the people cast in it; a person with no item in an edition does not appear in its portal                                                                                                              |
| Entry without an account | the team creates it; it carries the person's display name on published items and nothing else in public until the person claims it with a link sent to their address (secret, single use, for that address) |
| Merge                    | merging two entries asks first in a modal and can be undone within the edition; cast entries and confirmations move to the surviving entry, and the team picks each profile field                           |
| Bio                      | up to 100 words; no limit for a guest of honour                                                                                                                                                             |
| New edition              | copies nothing about people: entries stay at tenant level, and the new edition has no cast until items are cast                                                                                             |
| Account deletion         | unlinks the entry and takes its profile; the item stays and shows "host removed at their request" *(for the legal check)*                                                                                   |

**Why tenant level.** Speakers stay in the tenant of their item
([ARCHITECTURE.md, Invariants](../ARCHITECTURE.md#invariants), 8). An entry per tenant keeps that,
and a returning speaker is the same person next year; per edition, a convention retypes its
regulars yearly; a profile shared across conventions, as in Sessionize, is a new read across
tenants ([Q5](#q5-where-does-a-programme-person-live)).

**This changes the glossary.** "Speaker: an account an org assigns to a programme item"
([PRODUCT.md 3](../PRODUCT.md#3-glossary)) becomes "a programme person cast on a programme item";
see [section 7](#7-what-changes-against-docsproductmd).

**Unconfirmed co-host.** A co-host invited by email shows on the item only after accepting; until
then the item publishes with the confirmed cast, and the invited person counts towards no speaker
discount. A proposer invites at most the call's limit, within the platform's limit on new
addresses ([Q24](#q24-an-invited-co-host-who-has-not-accepted)).

### 4.6 Programme release

A release ties together the published programme, its changes, printouts and confirmations. The two
models store different data (snapshots against a changelog on the live state), so the choice is
hard to reverse and gets a decision record.

| Question                                      | Variant A: the portal shows the last release                                                           | Variant B: the portal shows the current state (recommended)                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| What the portal shows                         | the last release; changes wait for the next one                                                        | every published item as it is now                                                                          |
| Which changes bypass a release                | an urgent change (cancel, move during the convention) takes its own path and creates a release at once | none wait: a change to a published item is visible at once and logged with its time                        |
| Does a live change make a release             | yes, a new numbered release                                                                            | no; it is a changelog entry after the last release                                                         |
| Print footer against live changes             | the footer names the release; the print matches the portal until the next release                      | the footer names the release; items changed since it carry a mark, so a printout reader finds what changed |
| Must a small convention make one at every fix | yes, or every fix waits                                                                                | no; it may never make one, or make one only to print or to tell speakers                                   |

**Variant B, in rules.** An item is a draft until published; drafts are never public, and adding
an item saves a draft. A change to a published item is public at once and logged. A release is a
named point in the changelog; the print footer and "changes since release N" come from it. A
change of time to an item asks its cast to confirm again; a change of room does not. Hiding a
published item that has likes or sign-ups counts as a cancellation for them
([4.8](#48-notifications)). Before any item is published the portal says when the programme comes
out and already lists the guests
([ab-small-before-release](0003-programme-across-convention-scales/wireframes/16-portal-sign-ups-lottery-declines-and-empty-states.html#ab-small-before-release)).

Variant A suits a team that reshuffles many published items at once and wants them to appear
together; under B that team works in drafts before the first publication. [Q6](#q6-which-release-model)
holds the choice.

### 4.7 Field visibility

**The promise: a small convention does not have to set anything up and never sees fields without
data.** It is checkable: a new edition with empty dictionaries offers an item form with title,
description, day, start, end and cast, and nothing else; an item in the portal shows no empty
label; the settings screen shows unused features collapsed.

- A field, its filter and its warning show only once its dictionary has entries.
- A filter appears once the data has two values.
- A dependency hides; it never greys out.
- Visibility of personal data is not configurable per convention.

The recommended scope is the edition: once DF fills its content warnings, the field shows on every
DF item. The cost shows at Nordcon, whose RPG warning tags would also appear on talk forms, and at
Pyrkon, where every zone coordinator would see every section any zone uses. A scope per format or per
block is [Q8](#q8-what-scope-does-field-visibility-have).

### 4.8 Notifications

One table holds who hears of what. Email is the channel; a subscribed calendar updates itself;
push is beyond the MVP ([PRODUCT.md 11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp)). Every email
names the item, the old and the new value and the time of the change. A like subscribes to its
item's changes ([Q18](#q18-does-a-like-subscribe-to-changes)).

| Event                                                                                     | Recipients                                                               | Channel                                                   | Can be turned off                                          |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------- |
| Cancellation, also hiding a published item that has likes or sign-ups                     | likes; sign-ups and the waiting list; cast                               | email; change mark; calendar entry updated                | likes: yes, per account and edition; sign-ups and cast: no |
| Time change                                                                               | likes; sign-ups; cast                                                    | email; mark; calendar; the cast is asked to confirm again | likes: yes; sign-ups and cast: no                          |
| Room change                                                                               | likes; sign-ups; cast                                                    | email; mark; calendar                                     | likes: yes; sign-ups and cast: no                          |
| Cast change (added, removed, replaced)                                                    | likes; sign-ups; the cast entries concerned                              | email; mark                                               | likes: yes; cast: no                                       |
| Accessibility change (a room with stairs, an interpreter or PJM removed or unconfirmed)   | likes; sign-ups; cast                                                    | email; mark                                               | likes: yes; sign-ups and cast: no                          |
| Title or description change                                                               | nobody                                                                   | mark only                                                 | —                                                          |
| Sign-up result (accepted, promoted from the waiting list with a deadline, lottery result) | the person signed up                                                     | email; my schedule                                        | no                                                         |
| Invitation, request to confirm, decision on a proposal or candidacy                       | the person concerned                                                     | email; speaker screen                                     | no                                                         |
| Announcement                                                                              | the audience the org picks: everyone, people who liked an item, the cast | portal; email except for "everyone"                       | likes: yes                                                 |
| Reminder before a liked item                                                              | the attendee who set it                                                  | email or a calendar alarm                                 | set by the attendee                                        |
| Programme release                                                                         | nobody by default                                                        | —                                                         | —                                                          |

Volunteers hold no role in OPOS, so they receive nothing personal: they read the changes page and
the announcements. The move dialog counts only people who will be told.

### 4.9 Entitlements and the module border

Pyrkon's ticket carries admission, tokens and dates in one object; Worldcon separates a named
membership from a transferable supplement. Either way the programme should ask not "which ticket"
but "what may you do": an **entitlement**, a typed fact from a closed platform list, derived from
one of four sources.

```mermaid
flowchart LR
    subgraph sources["Sources"]
        T["Tickets: a ticket type in a paid order"]
        R["Registration for an edition without a purchase"]
        G["Org's grant: a code or an entry"]
        I["List import: eBilet, a Worldcon system"]
    end
    subgraph registrations["Attendee registrations, no domain owner yet"]
        E["Entitlement of a person in an edition: type, parameters, source, since when"]
    end
    T --> E
    R --> E
    G --> E
    I --> E
    E --> P["Programme: who may sign up, how many times, from when; who sees a link"]
    E --> S["Scanner: admission; an accepted sign-up at the room"]
    E --> X["Export: the eligible list as of a date"]
    P -.->|"hours and cast of accepted items"| D["Tickets: speaker discount"]
```

Tickets knows nothing about the programme. Entitlements live with attendee registrations, so the
programme works for a convention selling no tickets in OPOS; at the large end import is the main
road. A small convention's panel never shows the word.

| Type               | Parameters               | Checked by           | Needed by                                           |
| ------------------ | ------------------------ | -------------------- | --------------------------------------------------- |
| admission          | days                     | scanner              | the four conventions, through tickets               |
| programme sign-ups | count, opening, priority | programme            | Pyrkon; Fantasmagoria if its sign-ups need a ticket |
| online access      | —                        | programme, at links  | Worldcon only: a late step                          |
| membership         | number, one per person   | eligible-list export | Worldcon only: a late step                          |

**A speaker discount and a badge are not entitlements.** The programme hands tickets the hours of
accepted items and their split among co-hosts; tickets turns them into a discount and a code, and
the badge collection screen belongs to tickets. A cancelled item earns no discount. Programme
screens show only hours and cast, and say "set in Tickets"
([ab-pyrkon-perks](0003-programme-across-convention-scales/wireframes/12-portal-the-speaker-from-acceptance-to-the-day-of-the-item.html#ab-pyrkon-perks),
[ab-pyrkon-speaker-rule](0003-programme-across-convention-scales/wireframes/15-panel-head-dictionaries-team-and-programme-status.html#ab-pyrkon-speaker-rule)).

**Attendee registrations wait for their owner** ([CONTRIBUTORS.md](../../CONTRIBUTORS.md)), and
by this model the programme and the scanner depend on them. Sign-ups at rung 2 need no
entitlement; everything from rung 3 up waits for the registrations owner.

The shop brief ([0001](0001-convention-shop.md)) binds nothing, but the first tickets spec will fix
the shape of a ticket type, so these points are best agreed first:

| Shop brief                                                     | Pyrkon                                   | Worldcon                                         |
| -------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------ |
| a named ticket, transferred only by an org (BR-20, BR-22)      | bearer passes                            | fits membership; no one-per-person rule          |
| a buyer without an account sees a read-only order (F9.1)       | cannot reserve a seat                    | the member signs in for everything               |
| the shop needs Przelewy24 (B1.4)                               | sells on eBilet                          | another currency and provider                    |
| every ticket admits ([PRODUCT.md 3](../PRODUCT.md#3-glossary)) | fits                                     | membership and online access without admission   |
| a perk is text (BR-05)                                         | tokens are a number the programme checks | online access and voting are checked elsewhere   |
| no valid days, upgrade or transfer                             | day tickets                              | day tickets, upgrades, a transferable supplement |

### 4.10 Personal data

| Data                                                                 | Who sees it                                                                                                                            | Basis *(for the legal check)*                                                                            | How long                                                              |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Display name, bio, photo, links of a person cast on a published item | everyone                                                                                                                               | consent when proposing or claiming; without an account, only the display name, as in a printed programme | while the programme is public; removed on request or account deletion |
| Contact address of a programme person                                | orgs with programme access where the person is cast                                                                                    | needed to run the item                                                                                   | 12 months after their last edition, unless linked to an account       |
| Entry without an account (what the team typed)                       | the team only, until claimed                                                                                                           | legitimate interest in running the item                                                                  | as above; deletable on request without an account                     |
| Co-panelists' email addresses                                        | hidden from the cast until the domain owner decides (issues 44–46, [0002](0002-programme-reviews.md)); speakers write through the team | —                                                                                                        | —                                                                     |
| Phone numbers                                                        | not collected                                                                                                                          | —                                                                                                        | —                                                                     |
| Speaker availability, maximum items per day                          | the team only                                                                                                                          | needed to schedule                                                                                       | until the edition ends                                                |
| "Not with" preferences                                               | the team: a private flag "check the panel with me", no free text about anyone                                                          | the person's request                                                                                     | until the edition ends                                                |
| A speaker's accessibility needs                                      | not collected; the proposal lists item needs (a microphone, a step-free room)                                                          | special-category data: the owner and the legal check                                                     | —                                                                     |
| Recording and photo consent                                          | the team, on each cast entry                                                                                                           | consent, withdrawable for future recordings                                                              | with the cast entry                                                   |
| Who signed up for an item                                            | orgs with programme access; never public or at the door                                                                                | needed to run the item                                                                                   | until the edition ends, then counts only                              |
| Likes                                                                | the count is public, who liked is not ([PRODUCT.md 7](../PRODUCT.md#7-modules)); a shared schedule link carries a revocable secret     | the user's action                                                                                        | until taken back or the account goes                                  |
| Proposals and assessments                                            | the proposer sees their own and its decision; assessments are team only                                                                | the submission                                                                                           | declined ones deleted when the edition ends                           |
| Legal name for a badge check                                         | tickets, not the programme                                                                                                             | tickets' rules                                                                                           | tickets' rules                                                        |

## 5. The feature matrix

Each row is a feature, its kind (data, switch, parameter or fixed rule) and how each convention
would set it. In the four convention columns a cell marked *(a)* is an assumption; an unmarked cell
comes from the sources in [research](0003-programme-across-convention-scales/research.md#1-what-the-four-conventions-programmes-look-like).
The Worldcon column is the stress test
([research 5](0003-programme-across-convention-scales/research.md#5-what-worldcon-stresses)). A
dash means unused.

| Feature                             | Kind and options                                                                                             | Nordcon                                                          | Fantasmagoria                                                                                | Dni Fantastyki                                                                          | Pyrkon                                                                 | Worldcon (test)                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| Rooms                               | data: building, floor, capacity, step-free access, second location                                           | K8, K6, Main Street, RPG and board-game rooms; buildings A and B | about 27 rooms, zones and attractions in MOK and II LO                                       | 21 spaces on five levels; floors 1–3 without a lift; free outdoor zone                  | rooms by pavilion; rooms shared between zones *(a)*                    | rooms, also online                        |
| Blocks                              | data: rooms, call open or closed, displayed name                                                             | none; separate talk, games and films programmes                  | none: the room carries the block                                                             | seven blocks and the free zone                                                          | 20–24 zones; the science zone's call closed                            | tracks                                    |
| Theme line                          | data of the edition; an item may have none                                                                   | —                                                                | —                                                                                            | "Szlakiem Przeznaczenia"                                                                | —                                                                      | —                                         |
| Format                              | data apart from the title                                                                                    | "(warsztaty)" in the title                                       | in the title: "- panel dyskusyjny", "(konkurs)", "(warsztaty)"                               | a tag at the start of every title                                                       | types in the app *(a)*                                                 | panel, table talk, workshop               |
| Age rating                          | data: the edition's scale with "no rating"                                                                   | —                                                                | 16+ and 18+ in the title, after 22:00                                                        | B.O. (94), 7+, 12+, 13+, 15+, 16+, 18+, and no rating (151); B.O. is a label of its own | none; adult content declared in the description                        | —                                         |
| Content warnings                    | data: a list independent of age                                                                              | "Warning tags" on RPG sessions                                   | —                                                                                            | —                                                                                       | none in the data                                                       | content notes                             |
| Item language                       | platform list; shown from two languages; "language-independent"                                              | Polish                                                           | Polish                                                                                       | Polish; guest items in English with an interpreter *(a)*                                | PL, EN, language-independent                                           | English and more                          |
| Accessibility features              | platform list, on the room and the item                                                                      | —                                                                | —                                                                                            | a quiet tent; two accessibility coordinators                                            | PJM, low stimulation                                                   | live captions *(a)*                       |
| Entry labels with a link            | data: the edition's list, picked on the item                                                                 | —                                                                | —                                                                                            | 12 paid partner workshops, sign-up by email or form                                     | half the seats by tokens on eBilet, the rest from the queue            | —                                         |
| Item and slot length                | data: two values and "all day"; a suggestion only                                                            | talks on the hour; RPG sessions 2–6 hours                        | mostly on the hour, some at half past (9:30, 20:30, 21:30, 22:30); no end time in the record | 50 within 60, 110 within 120                                                            | 45 + 5 + 10 minutes; 20-minute units for children                      | 60 within 90 *(a)*                        |
| Continuous and after-midnight items | fixed rule: an item belongs to the day it starts; a continuous item shows as "on all day", never as starting | RPG sessions 20:00–02:00                                         | "Atrakcje Non-Stop"                                                                          | about 70 all-day entries                                                                | 54 hours non-stop                                                      | —                                         |
| Mode and links                      | data: on site, hybrid, online; links timed before, during, after                                             | —                                                                | —                                                                                            | —                                                                                       | PJM recordings published after the item                                | three modes; links for online access      |
| Item state and marks                | fixed rule ([4.6](#46-programme-release))                                                                    | yes                                                              | yes                                                                                          | yes                                                                                     | yes                                                                    | plus a working draft per item (late step) |
| Item identity and code              | fixed rule ([4.4](#44-item-identity-and-code))                                                               | — *(a)*                                                          | — *(a)*                                                                                      | an "LP" number in the call table                                                        | codes per zone *(a)*                                                   | codes in the pocket programme *(a)*       |
| Cast with role                      | data: host, co-host, moderator, panelist, guest, interpreter; remote; a group                                | host; two co-hosts                                               | hosts as pseudonyms, groups, brands, titles                                                  | moderator and panelists; items credited to groups                                       | host and up to 4 co-hosts                                              | moderator, panelists, remote              |
| Guest of honour, featured           | data on the person and the item                                                                              | a guest list with bios of eight people                           | —                                                                                            | four headline guests, each tied to a block                                              | 280 guests                                                             | guests of honour                          |
| Programme people and profiles       | fixed ([4.5](#45-programme-person))                                                                          | the booklet's guest list                                         | hosts by display name                                                                        | a guest list *(a)*                                                                      | guests linked to items in the app                                      | People                                    |
| Person without an account           | a programme person entry, claimable                                                                          | usual *(a)*                                                      | on import *(a)*                                                                              | headline guests *(a)*                                                                   | guests *(a)*                                                           | guests of honour                          |
| Import and export                   | fixed: sheet import and re-import, KonOpas, .ics                                                             | types items *(a)*                                                | imports the sheet behind the PDF *(a)*                                                       | the sheet feeds Konwencik                                                               | export to its own app *(a)*                                            | export to ConClár                         |
| Programme release                   | fixed: variant B                                                                                             | one release for the booklet *(a)*                                | PDF version 8 published; earlier versions unknown                                            | published on 6 August                                                                   | published, then changes *(a)*                                          | a freeze for print *(a)*                  |
| Conflicts and completeness          | fixed rule: warn, never block; room, person, availability, items per day                                     | completeness *(a)*                                               | room, person *(a)*                                                                           | room, person, availability *(a)*                                                        | rooms shared between zones, a person across zones, items per day *(a)* | plus panelists' availability              |
| Full room at free entry             | fixed ([4.2](#42-seat-ladder-and-allocation-method))                                                         | — *(a)*                                                          | — *(a)*                                                                                      | guest meetings over capacity *(a)*                                                      | the queue half *(a)*                                                   | —                                         |
| Switch: sign-ups                    | edition switch; on the item: open, information, sign-ups                                                     | off *(a)*                                                        | on: workshops and RPG *(a)*                                                                  | off *(a)*                                                                               | on: tokens                                                             | on: lottery                               |
| Allocation method                   | parameter: first come or lottery                                                                             | —                                                                | first come *(a)*                                                                             | —                                                                                       | first come; a lottery for a guest meeting *(a)*                        | lottery                                   |
| Sign-up window                      | parameter: a date or a rule relative to the item's day                                                       | —                                                                | from publication to the start *(a)*                                                          | —                                                                                       | closes the day before at 23:59                                         | opens the day before at 8:00              |
| Who may sign up                     | rung 2: any signed-in account; a ticket condition is an entitlement (step 8)                                 | —                                                                | any account; a ticket condition later *(a)*                                                  | —                                                                                       | holders of tokens                                                      | members before day tickets                |
| Limit per person, priority          | parameter from an entitlement                                                                                | —                                                                | none *(a)*                                                                                   | —                                                                                       | tokens 6 to 1 by ticket type                                           | one per hour *(a)*                        |
| Reserved share, forfeit             | edition parameter, override on the item                                                                      | —                                                                | 100%, none *(a)*                                                                             | —                                                                                       | 50%; lapses 10 minutes before, 20 at Sala Ziemi                        | 100%, none *(a)*                          |
| Check at the room                   | the sign-up state on the attendee's phone; the scanner at rung 4                                             | —                                                                | phone *(a)*                                                                                  | —                                                                                       | scanner in room mode *(a)*                                             | phone *(a)*                               |
| Switch: call for proposals          | edition switch ([4.1](#41-switches))                                                                         | off *(a)*                                                        | on *(a)*                                                                                     | on *(a)*: 7 May–30 June, answers by mid-July                                            | on, per zone: 17 December–10 April                                     | selected tracks                           |
| Proposal selection                  | part of the call: team-only assessments                                                                      | —                                                                | none *(a)*                                                                                   | block coordinators *(a)*; who decides is not public                                     | zone coordinators *(a)*                                                | track leads                               |
| Speaker confirmation                | always available: per item, with a deadline                                                                  | by email *(a)*                                                   | yes *(a)*                                                                                    | until publication *(a)*                                                                 | readiness an hour before the item                                      | draft schedules for approval              |
| Speaker availability                | always available; team only                                                                                  | — *(a)*                                                          | arrival and departure *(a)*                                                                  | yes *(a)*                                                                               | yes *(a)*                                                              | yes                                       |
| Panel composition                   | always available: seats, roles, invitations                                                                  | —                                                                | — *(a)*                                                                                      | guest panels *(a)*                                                                      | panels of up to 4 *(a)*                                                | track leads compose panels                |
| Switch: speaker recruitment         | edition switch: open candidacy only                                                                          | off *(a)*                                                        | off *(a)*                                                                                    | on: guest panels *(a)*                                                                  | off *(a)*                                                              | on                                        |
| Switch: reviews                     | edition switch; rules from the domain owner                                                                  | off *(a)*                                                        | on *(a)*                                                                                     | off *(a)*                                                                               | off: collects none                                                     | no data                                   |
| My schedule                         | fixed: likes, sign-up states, overlap warning, calendar                                                      | likes                                                            | likes and sign-ups                                                                           | likes                                                                                   | likes and reservations *(a)*                                           | likes and lottery entries                 |
| Now and next                        | fixed: on now and starting within the hour                                                                   | by building *(a)*                                                | by building                                                                                  | by level                                                                                | by pavilion                                                            | by room                                   |
| Speaker screen                      | fixed: profile, proposals, confirmations, schedule                                                           | items *(a)*                                                      | proposals and items *(a)*                                                                    | proposals, confirmations, profile                                                       | plus invitations, day of the item                                      | plus candidacy                            |
| Change notifications                | fixed table ([4.8](#48-notifications))                                                                       | yes *(a)*                                                        | yes *(a)*                                                                                    | room changes during the festival *(a)*                                                  | app notifications                                                      | yes                                       |
| Announcements                       | fixed: dated posts, pinned, an audience                                                                      | a notice board in the café                                       | yes *(a)*                                                                                    | yes *(a)*                                                                               | app messages *(a)*                                                     | newsletter                                |
| Printouts                           | fixed: door card, day poster, export for typesetting                                                         | a booklet of about 40 A5 pages, 400 copies                       | the programme PDF                                                                            | no data                                                                                 | no data                                                                | pocket programme                          |
| Speaker discount rule               | data for tickets: hours of accepted items and their split                                                    | none found                                                       | no data                                                                                      | no published rule                                                                       | 50% per full hour, split, up to 100%                                   | traditionally reimbursed *(a)*            |
| Entitlements                        | attendee registrations: types and sources                                                                    | —                                                                | a ticket gives sign-ups *(a)*                                                                | —                                                                                       | tokens from tickets, eBilet import, codes                              | membership, admission, online             |
| Org permissions                     | core: programme per edition; "my blocks" filter                                                              | the head of the talk programme                                   | the programme team *(a)*                                                                     | block coordinators *(a)*                                                                | zone coordinators                                                      | track leads                               |
| Volunteer                           | no role in OPOS                                                                                              | portal *(a)*                                                     | portal *(a)*                                                                                 | portal; "Room full" set by an org                                                       | gżdacz (volunteer) with the scanner *(a)*                              | portal                                    |
| Error reports from attendees        | Could: wrong time or room, to the team                                                                       | —                                                                | *(a)*                                                                                        | *(a)*                                                                                   | *(a)*                                                                  | —                                         |

## 6. Screens index

87 screens: 71 in sections 1–15 and 16 in sections 16–17. Each screen's title names the
convention whose data it carries; the "Conventions" column says which conventions need that screen
(**N** Nordcon, **F** Fantasmagoria, **D** Dni Fantastyki, **P** Pyrkon). Priorities: **Must** is
needed before the first talk-centric convention runs its programme on OPOS; **Should** is needed by
the conventions that use that part; **Could** serves the largest conventions or waits for a
request. Worldcon screens have no priority. In "Answers", K-numbers and A-numbers are walkthrough
findings and assumptions ([personas](0003-programme-across-convention-scales/personas.md#cross-convention-findings),
[10](#10-persona-walkthrough-summary-and-link)); section numbers point to this brief.

```mermaid
xychart-beta
    title "Screens per section"
    x-axis ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17"]
    y-axis "Screens" 0 --> 10
    bar [4, 4, 4, 3, 4, 4, 4, 3, 4, 4, 8, 8, 8, 4, 5, 9, 7]
```

### Section 1. [Portal: programme (Nordcon · Fantasmagoria · Dni Fantastyki · Pyrkon)](0003-programme-across-convention-scales/wireframes/01-portal-programme-nordcon-fantasmagoria-dni-fantastyki-pyrkon.html)

| Screen                                                                                                                                                   | Title                     | Conventions | Priority | Answers                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------- | -------- | ------------------------------------- |
| [ab-small-list](0003-programme-across-convention-scales/wireframes/01-portal-programme-nordcon-fantasmagoria-dni-fantastyki-pyrkon.html#ab-small-list)   | Nordcon: programme        | N           | Must     | K01, K06; [4.7](#47-field-visibility) |
| [ab-medium-list](0003-programme-across-convention-scales/wireframes/01-portal-programme-nordcon-fantasmagoria-dni-fantastyki-pyrkon.html#ab-medium-list) | Fantasmagoria: programme  | F           | Must     | K01, K07; filters at two values       |
| [ab-dni-list](0003-programme-across-convention-scales/wireframes/01-portal-programme-nordcon-fantasmagoria-dni-fantastyki-pyrkon.html#ab-dni-list)       | Dni Fantastyki: programme | D           | Must     | K01, K19; DF's age scale              |
| [ab-pyrkon-list](0003-programme-across-convention-scales/wireframes/01-portal-programme-nordcon-fantasmagoria-dni-fantastyki-pyrkon.html#ab-pyrkon-list) | Pyrkon: programme         | P           | Must     | K01, K06; paging past 1,000 items     |

### Section 2. [Portal: programme item and entry](0003-programme-across-convention-scales/wireframes/02-portal-programme-item-and-entry.html)

| Screen                                                                                                                      | Title                                 | Conventions | Priority | Answers                                                                        |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------- | -------- | ------------------------------------------------------------------------------ |
| [ab-small-item](0003-programme-across-convention-scales/wireframes/02-portal-programme-item-and-entry.html#ab-small-item)   | Nordcon: open item                    | N           | Must     | K03; rung 0                                                                    |
| [ab-medium-item](0003-programme-across-convention-scales/wireframes/02-portal-programme-item-and-entry.html#ab-medium-item) | Fantasmagoria: workshop with sign-ups | F           | Should   | K04, K10, K20; rung 2 for any account                                          |
| [ab-dni-item](0003-programme-across-convention-scales/wireframes/02-portal-programme-item-and-entry.html#ab-dni-item)       | Dni Fantastyki: panel upstairs        | D F         | Must     | K05, A05; room access                                                          |
| [ab-pyrkon-item](0003-programme-across-convention-scales/wireframes/02-portal-programme-item-and-entry.html#ab-pyrkon-item) | Pyrkon: panel with tokens             | P           | Could    | K07; rung 4; [Q23](#q23-does-opos-replace-pyrkons-app-and-ebilet-or-feed-them) |

### Section 3. [Portal: my schedule, proposing an item, speaker screen](0003-programme-across-convention-scales/wireframes/03-portal-my-schedule-proposing-an-item-speaker-screen.html)

| Screen                                                                                                                                            | Title                                    | Conventions | Priority | Answers                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------- | -------- | ------------------------------------------------------ |
| [ab-medium-plan](0003-programme-across-convention-scales/wireframes/03-portal-my-schedule-proposing-an-item-speaker-screen.html#ab-medium-plan)   | Fantasmagoria: my schedule with sign-ups | F           | Should   | K10, K22; sign-up states                               |
| [ab-dni-proposal](0003-programme-across-convention-scales/wireframes/03-portal-my-schedule-proposing-an-item-speaker-screen.html#ab-dni-proposal) | Dni Fantastyki: propose a programme item | F D P       | Should   | K13; co-host invitations ([4.5](#45-programme-person)) |
| [ab-dni-speaker](0003-programme-across-convention-scales/wireframes/03-portal-my-schedule-proposing-an-item-speaker-screen.html#ab-dni-speaker)   | Dni Fantastyki: my proposals and items   | F D P       | Must     | K24; links to the one confirmation screen              |
| [ab-pyrkon-plan](0003-programme-across-convention-scales/wireframes/03-portal-my-schedule-proposing-an-item-speaker-screen.html#ab-pyrkon-plan)   | Pyrkon: my schedule with tokens          | P           | Could    | K07; tokens with their context                         |

### Section 4. [At the room door: volunteer and scanner](0003-programme-across-convention-scales/wireframes/04-at-the-room-door-volunteer-and-scanner.html)

| Screen                                                                                                                                   | Title                                      | Conventions | Priority | Answers                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------- | -------- | ---------------------------------------------------------------------------- |
| [ab-small-desk](0003-programme-across-convention-scales/wireframes/04-at-the-room-door-volunteer-and-scanner.html#ab-small-desk)         | Nordcon: volunteer at the information desk | N F D       | Should   | A06, K15                                                                     |
| [ab-medium-door](0003-programme-across-convention-scales/wireframes/04-at-the-room-door-volunteer-and-scanner.html#ab-medium-door)       | Fantasmagoria: sign-ups at the room        | F           | Should   | K15, K22, K26; the phone instead of a name list ([4.10](#410-personal-data)) |
| [ab-pyrkon-scanner](0003-programme-across-convention-scales/wireframes/04-at-the-room-door-volunteer-and-scanner.html#ab-pyrkon-scanner) | Pyrkon: scanner at the room (gżdacz)       | P           | Could    | A06, K26; rung 4                                                             |

### Section 5. [Panel: programme settings of an edition](0003-programme-across-convention-scales/wireframes/05-panel-programme-settings-of-an-edition.html)

| Screen                                                                                                                                     | Title                                               | Conventions | Priority | Answers                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ----------- | -------- | -------------------------------------------------------------- |
| [ab-small-settings](0003-programme-across-convention-scales/wireframes/05-panel-programme-settings-of-an-edition.html#ab-small-settings)   | Nordcon: everything off                             | N           | Must     | A01; "Not used (3)"; [4.7](#47-field-visibility)               |
| [ab-medium-settings](0003-programme-across-convention-scales/wireframes/05-panel-programme-settings-of-an-edition.html#ab-medium-settings) | Fantasmagoria: sign-ups and call for proposals      | F           | Must     | [4.1](#41-switches); one override level                        |
| [ab-dni-settings](0003-programme-across-convention-scales/wireframes/05-panel-programme-settings-of-an-edition.html#ab-dni-settings)       | Dni Fantastyki: call for proposals, no sign-ups     | D           | Must     | [4.1](#41-switches)                                            |
| [ab-pyrkon-settings](0003-programme-across-convention-scales/wireframes/05-panel-programme-settings-of-an-edition.html#ab-pyrkon-settings) | Pyrkon: sign-ups with tokens and call for proposals | P           | Must     | [4.1](#41-switches); [Q10](#q10-who-turns-switches-on-and-off) |

### Section 6. [Panel: programme dictionaries and the item form](0003-programme-across-convention-scales/wireframes/06-panel-programme-dictionaries-and-the-item-form.html)

| Screen                                                                                                                                     | Title                           | Conventions | Priority | Answers                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ----------- | -------- | ---------------------------------------------------------- |
| [ab-small-form](0003-programme-across-convention-scales/wireframes/06-panel-programme-dictionaries-and-the-item-form.html#ab-small-form)   | Nordcon: item form              | N           | Must     | K21; a new item is a draft                                 |
| [ab-dni-rooms](0003-programme-across-convention-scales/wireframes/06-panel-programme-dictionaries-and-the-item-form.html#ab-dni-rooms)     | Dni Fantastyki: rooms           | F D P       | Must     | K03, A05                                                   |
| [ab-dni-form](0003-programme-across-convention-scales/wireframes/06-panel-programme-dictionaries-and-the-item-form.html#ab-dni-form)       | Dni Fantastyki: item form       | D           | Must     | K21; empty dictionaries hide fields                        |
| [ab-pyrkon-form](0003-programme-across-convention-scales/wireframes/06-panel-programme-dictionaries-and-the-item-form.html#ab-pyrkon-form) | Pyrkon: item form, all sections | P           | Should   | [Q8](#q8-what-scope-does-field-visibility-have); item code |

### Section 7. [Panel: building the programme](0003-programme-across-convention-scales/wireframes/07-panel-building-the-programme.html)

| Screen                                                                                                                             | Title                                         | Conventions | Priority | Answers                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------- | -------- | ---------------------------------------------------------------- |
| [ab-medium-import](0003-programme-across-convention-scales/wireframes/07-panel-building-the-programme.html#ab-medium-import)       | Fantasmagoria: import from a sheet and export | N F         | Must     | K18; title tags become fields; [4.4](#44-item-identity-and-code) |
| [ab-dni-proposals](0003-programme-across-convention-scales/wireframes/07-panel-building-the-programme.html#ab-dni-proposals)       | Dni Fantastyki: proposals in my block         | D P         | Should   | K23; [Q11](#q11-is-a-block-a-filter-or-a-boundary)               |
| [ab-pyrkon-proposals](0003-programme-across-convention-scales/wireframes/07-panel-building-the-programme.html#ab-pyrkon-proposals) | Pyrkon: proposals in the zone                 | P           | Should   | K11; the reserve list                                            |
| [ab-dni-grid](0003-programme-across-convention-scales/wireframes/07-panel-building-the-programme.html#ab-dni-grid)                 | Dni Fantastyki: grid and conflicts            | F D P       | Must     | K25; two items in one room                                       |

### Section 8. [Panel: changes during the convention and entitlements](0003-programme-across-convention-scales/wireframes/08-panel-changes-during-the-convention-and-entitlements.html)

| Screen                                                                                                                                                           | Title                                | Conventions | Priority | Answers                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------- | -------- | -------------------------------------------------- |
| [ab-pyrkon-cancel](0003-programme-across-convention-scales/wireframes/08-panel-changes-during-the-convention-and-entitlements.html#ab-pyrkon-cancel)             | Pyrkon: cancelling an item           | N F D P     | Must     | K02; the modal                                     |
| [ab-medium-entitlements](0003-programme-across-convention-scales/wireframes/08-panel-changes-during-the-convention-and-entitlements.html#ab-medium-entitlements) | Fantasmagoria: tickets give sign-ups | F           | Could    | K20; [4.9](#49-entitlements-and-the-module-border) |
| [ab-pyrkon-entitlements](0003-programme-across-convention-scales/wireframes/08-panel-changes-during-the-convention-and-entitlements.html#ab-pyrkon-entitlements) | Pyrkon: sources of entitlements      | P           | Could    | [4.9](#49-entitlements-and-the-module-border)      |

### Section 9. [Worldcon: stress test of the model (not for delivery)](0003-programme-across-convention-scales/wireframes/09-worldcon-stress-test-of-the-model-not-for-delivery.html)

| Screen                                                                                                                                                       | Title                               | Conventions | Priority | Answers                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ----------- | -------- | ----------------------------------------------------- |
| [ab-worldcon-list](0003-programme-across-convention-scales/wireframes/09-worldcon-stress-test-of-the-model-not-for-delivery.html#ab-worldcon-list)           | Worldcon: hybrid programme          | —           | —        | [9](#9-worldcon-what-it-breaks)                       |
| [ab-worldcon-tabletalk](0003-programme-across-convention-scales/wireframes/09-worldcon-stress-test-of-the-model-not-for-delivery.html#ab-worldcon-tabletalk) | Worldcon: table talk with a lottery | —           | —        | [4.2](#42-seat-ladder-and-allocation-method)          |
| [ab-worldcon-hybrid](0003-programme-across-convention-scales/wireframes/09-worldcon-stress-test-of-the-model-not-for-delivery.html#ab-worldcon-hybrid)       | Worldcon: hybrid panel              | —           | —        | [Q19](#q19-does-an-online-item-show-the-viewers-time) |
| [ab-worldcon-casting](0003-programme-across-convention-scales/wireframes/09-worldcon-stress-test-of-the-model-not-for-delivery.html#ab-worldcon-casting)     | Worldcon: cast and recruitment      | —           | —        | [4.3](#43-building-spectrum)                          |

### Section 10. [Portal: programme people and guests](0003-programme-across-convention-scales/wireframes/10-portal-programme-people-and-guests.html)

| Screen                                                                                                                             | Title                                       | Conventions | Priority | Answers                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------- | -------- | ----------------------------------------- |
| [ab-dni-people](0003-programme-across-convention-scales/wireframes/10-portal-programme-people-and-guests.html#ab-dni-people)       | Dni Fantastyki: guests and programme people | N F D P     | Must     | K06; people as the axis                   |
| [ab-dni-guest](0003-programme-across-convention-scales/wireframes/10-portal-programme-people-and-guests.html#ab-dni-guest)         | Dni Fantastyki: guest of honour profile     | N D P       | Must     | the bio rule                              |
| [ab-medium-person](0003-programme-across-convention-scales/wireframes/10-portal-programme-people-and-guests.html#ab-medium-person) | Fantasmagoria: speaker profile              | F D P       | Must     | [4.5](#45-programme-person); display name |
| [ab-small-person](0003-programme-across-convention-scales/wireframes/10-portal-programme-people-and-guests.html#ab-small-person)   | Nordcon: person without a profile           | N F D P     | Must     | an entry without an account               |

### Section 11. [Portal: changes, now and next, rooms, reminders](0003-programme-across-convention-scales/wireframes/11-portal-changes-now-and-next-rooms-reminders.html)

| Screen                                                                                                                                                  | Title                                        | Conventions | Priority | Answers                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------- | -------- | ----------------------------------------------------------------------- |
| [ab-medium-changes](0003-programme-across-convention-scales/wireframes/11-portal-changes-now-and-next-rooms-reminders.html#ab-medium-changes)           | Fantasmagoria: programme changes             | N F D P     | Must     | K02; changes since release N                                            |
| [ab-pyrkon-moved](0003-programme-across-convention-scales/wireframes/11-portal-changes-now-and-next-rooms-reminders.html#ab-pyrkon-moved)               | Pyrkon: moved item                           | N F D P     | Must     | K02; the change mark                                                    |
| [ab-dni-now](0003-programme-across-convention-scales/wireframes/11-portal-changes-now-and-next-rooms-reminders.html#ab-dni-now)                         | Dni Fantastyki: now and next                 | N F D P     | Must     | K01; continuous items                                                   |
| [ab-small-announcements](0003-programme-across-convention-scales/wireframes/11-portal-changes-now-and-next-rooms-reminders.html#ab-small-announcements) | Nordcon: announcements                       | N F D P     | Should   | [4.8](#48-notifications)                                                |
| [ab-dni-room](0003-programme-across-convention-scales/wireframes/11-portal-changes-now-and-next-rooms-reminders.html#ab-dni-room)                       | Dni Fantastyki: room page                    | F D P       | Should   | K03, A05                                                                |
| [ab-pyrkon-reminders](0003-programme-across-convention-scales/wireframes/11-portal-changes-now-and-next-rooms-reminders.html#ab-pyrkon-reminders)       | Pyrkon: reminders and notifications          | F D P       | Should   | [4.8](#48-notifications): one switch for change emails                  |
| [ab-dni-plan](0003-programme-across-convention-scales/wireframes/11-portal-changes-now-and-next-rooms-reminders.html#ab-dni-plan)                       | Dni Fantastyki: my schedule without sign-ups | N F D P     | Must     | overlap warning; a link with a secret                                   |
| [ab-medium-review](0003-programme-across-convention-scales/wireframes/11-portal-changes-now-and-next-rooms-reminders.html#ab-medium-review)             | Fantasmagoria: review of an item             | F           | Should   | [Q12](#q12-can-reviews-be-turned-off-per-edition); the speaker reads it |

### Section 12. [Portal: the speaker from acceptance to the day of the item](0003-programme-across-convention-scales/wireframes/12-portal-the-speaker-from-acceptance-to-the-day-of-the-item.html)

| Screen                                                                                                                                                                        | Title                                    | Conventions | Priority | Answers                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------- | -------- | ------------------------------------------------------------------ |
| [ab-dni-speaker-profile](0003-programme-across-convention-scales/wireframes/12-portal-the-speaker-from-acceptance-to-the-day-of-the-item.html#ab-dni-speaker-profile)         | Dni Fantastyki: my speaker profile       | F D P       | Must     | the bio rule; for N only once a person claims an entry             |
| [ab-dni-confirm](0003-programme-across-convention-scales/wireframes/12-portal-the-speaker-from-acceptance-to-the-day-of-the-item.html#ab-dni-confirm)                         | Dni Fantastyki: confirm your items       | F D P       | Must     | the one confirmation screen; overlap warning                       |
| [ab-pyrkon-speaker-schedule](0003-programme-across-convention-scales/wireframes/12-portal-the-speaker-from-acceptance-to-the-day-of-the-item.html#ab-pyrkon-speaker-schedule) | Pyrkon: my speaker schedule              | F D P       | Must     | no co-panelists' addresses, no phones ([4.10](#410-personal-data)) |
| [ab-pyrkon-invite](0003-programme-across-convention-scales/wireframes/12-portal-the-speaker-from-acceptance-to-the-day-of-the-item.html#ab-pyrkon-invite)                     | Pyrkon: invitation to an item            | F D P       | Should   | an invitation with a role                                          |
| [ab-dni-availability](0003-programme-across-convention-scales/wireframes/12-portal-the-speaker-from-acceptance-to-the-day-of-the-item.html#ab-dni-availability)               | Dni Fantastyki: my availability          | F D P       | Should   | team-only data                                                     |
| [ab-pyrkon-perks](0003-programme-across-convention-scales/wireframes/12-portal-the-speaker-from-acceptance-to-the-day-of-the-item.html#ab-pyrkon-perks)                       | Pyrkon: what I am entitled to            | P           | Could    | hours and cast only; "set in Tickets"                              |
| [ab-dni-claim](0003-programme-across-convention-scales/wireframes/12-portal-the-speaker-from-acceptance-to-the-day-of-the-item.html#ab-dni-claim)                             | Dni Fantastyki: claim your guest profile | N F D P     | Should   | [4.5](#45-programme-person)                                        |
| [ab-pyrkon-dayof](0003-programme-across-convention-scales/wireframes/12-portal-the-speaker-from-acceptance-to-the-day-of-the-item.html#ab-pyrkon-dayof)                       | Pyrkon: the day of the item              | P           | Could    | readiness; "I can't make it" on the day                            |

### Section 13. [Panel: programme team, people, panels and the programme release](0003-programme-across-convention-scales/wireframes/13-panel-programme-team-people-panels-and-the-programme-release.html)

| Screen                                                                                                                                                                 | Title                                | Conventions | Priority | Answers                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------- | -------- | ------------------------------------------------------------ |
| [ab-dni-people-admin](0003-programme-across-convention-scales/wireframes/13-panel-programme-team-people-panels-and-the-programme-release.html#ab-dni-people-admin)     | Dni Fantastyki: programme people     | N F D P     | Must     | merge in a modal; the declined state                         |
| [ab-medium-release](0003-programme-across-convention-scales/wireframes/13-panel-programme-team-people-panels-and-the-programme-release.html#ab-medium-release)         | Fantasmagoria: programme release     | N F D P     | Must     | [4.6](#46-programme-release), variant B; A in its annotation |
| [ab-pyrkon-conflicts](0003-programme-across-convention-scales/wireframes/13-panel-programme-team-people-panels-and-the-programme-release.html#ab-pyrkon-conflicts)     | Pyrkon: conflicts across the edition | F D P       | Must     | K25; room conflicts named                                    |
| [ab-small-completeness](0003-programme-across-convention-scales/wireframes/13-panel-programme-team-people-panels-and-the-programme-release.html#ab-small-completeness) | Nordcon: completeness check          | N F D P     | Must     | "the same person" asks in a modal                            |
| [ab-dni-panel-casting](0003-programme-across-convention-scales/wireframes/13-panel-programme-team-people-panels-and-the-programme-release.html#ab-dni-panel-casting)   | Dni Fantastyki: panel composition    | F D P       | Should   | open candidacy; no free text about others                    |
| [ab-pyrkon-decisions](0003-programme-across-convention-scales/wireframes/13-panel-programme-team-people-panels-and-the-programme-release.html#ab-pyrkon-decisions)     | Pyrkon: decision messages            | F D P       | Should   | K23; the one outbox, with a preview and a modal              |
| [ab-pyrkon-reserve](0003-programme-across-convention-scales/wireframes/13-panel-programme-team-people-panels-and-the-programme-release.html#ab-pyrkon-reserve)         | Pyrkon: reserve list and replacement | D P         | Should   | K11; a replacement is a new item                             |
| [ab-medium-message](0003-programme-across-convention-scales/wireframes/13-panel-programme-team-people-panels-and-the-programme-release.html#ab-medium-message)         | Fantasmagoria: message to speakers   | F D P       | Should   | a bulk send asks in a modal                                  |

### Section 14. [Panel: the programme during the convention](0003-programme-across-convention-scales/wireframes/14-panel-the-programme-during-the-convention.html)

| Screen                                                                                                                                    | Title                                                | Conventions | Priority | Answers                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------- | -------- | ---------------------------------------------------- |
| [ab-dni-move-live](0003-programme-across-convention-scales/wireframes/14-panel-the-programme-during-the-convention.html#ab-dni-move-live) | Dni Fantastyki: moving an item during the convention | N F D P     | Must     | K02; recipients, room conflict, accessibility change |
| [ab-pyrkon-today](0003-programme-across-convention-scales/wireframes/14-panel-the-programme-during-the-convention.html#ab-pyrkon-today)   | Pyrkon: today's programme dashboard                  | D P         | Should   | no phone numbers                                     |
| [ab-pyrkon-badge](0003-programme-across-convention-scales/wireframes/14-panel-the-programme-during-the-convention.html#ab-pyrkon-badge)   | Pyrkon: speaker badge collection                     | P           | Could    | belongs to tickets                                   |
| [ab-small-prints](0003-programme-across-convention-scales/wireframes/14-panel-the-programme-during-the-convention.html#ab-small-prints)   | Nordcon: programme printouts                         | N F D       | Should   | [Q26](#q26-what-is-the-printed-programme)            |

### Section 15. [Panel: head, dictionaries, team and programme status](0003-programme-across-convention-scales/wireframes/15-panel-head-dictionaries-team-and-programme-status.html)

| Screen                                                                                                                                                        | Title                                                | Conventions | Priority | Answers                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------- | -------- | ------------------------------------------------------------------------------------ |
| [ab-dni-dictionaries](0003-programme-across-convention-scales/wireframes/15-panel-head-dictionaries-team-and-programme-status.html#ab-dni-dictionaries)       | Dni Fantastyki: the edition's programme dictionaries | N F D P     | Must     | DF's age scale; an empty dictionary hides its field                                  |
| [ab-pyrkon-team](0003-programme-across-convention-scales/wireframes/15-panel-head-dictionaries-team-and-programme-status.html#ab-pyrkon-team)                 | Pyrkon: team and zones                               | D P         | Should   | [Q11](#q11-is-a-block-a-filter-or-a-boundary): one variant drawn                     |
| [ab-dni-status](0003-programme-across-convention-scales/wireframes/15-panel-head-dictionaries-team-and-programme-status.html#ab-dni-status)                   | Dni Fantastyki: programme status                     | D P         | Should   | items outside blocks and outside the call                                            |
| [ab-pyrkon-speaker-rule](0003-programme-across-convention-scales/wireframes/15-panel-head-dictionaries-team-and-programme-status.html#ab-pyrkon-speaker-rule) | Pyrkon: speaker rule                                 | P           | Could    | [Q22](#q22-where-does-the-speaker-discount-rule-live)                                |
| [ab-small-copy](0003-programme-across-convention-scales/wireframes/15-panel-head-dictionaries-team-and-programme-status.html#ab-small-copy)                   | Nordcon: new edition from the previous one           | N F D P     | Should   | copies dictionaries and settings; people stay at convention level, no cast is copied |

### Section 16. [Portal: sign-ups, lottery, declines and empty states](0003-programme-across-convention-scales/wireframes/16-portal-sign-ups-lottery-declines-and-empty-states.html)

| Screen                                                                                                                                                          | Title                                            | Conventions   | Priority | Answers                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------- | -------- | ------------------------------------------------------------- |
| [ab-medium-signups](0003-programme-across-convention-scales/wireframes/16-portal-sign-ups-lottery-declines-and-empty-states.html#ab-medium-signups)             | Fantasmagoria: my sign-ups                       | F P           | Should   | K10; cancel, promotion with a deadline, any signed-in account |
| [ab-pyrkon-lottery](0003-programme-across-convention-scales/wireframes/16-portal-sign-ups-lottery-declines-and-empty-states.html#ab-pyrkon-lottery)             | Pyrkon: lottery for a guest meeting              | P *(assumed)* | Could    | a lottery pattern from Copernicon, assumed for Pyrkon         |
| [ab-dni-candidacy](0003-programme-across-convention-scales/wireframes/16-portal-sign-ups-lottery-declines-and-empty-states.html#ab-dni-candidacy)               | Dni Fantastyki: volunteer for a guest panel      | D             | Should   | [4.1](#41-switches): open candidacy                           |
| [ab-dni-decline](0003-programme-across-convention-scales/wireframes/16-portal-sign-ups-lottery-declines-and-empty-states.html#ab-dni-decline)                   | Dni Fantastyki: after "I can't"                  | F D P         | Must     | K12; reason, another time, change of answer                   |
| [ab-dni-proposal-mine](0003-programme-across-convention-scales/wireframes/16-portal-sign-ups-lottery-declines-and-empty-states.html#ab-dni-proposal-mine)       | Dni Fantastyki: my proposal, edit or withdraw    | F D P         | Should   | K24; withdrawal asks in a modal                               |
| [ab-dni-full-room](0003-programme-across-convention-scales/wireframes/16-portal-sign-ups-lottery-declines-and-empty-states.html#ab-dni-full-room)               | Dni Fantastyki: the item will likely be full     | N F D P       | Should   | K05; [4.2](#42-seat-ladder-and-allocation-method)             |
| [ab-dni-allday](0003-programme-across-convention-scales/wireframes/16-portal-sign-ups-lottery-declines-and-empty-states.html#ab-dni-allday)                     | Dni Fantastyki: all-day and after-midnight items | N F D P       | Should   | K01; the start-day rule                                       |
| [ab-small-before-release](0003-programme-across-convention-scales/wireframes/16-portal-sign-ups-lottery-declines-and-empty-states.html#ab-small-before-release) | Nordcon: portal before the programme is out      | N F D P       | Must     | [4.6](#46-programme-release)                                  |
| [ab-dni-desktop](0003-programme-across-convention-scales/wireframes/16-portal-sign-ups-lottery-declines-and-empty-states.html#ab-dni-desktop)                   | Dni Fantastyki: programme on a desktop           | N F D P       | Should   | a day grid by room                                            |

### Section 17. [Panel: item list, proposals, announcements and re-import](0003-programme-across-convention-scales/wireframes/17-panel-item-list-proposals-announcements-and-re-import.html)

| Screen                                                                                                                                                              | Title                                    | Conventions | Priority | Answers                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------- | -------- | --------------------------------------------------------------------------- |
| [ab-dni-items](0003-programme-across-convention-scales/wireframes/17-panel-item-list-proposals-announcements-and-re-import.html#ab-dni-items)                       | Dni Fantastyki: programme items          | N F D P     | Must     | K18, K21; states and bulk actions                                           |
| [ab-dni-proposal-detail](0003-programme-across-convention-scales/wireframes/17-panel-item-list-proposals-announcements-and-re-import.html#ab-dni-proposal-detail)   | Dni Fantastyki: one proposal             | F D P       | Should   | K14; team-only assessments                                                  |
| [ab-medium-announce](0003-programme-across-convention-scales/wireframes/17-panel-item-list-proposals-announcements-and-re-import.html#ab-medium-announce)           | Fantasmagoria: write an announcement     | N F D P     | Should   | [4.8](#48-notifications): audience                                          |
| [ab-medium-reimport](0003-programme-across-convention-scales/wireframes/17-panel-item-list-proposals-announcements-and-re-import.html#ab-medium-reimport)           | Fantasmagoria: import again              | N F         | Should   | [4.4](#44-item-identity-and-code)                                           |
| [ab-medium-import-errors](0003-programme-across-convention-scales/wireframes/17-panel-item-list-proposals-announcements-and-re-import.html#ab-medium-import-errors) | Fantasmagoria: import errors             | N F         | Must     | K18                                                                         |
| [ab-medium-reviews](0003-programme-across-convention-scales/wireframes/17-panel-item-list-proposals-announcements-and-re-import.html#ab-medium-reviews)             | Fantasmagoria: reviews of an item        | F           | Could    | [Q12](#q12-can-reviews-be-turned-off-per-edition); rules wait for the owner |
| [ab-dni-first-run](0003-programme-across-convention-scales/wireframes/17-panel-item-list-proposals-announcements-and-re-import.html#ab-dni-first-run)               | Dni Fantastyki: new edition, nothing yet | N F D P     | Must     | a first edition has nothing to copy                                         |

## 7. What changes against docs/PRODUCT.md

[PRODUCT.md](../PRODUCT.md), [ARCHITECTURE.md](../ARCHITECTURE.md) and the records hold over this
brief. These are the places where the proposal differs from them, for the domain owner and the team
to decide; nothing changes in the documents until a spec carries it.

| Rule today                                                                                                                                           | Proposal                                                                                                                                                                                       | Who decides                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Speaker: an account an org assigns to a programme item ([3](../PRODUCT.md#3-glossary))                                                               | a programme person cast on a programme item, optionally linked to an account ([4.5](#45-programme-person))                                                                                     | programme owner; a decision record         |
| An org assigns speakers by a confirmed account's address, up to 10 per item ([5.1](../PRODUCT.md#51-permissions-and-roles))                          | cast entries of programme persons with a role and a state; 10 per item stays the platform limit; a lower limit belongs to a call; proposers' invitations fall under the limit on new addresses | programme owner                            |
| An edition holds up to 1000 programme items ([5.1](../PRODUCT.md#51-permissions-and-roles))                                                          | paging and a higher limit, since Pyrkon has 2,000–2,400                                                                                                                                        | the team                                   |
| Like: a mark adding an item to the personal schedule ([3](../PRODUCT.md#3-glossary))                                                                 | also a subscription to the item's changes ([Q18](#q18-does-a-like-subscribe-to-changes)); a person cannot be liked                                                                             | programme owner                            |
| Reviews are in the MVP and in step 9 of its flow ([2](../PRODUCT.md#2-mvp-goal-and-end-to-end-flow), [11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp)) | a switch per edition, off by default; step 9 turns it on ([Q12](#q12-can-reviews-be-turned-off-per-edition))                                                                                   | the domain owner of reviews                |
| A speaker reads the reviews of their own items ([7](../PRODUCT.md#7-modules))                                                                        | unchanged: the speaker and the team read a review                                                                                                                                              | the domain owner of reviews                |
| Speaker profiles, rooms and the block schedule are beyond the MVP ([11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp))                                   | rooms, blocks and person profiles return to the MVP as optional data ([Q4](#q4-what-enters-the-mvp))                                                                                           | the team                                   |
| File uploads are beyond the MVP ([11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp))                                                                     | a speaker photo and presentation files wait for them; a profile has no photo until then                                                                                                        | the team                                   |
| Push notifications are beyond the MVP ([11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp))                                                               | unchanged: email and a subscribed calendar ([Q17](#q17-which-channel-carries-notifications))                                                                                                   | the team                                   |
| Tickets without a purchase are beyond the MVP ([11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp))                                                       | a registration without a purchase and an org's grant become sources of entitlements, in step 8                                                                                                 | the owners of tickets and of registrations |
| Custom roles are beyond the MVP ([11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp))                                                                     | unchanged: no "head of programme" or "zone coordinator" role; a block is a filter on the programme permission ([Q11](#q11-is-a-block-a-filter-or-a-boundary))                                  | the team                                   |
| Programme items, speakers, likes and reviews are edition-level ([4](../PRODUCT.md#4-business-model--tenant-and-edition))                             | programme persons are tenant-level; switches, dictionaries and the cast stay on the edition                                                                                                    | the team                                   |
| Hours always show in the convention's zone ([9](../PRODUCT.md#9-languages-markets-and-time-zones))                                                   | unchanged ([Q19](#q19-does-an-online-item-show-the-viewers-time))                                                                                                                              | the team                                   |
| One content language per convention ([9](../PRODUCT.md#9-languages-markets-and-time-zones))                                                          | unchanged: a bio has one language; the item language says what the item is held in, not a translation                                                                                          | —                                          |
| Account deletion takes likes, reviews, memberships and registrations ([10](../PRODUCT.md#10-personal-data-and-privacy))                              | it also unlinks a programme person and takes its profile; an entry without an account is deleted on request ([4.10](#410-personal-data))                                                       | programme owner, with the legal check      |
| The scanner checks tickets ([3](../PRODUCT.md#3-glossary))                                                                                           | at rung 4 it also checks an accepted sign-up at a room                                                                                                                                         | the domain owner of tickets                |
| Speakers stay in the tenant of their item ([ARCHITECTURE.md, Invariants](../ARCHITECTURE.md#invariants), 8)                                          | holds: a programme person is tenant-level, and nothing reads across tenants                                                                                                                    | —                                          |

## 8. Work order

A module without an owner and a spec gets no code. The order follows dependencies: what the most
conventions need first, Worldcon-only items last. Tickets is a parallel track that gates only steps
8 and 9. **P\*** marks Pyrkon in the scenario where OPOS is its programme back office and feeds its
own app and eBilet ([Q23](#q23-does-opos-replace-pyrkons-app-and-ebilet-or-feed-them)); full
replacement comes only after step 9.

| Step  | Scope                                                                                                                                                                                                                                                                                                 | Code                                               | After this step OPOS serves |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------- |
| 0     | Name the owners of the programme and of attendee registrations; talks with the organisers of the four conventions ([11](#11-checks-with-real-people)); choose the pilot                                                                                                                               | none                                               | —                           |
| 1     | The item model: rooms, blocks, format, theme line, age rating, content warnings, language, accessibility, entry labels, length and all-day, item identity and code, states and marks; the dictionaries; field visibility; portal filters, search, now and next, empty states; the first-run checklist | after the spec                                     | —                           |
| 2     | Programme people: entries at tenant level, groups, cast with role and state, merge, claim; guest list and profiles in the portal; confirmation per item and the decline path; the speaker's schedule                                                                                                  | after Q5                                           | —                           |
| 3     | Release and changes (variant B): changelog, releases, change marks, cancel and move with the recipients preview, room and accessibility conflicts, email notifications, announcements, subscribed calendar; printouts and an export for typesetting                                                   | after Q6 and Q17                                   | N                           |
| 4     | Import and re-import from a sheet, import errors, completeness check, conflicts across the edition, the panel grid and item list, KonOpas export with stable ids and changes, a new edition from the previous one, paging past 1,000 items                                                            | after the spec                                     | N                           |
| 5     | Call for proposals with proposal selection, the decision outbox and the reserve list; open candidacy, availability, panel composition                                                                                                                                                                 | after the spec                                     | N D P\*                     |
| 6     | Sign-ups for any signed-in account: first come with a waiting list, promotion, cancelling, smaller-room rule; "Room full"                                                                                                                                                                             | after Q14–Q16                                      | N D P\*                     |
| 7     | Reviews under the domain owner's rules                                                                                                                                                                                                                                                                | after the owner                                    | N F D P\*                   |
| Track | The tickets spec, with room for entitlements, valid days and a ticket type without admission, agreed before it fixes the ticket type                                                                                                                                                                  | with the tickets owner                             | —                           |
| 8     | Attendee registrations and entitlements: registration without a purchase, grants, list import, the ticket condition on sign-ups                                                                                                                                                                       | after the registrations owner and the tickets spec | N F D P\*                   |
| 9     | Limit per person and priority from entitlements; split, forfeit, the scanner at the room                                                                                                                                                                                                              | after step 8                                       | N F D P                     |
| 10    | Worldcon-only or on request: the lottery (earlier if Pyrkon confirms it), the viewer's time, online access and membership entitlements, a working draft per item, the eligible-list export, the speaker discount data for tickets, badge collection, volunteer duties, transfer and upgrade           | separate records                                   | —                           |

```mermaid
flowchart TD
    S0["0. Owners, talks, pilot"] --> S1["1. Item model and dictionaries"]
    S1 --> S2["2. Programme people and cast"]
    S2 --> S3["3. Release, changes, notifications, printouts"]
    S3 --> S4["4. Import, completeness, grid, export, paging"]
    S2 --> S5["5. Call for proposals and open candidacy"]
    S3 --> S6["6. Sign-ups, first come"]
    S1 --> S7["7. Reviews"]
    OR["Reviews rules from the domain owner"] --> S7
    T["Track: tickets spec with room for entitlements"] --> S8["8. Registrations and entitlements"]
    OW["Owner of attendee registrations"] --> S8
    S6 --> S8
    S8 --> S9["9. Limits, split, forfeit, scanner"]
    S9 --> S10["10. Worldcon-only and on request"]
```

The pilot is [Q2](#q2-which-convention-is-the-pilot). Must screens belong to steps 1–4, what any of
the four needs before its first edition on OPOS; the recommended pilot needs steps 1–3.

## 9. Worldcon: what it breaks

A recent Worldcon runs 600–1,450 items for 4,000–10,000 members, one in four or five virtual or
hybrid, under a new committee each year: in OPOS, a tenant per year. What only Worldcon needs waits
in step 10 for a second real convention or a request.

| Worldcon                                                                    | What breaks                                    | In the model                                                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 957–1,425 items                                                             | the 1,000-item limit                           | paging, which Pyrkon needs anyway (step 4)                                                       |
| Hybrid and online items                                                     | an item without a room                         | mode and links as data; OPOS hides the link, not the stream (step 10)                            |
| Viewers on other continents                                                 | hours in the convention's zone                 | not built ([Q19](#q19-does-an-online-item-show-the-viewers-time))                                |
| Track leads compose panels from surveys; draft schedules go to participants | a programme only proposed                      | open candidacy and confirmation per item (steps 2, 5); a working draft per item in step 10       |
| Table talks by lottery the day before; members first                        | first come only                                | the allocation axis, a relative window, priority (steps 9, 10)                                   |
| A named WSFS membership apart from a transferable supplement                | "a ticket is admission"                        | membership and online access as entitlement types (step 10)                                      |
| Hugo and site selection                                                     | a vote that is not OPOS's to hold              | outside OPOS: WSFS rules, a paper ballot, a paid vote; only an eligible-list export as of a date |
| About 30 track leads on one sheet; vetting applicants                       | enforced zone permissions; judgement on people | a "my blocks" filter; at most a decision mark, no content, no automation                         |

## 10. Persona walkthrough: summary and link

The walkthrough is synthetic: **every line below is a hypothesis, not evidence**, to be checked
with real people ([11](#11-checks-with-real-people)). The full method, the 23 personas, the
findings and their weights are in
[personas](0003-programme-across-convention-scales/personas.md).

- **What was walked.** 23 personas, two runs each (46 transcripts), read 29 of the 34 screens of
  an earlier version of sections 1–9 as HTML, without clicking. It had fictional stand-ins for the
  small and the medium convention, with sample data leaning on sign-ups and RPG. The screens of
  sections 10–17 have not been walked.
- **Personas** are roles without names or biographies: heads, block and zone coordinators, grid
  builders, speakers, attendees (a parent, a wheelchair user, a PJM user, indifferent visitors) and
  volunteers, spread over the four conventions.

| Finding                       | Weight | The persona would                                                                                                                             |
| ----------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| K01 Now or the whole day      | 20     | not know whether a highlighted "Now" shows what is on or the whole day, and read a narrowed list as the whole programme                       |
| K02 A changed item            | 17     | not learn of a change it needs; screens do not say who is told, a swap of title or cast in a slot is not a change, likes act as subscriptions |
| K03 Where                     | 15     | not find where: no room at the small convention, no floor or direction at the medium one and DF                                               |
| K04 Account needed            | 14     | not press, or give up at sign-in, because "account and ticket" sits in small print                                                            |
| K05 Will I get in             | 13     | not know whether it gets in: no "free with information", a full room still says "free entry"                                                  |
| K06 Finding fast              | 12     | not find an item by its host's name or a fragment of the title                                                                                |
| K07 Counters                  | 11     | misread "3 of 12" and "You have 3 tokens": no unit, no context                                                                                |
| K08 Like count                | 10     | read the like count as sign-ups, a crowd forecast or a rating                                                                                 |
| K20 The child                 | 6      | find no way to sign up a child without an account or a phone, or to know whether a child under seven gets in                                  |
| K21 Draft, hidden, published  | 5      | not know what goes public, and press "hide" as a safe preview                                                                                 |
| K22 Sign-up state at the door | 5      | find nothing on the phone to show at the door, and take screenshots                                                                           |
| K26 No signal                 | 4      | need the door list and the scanner to say whether they work offline and when they were current                                                |

Ties continue in the personas document (K09–K19, K23–K25).

| Assumption | Meaning                                                                                                                     | Votes: confirms / undermines / no basis | The panel would say                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| A01        | a small convention sets nothing up, and features switch on by themselves                                                    | 2 / 3 / 3                               | setting nothing at the start, yes; switching on by itself, no |
| A02        | first come with a waiting list is enough for small and medium conventions, and large ones without sign-ups do not need them | 4 / 5 / 7                               | only conditionally; no basis for the large half               |
| A03        | proposals in OPOS replace forms and email                                                                                   | 2 / 10 / 0                              | the form, yes; email and phone, no                            |
| A04        | a counter is enough, and where an entitlement comes from does not matter                                                    | 2 / 3 / 5                               | the counter needs context; heads need a reason for a refusal  |
| A05        | a room's accessibility as an attribute and a filter is enough                                                               | 0 / 5 / 3                               | accessibility is also an item's, a route's and a move's       |
| A06        | a volunteer needs a list or the scanner, and no role                                                                        | 1 / 8 / 1                               | "no role" holds; "a list is enough" fails everywhere          |

**Story against pressure.** Everywhere, a rule a persona stated would give way under pressure to a
local habit: publishing with open warnings, settling exceptions by phone, treating the reserve list
as a no. Where a screen does not say what happens next (K02, K05, K10, K15), the convention day
weighs more than planning.

## 11. Checks with real people

**Step 0 is talks with the organisers of Nordcon, Fantasmagoria, DF and Pyrkon.** The wireframes
are kept consistent first, so a test does not measure a sketch's mistakes.

| Convention     | Assumptions to confirm                                                                                                                                                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nordcon        | all four switches off; the head of the talk programme types or imports items; tickets at the door or none; most speakers without an account; one release for the booklet; whether OPOS should feed the booklet's typesetting; sessions past midnight belong to their start day; now and next useful at the information desk |
| Fantasmagoria  | sign-ups on for workshops and RPG, first come, for any signed-in account; a call for proposals; reviews on; tickets sold in OPOS; the sheet behind the PDF and whether it would be imported again; whether versions 1–7 of the PDF were published and what changed between them                                             |
| Dni Fantastyki | who decides on proposals and whether block coordinators do; the proposal form's fields; open candidacy for guest panels; confirmations until publication; guest items in English with an interpreter; whether the Konwencik export stays; what "B.O." means                                                                 |
| Pyrkon         | OPOS as back office feeding its app and eBilet, or full replacement; how its team places items and catches conflicts; a lottery for guest meetings; rooms shared between zones; who decides in a zone; a cast of up to four                                                                                                 |
| All four       | who may turn a switch on; whether a block is a filter or a boundary; how speakers confirm today; what a speaker may see of co-panelists                                                                                                                                                                                     |

Checks with people beyond the organisers, each tied to what it settles:

| Who                                                                                | Question or task                                                                                                                                               | Settles                    |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Two speakers and one person who builds a programme                                 | "Tell me about the last change to your item after the programme came out: who told whom, and how?"; confirm two items and decline one on a prototype           | confirmation, release (Q6) |
| Two volunteers, DF's volunteer coordinator, a gżdacz                               | "When was an item from your shift last moved, and how did you find out?"; "who sets the rule for a full room?"; "let in 10 from the queue: how many are left?" | A06, notifications         |
| Two people with accessibility needs                                                | "Tell me about the last item you did not get into"; "this item moved to the second floor: what do you do?"                                                     | A05                        |
| Five attendees, including a parent and a passer-by                                 | "What does this list show?"; "find something for the next 15 minutes"                                                                                          | K01, K05                   |
| Two or three heads of small conventions                                            | upload last edition's sheet, then "add your first item", watching whether they open the settings                                                               | A01                        |
| A DF block coordinator, a Pyrkon zone coordinator, two people from a reserve list  | count the emails around a decision; "who besides you decided in your block?"                                                                                   | A03, Q11                   |
| A medium convention's head, an attendee with tokens, a parent of a child aged 6–12 | the last five "I can't sign up" emails; the counter label; "your child wanted an item with limited seats: what happened?"                                      | A04, K20                   |

## 12. Risks

| Risk                                                                                | Mitigation                                                                                   |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Two of the four conventions and DF's selection process rest on assumptions          | step 0 before any spec; every assumed cell is marked                                         |
| Worldcon pulls the product towards a market OPOS does not serve                     | build only what a second real convention needs; Worldcon-only items in step 10               |
| Configuration instead of decisions                                                  | a parameter appears only when two real conventions need different values                     |
| The release model is hard to reverse                                                | decide Q6 with a decision record before step 3                                               |
| Attendee registrations, without an owner, sit in the middle of the dependencies     | rung 2 sign-ups need no entitlement; everything above waits for the owner                    |
| Entitlements grow into a rules engine                                               | a closed list of types; a type only with the module that checks it                           |
| Personal data of people who never signed up to OPOS                                 | team-only entries until claimed, the table in 4.10, the legal check                          |
| Clock events: a lottery draw, a forfeit                                             | a separate actor in the permission model, shared with the expiry of orders in the shop brief |
| Each switch costs a migration, grants, `verify.ts` and an isolation test per column | few switches                                                                                 |
| Volunteers have no role, yet run the doors                                          | the attendee's phone and the scanner carry the state; announcements carry changes            |

## 13. Open questions

Each question has options and a recommended default. Wireframe annotations cite these numbers.

### Ownership and scope

#### Q1. Who owns the programme and attendee registrations?

- Options: separate owners; one owner for both; the domain owner of tickets also takes
  registrations, as the shop brief asks (D15).
- **Recommended:** name the programme's owner first; offer registrations to the owner of tickets,
  who already holds D15.

#### Q2. Which convention is the pilot?

- Options: Nordcon, Fantasmagoria, DF, Pyrkon.
- **Recommended:** Nordcon, served after step 3 and held in December, the longest runway; DF
  second, as the first with a call and open candidacy. Both need their organisers' consent.

#### Q3. Is Worldcon ever a customer, or only a stress test?

- Options: a stress test; a future customer, bringing currencies, membership and voting exports.
- **Recommended:** a stress test.

#### Q4. What enters the MVP?

- Options: rooms, blocks and person profiles as optional data, with file uploads and push still
  beyond; everything as PRODUCT.md 11 says.
- **Recommended:** the first: a small convention never sees what it has not filled, and a large
  one cannot start without it.

### The model

#### Q5. Where does a programme person live?

- Options: tenant level, optionally linked to an account; edition level; platform level.
- **Recommended:** tenant level ([4.5](#45-programme-person)).

#### Q6. Which release model?

- Options: variant A, the portal shows the last release; variant B, the portal shows the current
  state and a release is a named point in the changelog.
- **Recommended:** B ([4.6](#46-programme-release)), with a decision record.

#### Q7. How does an item keep its identity across imports?

- Options: a stable id and an optional code, with re-import matched by code, else by title and
  start time; OPOS becomes the source of truth after the first import and there is no re-import.
- **Recommended:** the first ([4.4](#44-item-identity-and-code)).

#### Q8. What scope does field visibility have?

- Options: the edition; the format; the block.
- **Recommended:** the edition, revisited if Pyrkon's zone coordinators find the form too long.

#### Q9. What does the speaker recruitment switch cover?

- Options: open candidacy only, with cast, confirmation and availability always available;
  candidacy, invitations and confirmation together.
- **Recommended:** open candidacy only ([4.1](#41-switches)).

#### Q10. Who turns switches on and off?

- Options: an org with programme write access in the edition; the head only; the head for
  switches, orgs for parameters.
- **Recommended:** an org with programme write access, the permission that edits items. Turning a
  switch off after use asks in a modal naming what it affects.

#### Q11. Is a block a filter or a boundary?

- Options: a "my blocks" filter on the programme permission; an enforced boundary per zone.
- **Recommended:** a filter; a boundary needs a permission per block, which PRODUCT.md 5.1 lacks.

#### Q12. Can reviews be turned off per edition?

- Options: a switch, off by default, turned on in step 9 of the MVP flow; always on.
- **Recommended:** a switch, off by default; the rules of reviews stay with their domain owner
  ([0002](0002-programme-reviews.md)).

### Seats

#### Q13. Does a small convention need sign-ups in the first version?

- Options: an entry label with a link first; first-come sign-ups at once.
- **Recommended:** the label first. It is the cheapest rung and also covers Pyrkon's tokens on
  eBilet.

#### Q14. How does the waiting list move up?

- Options: automatically, with a deadline to confirm; by an org, by hand.
- **Recommended:** automatically, with a deadline; past it the seat passes on.

#### Q15. Who sees who signed up?

- Options: orgs with programme access only, the attendee's phone showing their state at the door;
  a printed name list at the door.
- **Recommended:** the first; a volunteer has no role in OPOS.

#### Q16. What happens to sign-ups when an item moves to a smaller room?

- Options: accepted sign-ups keep their order; those beyond the new capacity go to the top of the
  waiting list and are told; all sign-ups are cancelled and reopened.
- **Recommended:** the first, with the move dialog naming how many move to the waiting list.

### Changes

#### Q17. Which channel carries notifications?

- Options: email plus an optional subscribed calendar; push; email only.
- **Recommended:** email plus a subscribed calendar ([4.8](#48-notifications)); push stays beyond
  the MVP.

#### Q18. Does a like subscribe to changes?

- Options: yes, and the glossary entry of like says so; no, and a separate "follow" exists.
- **Recommended:** yes; attendees already use it that way, and a second mark would split
  attention.

#### Q19. Does an online item show the viewer's time?

- Options: no, always the convention's time; yes, beside it, for online and hybrid items.
- **Recommended:** no. None of the four conventions needs it; it would change PRODUCT.md 9.

### Entitlements and tickets

#### Q20. Where do entitlements live?

- Options: attendee registrations; tickets; a new module.
- **Recommended:** attendee registrations, so the programme works without a shop; agreed with the
  domain owner of tickets before the tickets spec fixes the ticket type.

#### Q21. Which entitlement types exist?

- Options: admission and programme sign-ups now, online access and membership when a second real
  convention needs them; all four now; a wider list including discounts and badges.
- **Recommended:** the first. A speaker discount and a badge are not entitlements.

#### Q22. Where does the speaker discount rule live?

- Options: in tickets, with the programme handing over hours and cast; in the programme; outside
  OPOS, as a code sent by email.
- **Recommended:** in tickets. The programme does not count money; a cancelled item earns nothing.

#### Q23. Does OPOS replace Pyrkon's app and eBilet, or feed them?

- Options: a back office whose exports carry stable ids and change marks, attendees staying in
  Pyrkon's app; full replacement, with tokens, my schedule and the scanner in OPOS.
- **Recommended:** the back office first; the Pyrkon screens of sections 2–4 show the second
  scenario. The same holds for DF's Konwencik export.

### People

#### Q24. An invited co-host who has not accepted

- Options: shown only after accepting, the item publishes with the confirmed cast, no discount
  until then; shown as invited; the item waits.
- **Recommended:** the first ([4.5](#45-programme-person)), with a proposer's invitations within
  the call's limit and the platform's limit on new addresses.

#### Q25. Which personal data of programme people is collected and shown?

- Options: the table in [4.10](#410-personal-data); a wider profile with phone numbers and
  accessibility needs.
- **Recommended:** the table, through the legal check PRODUCT.md 10 already plans.

### On site

#### Q26. What is the printed programme?

- Options: OPOS prints door cards and a day poster and exports the data for the booklet's
  typesetting; OPOS composes the booklet.
- **Recommended:** the first; the booklet stays the convention's own design.

#### Q27. Does the portal work without signal?

- Options: no offline mode in the first version, with pages saying when they were loaded and the
  subscribed calendar carrying my schedule; offline reading of the programme.
- **Recommended:** the first. Offline scanning is already beyond the MVP.

#### Q28. What accessibility does the portal itself meet?

- Options: WCAG 2.2 AA for the portal's programme screens, in a decision record; no stated target.
- **Recommended:** WCAG 2.2 AA.

### Decisions to take first

In the order of how many other decisions each blocks:

1. **The programme's domain owner** (Q1). Without one, no rule here can be accepted.
2. **The pilot** (Q2), with Pyrkon's scenario (Q23); the Must priorities follow from it.
3. **The programme person** (Q5): what an entry is, where it lives, how it links to an account.
4. **The release model** (Q6): snapshots or the current state with a changelog.
5. **The MVP scope** (Q4, Q12): rooms, blocks, profiles, file uploads, notifications, reviews as a
   switch.
6. **Blocks and switch rights** (Q11, Q10).
7. **The home of entitlements** (Q20), with the domain owner of tickets, before the tickets spec
   fixes the ticket type.
8. **Personal data of programme people** (Q25), before the first screen with an entry without an
   account.
