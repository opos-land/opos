# 0005. Build the API with NestJS and Drizzle on postgres-js

- Status: Accepted
- Date: 2026-07-28
- Rationale: reconstructed, to confirm

## Context

The API carries every rule of the platform: the tenant transaction, permission checks on every
route, sign-in, emails and later payments. Tenant isolation lives in hand-written SQL — policies,
grants, triggers, roles ([0002](0002-isolate-tenants-by-row-under-postgres-rls.md)) — and every
request must run inside one transaction that sets the tenant context. The frontends and the
packages are TypeScript.

## Decision

- NestJS on Express for the API: modules, guards, interceptors and decorators carry the tenant
  transaction, the permission checks and the rate limits around every route.
- Drizzle ORM on postgres-js for data access and migrations: the schema in TypeScript, generated
  migrations for tables, hand-written ones for RLS, grants and triggers.

## Alternatives

- **A lighter HTTP framework** (Express, Fastify or Hono alone). Less framework, but the pipeline
  that guards every route — authentication, the tenant transaction, permissions, the write lock —
  would be assembled by hand.
- **An ORM that hides SQL** (Prisma, TypeORM). Their engines and connection handling make a
  per-request transaction with `set_config` and role-specific connections harder, and RLS still
  needs hand-written SQL.
- **SQL alone.** Full control, but no typed schema shared by the API, the seed and the tests.

## Consequences

- Cross-cutting rules sit in one place: `@RequireTenant`, `@RequireEdition`, `@InTenant`,
  `JwtAuthGuard` and the tenant interceptor, which tests read from the contract.
- Drizzle applies migrations by journal timestamp and compares no text, hence
  `scripts/check-migrations.mjs` and the rule that a merged migration never changes.
- postgres-js connects once per role (`opos_app`, `opos_app_global`, `postgres`), and TLS to the
  hosted database is configured on it
  ([0013](0013-connect-to-postgres-directly-with-verified-tls.md)).
- The contract layer sits on top of NestJS
  ([0006](0006-define-the-api-in-an-orpc-contract.md)).
