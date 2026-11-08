# 0002. Isolate tenants by row, enforced by Postgres RLS

- Status: Accepted
- Date: 2026-07-28
- Rationale: reconstructed, to confirm

## Context

Every convention is a tenant, and an organizer of one must neither read nor change anything of
another ([PRODUCT.md 2](../PRODUCT.md#2-mvp-goal-and-end-to-end-flow), step 11). Accounts are global:
one person is a head in one convention, an attendee in another and a speaker in a third, and a user
sees their own schedule across conventions. The platform is free, run by a small team, and expected
to hold many small tenants on one Supabase project.

## Decision

- One schema; every tenant table carries its own `tenant_id`, a composite foreign key to its
  parent's `(id, tenant_id)` and an index starting with `tenant_id`.
- Isolation is enforced in Postgres, not only by a `where` in code: forced RLS with one policy per
  table reading `app.tenant_id`, set per transaction, and failing when it is missing.
- The API runs as `opos_app`, which bypasses nothing and owns nothing; the few reads across tenants
  run as `opos_app_global`, limited to the columns they read; only migrations and the admin's
  scripts run as `postgres`.

The rules are in [ARCHITECTURE.md, Tenant isolation](../ARCHITECTURE.md#tenant-isolation).

## Alternatives

- **A schema or a database per tenant.** Stronger separation, but every migration runs once per
  tenant, the queries across tenants that global accounts need ("my conventions", the personal
  schedule) cross schemas, and Supabase Auth lives in one database anyway. Costly to run for many
  small tenants on a free platform.
- **Row-level with filters in code only.** One forgotten `where` leaks a tenant; nothing in the
  database stops it.
- **RLS with the API on a role that bypasses it.** Simpler grants, but the policies would protect
  nothing the API does.

## Consequences

- A leak needs a broken policy, not a forgotten filter; `pnpm db:verify` and the RLS tests check
  every covered table, its grants and the roles.
- Every tenant request is a transaction that sets the context
  ([0007](0007-run-each-tenant-request-in-one-transaction.md)).
- A table, its policy and its grants are hand-written in the PR of the table; a query across tenants
  is an exception with a stated bound, listed in ARCHITECTURE.md.
- Composite foreign keys keep a child row in its parent's tenant; that costs a wider key on every
  tenant table.
