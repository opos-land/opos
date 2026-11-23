# 0046. Keep the price tiers of a ticket type apart with an exclusion constraint

- Status: Proposed
- Date: 2026-11-19

## Context

A ticket type of the [catalog](../specs/0003-catalog.md) has price tiers: each a price within a
date window. Its price at a moment is the tier covering that moment, and an order is priced at the
tier in force when it is placed. Two tiers that cover one moment would give a ticket type two
prices, and which one a buyer pays would depend on the order a query happened to read them in.

The API checks the tiers of a request before it writes them. That check alone covers one request:
it does not cover a later route that writes a tier another way, a script, or a mistake in the
check itself. The rule is one of money, so it is held where every writer meets it.

A unique constraint cannot say "these two ranges do not overlap"; an exclusion constraint can.
Comparing the ticket type's `uuid` for equality inside the same GiST index takes the `btree_gist`
extension, which ships with Postgres and is not installed by default.

## Decision

- `ticket_type_price_tiers` has an exclusion constraint over the ticket type and the range of the
  tier's window: no two rows of one ticket type have windows that overlap.
- A window holds its start and not its end, so one tier may end at the moment the next one starts.
  The contract tells the price at a moment by the same rule.
- The migration that adds the constraint installs `btree_gist` into the `extensions` schema. It is
  the first extension OPOS installs itself.
- The API still refuses overlapping tiers before it writes, by its own code
  `ticket-type.tiers-overlap`, and maps a violation of the constraint to the same code.

## Alternatives

- **The API's check alone.** One writer checked, every other trusted; and the rule of what a
  buyer pays would rest on code no constraint backs.
- **A trigger that looks for an overlapping row.** It reads before it writes: two tiers written at
  the same moment in two transactions would both pass. An exclusion constraint is checked by the
  index, under the same locks a unique index takes.
- **Tiers as a start alone**, each lasting until the next one starts. No overlap could be written,
  but a gap could not either: a ticket type could not be off sale between two tiers, which the
  rule "with no tier covering a moment the ticket type is not on sale" asks for.

## Consequences

- A database OPOS runs on must allow `btree_gist`: Supabase's Postgres does, and the migration
  role may install it.
- The constraint lives in the hand-written privileges migration: Drizzle's schema does not
  describe exclusion constraints, so `db:generate` neither writes nor drops it.
- A change of a ticket type's tiers deletes its list and writes the new one in one transaction;
  the constraint is checked a statement at a time, so the new list never meets the old.
