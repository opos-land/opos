# 0080. Write the seed's demo data in Polish

- Status: Proposed
- Date: 2026-11-23

## Context

The repository is written in English, and the only Polish in it was the `pl` catalog and the
renderings a brief quotes ([0011](0011-localize-with-lingui-and-return-codes-from-the-api.md)). The
seed's demo data followed: its conventions, programme items, ticket types, add-ons, merchandise,
documents, consents, orders and emails were English.

Every demo account reads the applications in Polish, `pl` is the default locale, and the demo
conventions are Polish ones. A demo screen mixed the two languages: Polish labels around English
programme items, prices of "Standard" tickets and an English "Shop terms" PDF. What a convention
writes itself is shown as it was written, so the demo showed a convention no Polish organizer would
run.

The seed finds most of its rows by their name and writes some once, so a run of renamed data over a
database an English run left would add a second demo beside the first. Dev runs the seed on every
release and keeps the rows others add, so it cannot be emptied first.

## Decision

- The seed's demo data is Polish: everything a convention, an organizer, a buyer or a profile writes
  in the demo, and the text of the demo emails, after the `pl` rendering of the real ones. Its
  identifiers stay English: slugs, email addresses, discount codes, order numbers and the password.
  The code around the data, its comments and its tests' names stay English.
- The glossary renderings of the `pl` catalog name the things the demo data names: a merchandise
  item is a "gadżet", a perk a "bonus".
- A demo document's PDF writes the Polish letters through the font's own encoding.
- Until Dev and every checkout ran the seed in Polish, the seed renames the rows an English run left
  before it seeds, from a list of each English text with the Polish one that replaced it
  (`packages/db/src/seed-former.ts`), and writes the text of the demo emails anew.

## Alternatives

- **English demo data.** Keeps the one-language rule, and keeps the mixed screens.
- **Demo data in each convention's language.** Convention B's language is English; a demo of two
  languages needs a second copy of every text for no screen that differs.
- **Emptying the demo conventions on every run.** Renames come for free, but a tester loses what
  they added to a demo convention on every release, which the deployment of Dev keeps.
- **Leaving the English rows.** No code, and a demo with every programme item twice.

## Consequences

- `AGENTS.md` names the seed's demo data beside the `pl` catalog as the Polish in the repository.
- A test that reads the seed expects its Polish texts; an e2e scenario that reads the seed's
  conventions finds them by their Polish names.
- The list of former names, and the renaming it drives, go in a later change, once Dev ran the seed
  in Polish.
