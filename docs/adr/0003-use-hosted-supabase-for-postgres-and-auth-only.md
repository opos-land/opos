# 0003. Use hosted Supabase for Postgres and sign-in only

- Status: Accepted
- Date: 2026-10-27
- Rationale: reconstructed, to confirm

## Context

OPOS first planned its own sign-in. The team then chose Supabase, Postgres and Supabase Auth, run
on the team's VPS, and a week later moved it to hosted projects. Sign-in holds passwords, email
confirmation, password reset, Google sign-in and two-factor authentication: code that is costly to
get right and to keep safe. Attendees are in Poland first, then Czechia and Slovakia, so their data
stays in the EU ([PRODUCT.md 10](../PRODUCT.md#10-personal-data-and-privacy)). The team is small and
runs no database operations of its own.

## Decision

- A hosted Supabase project per deployed environment, in the EU: production on the Pro plan in
  `eu-central-1`, Dev on a Free project of its own; locally the Supabase CLI's stack.
- OPOS uses Postgres and Supabase Auth alone. The Data API, Realtime, Storage and Edge Functions
  are off, and only the API calls Supabase
  ([0004](0004-make-the-api-the-only-backend-with-the-session-in-cookies.md)).
- The project's settings live in `supabase/config.toml`, pushed only by the deploy workflow.

## Alternatives

- **Sign-in built in house.** Full control, but every flow and its security fixes are ours to
  write and keep.
- **Supabase on the team's VPS.** No vendor in the data path, but the team runs and upgrades
  several services, backs them up and keeps Auth patched.
- **More of Supabase** (the Data API, Realtime, Storage). Less code in the API, but clients would
  reach the database or files around the API, its permissions and its tenant context.

## Consequences

- Upgrades, daily backups and Auth's security fixes come from Supabase; OPOS adds its own backups
  ([0014](0014-back-up-production-beyond-supabase.md)).
- The API depends on Supabase Auth's behaviour, quirks included: what it sends to a confirmed
  address, what a recovery link confirms. The API tests run against the real local stack, not a
  mock.
- `pnpm db:roles` strips Supabase's default grants to `anon`, `authenticated` and `service_role`;
  `pnpm db:verify` checks what a hosted project could add.
- A Free project pauses after 7 days without activity, and the direct connection is IPv6 only on
  it ([0013](0013-connect-to-postgres-directly-with-verified-tls.md)).
- Moving away from Supabase Auth touches only the API, never a frontend.

## Sources

- The team meeting that adopted Supabase, applied in commit c8a7e3b.
- PR #40, "host supabase on supabase.com behind the api as the only bff".
