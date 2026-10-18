# OPOS — MVP implementation plan

How we build what [PRODUCT.md](PRODUCT.md) describes. The domain model, roles, MVP scope and
product decisions live there — this document is implementation only.

## Table of contents

1. [Architecture](#1-architecture)
2. [Technology stack](#2-technology-stack)
3. [Monorepo structure](#3-monorepo-structure)
4. [Database schema](#4-database-schema)
5. [API contract](#5-api-contract)
6. [Localization](#6-localization)
7. [apps/api](#7-appsapi)
8. [apps/panel](#8-appspanel)
9. [apps/portal](#9-appsportal)
10. [apps/cms](#10-appscms)
11. [Supabase](#11-supabase)
12. [Environment variables](#12-environment-variables)
13. [Local development](#13-local-development)
14. [Deployment](#14-deployment)
15. [Demo data (seed)](#15-demo-data-seed)
16. [Tests](#16-tests)
17. [Smoke test](#17-smoke-test)
18. [Execution rules](#18-execution-rules)

---

## 1. Architecture

Four applications, three shared packages, one backend, and self-hosted Supabase for the database
and authentication.

```mermaid
graph TB
    traefik["Traefik v3 (wildcard TLS)"]
    portal["apps/portal<br>Vite + React"]
    panel["apps/panel<br>Vite + React"]
    api["apps/api<br>NestJS + Drizzle"]
    cms["apps/cms<br>Astro SSR"]
    auth["Supabase Auth<br>GoTrue"]
    packages["packages/contract · packages/db · packages/i18n"]
    pg[("Supabase Postgres 17")]

    traefik -->|"opos.land"| portal
    traefik -->|"panel.opos.land"| panel
    traefik -->|"api.opos.land"| api
    traefik -->|"auth.opos.land"| auth
    traefik -->|"&lt;slug&gt;.opos.land + custom domains"| cms
    portal -.->|"sign-in"| auth
    panel -.->|"sign-in"| auth
    auth -.->|"send-email hook"| api
    portal --> packages
    panel --> packages
    api --> packages
    cms --> packages
    packages --> pg
    auth --> pg
```

| App | Stack | Role | Host |
|---|---|---|---|
| `apps/api` | NestJS + Drizzle + ts-rest | the only application backend; verifies Supabase Auth sessions | `api.opos.land` |
| `apps/panel` | Vite + React + Tailwind + shadcn/ui | organizer panel (SPA) | `panel.opos.land` |
| `apps/portal` | Vite + React + Tailwind + shadcn/ui | landing page, registration, "my conventions" (SPA, mobile-first) | `opos.land` |
| `apps/cms` | Astro SSR (Node adapter) | public convention website, Host -> tenant mapping | `<slug>.opos.land` + custom domains |
| `auth` | Supabase Auth (`supabase/gotrue`) | registration, sign-in, sessions, password reset, Google OAuth | `auth.opos.land` |
| `db` | Supabase Postgres (`supabase/postgres`) | the only database: `public` (OPOS tables) and `auth` (Supabase Auth) | internal network only |

**`packages/contract`** — ts-rest + zod, the single source of truth for the API. No build step,
apps infer types from the TS source.

**`packages/db`** — Drizzle ORM: the `public` schema, migrations, connection factories. Row-level
multi-tenancy through `tenantId` + `editionId` columns, enforced by RLS
([4.6](#46-tenant-isolation--rls-in-postgres)).

**`packages/i18n`** — Lingui configuration, the list of supported locales, locale detection, `Intl`
formatters and message descriptors for API and Supabase Auth error codes. Application catalogs
live next to the applications ([6](#6-localization)).

---

## 2. Technology stack

**Monorepo:** turborepo, pnpm workspaces, TypeScript strict, shared `packages/tsconfig` and
`packages/eslint-config` (including the feature boundary rules).

**Hard-pinned versions:** Node `24.15.0` (`.nvmrc` + `engines.node`), pnpm `11.17.0`
(`packageManager` + corepack). `engineStrict: true` makes a mismatched version abort the install
instead of printing a warning.

**Repository tooling:** lefthook (git hooks), commitlint with `config-conventional`, prettier.

**Backend:** NestJS, Drizzle ORM + postgres-js, `@ts-rest/nest`, `jose` (Supabase JWT
verification), `standardwebhooks` (send-email hook signatures), `@supabase/auth-js` (admin API),
nodemailer, `@nestjs/throttler`.

**Authentication:** Supabase Auth (GoTrue), self-hosted ([11](#11-supabase)). Clients use
`@supabase/auth-js` directly against `auth.opos.land`.

**Frontend SPA:** Vite + React + TypeScript, Tailwind CSS + shadcn/ui, `@ts-rest/react-query`,
`@supabase/auth-js`, react-router, react-hook-form + zod, zustand, `@lingui/react`.

**Frontend SSR:** Astro (Node adapter), `@ts-rest/core`, Tailwind CSS, Host -> tenant middleware,
LRU lookup cache, `@lingui/core` (in `.astro`, without the React layer).

**i18n:** Lingui — `@lingui/core`, `@lingui/react`, `@lingui/macro` macros, `@lingui/cli`.
`Intl` for dates, numbers and currencies.

**Tests:** supertest (integration), Playwright (web e2e, desktop and mobile viewports).

**Infrastructure:** Docker Compose, Traefik v3 (wildcard TLS via DNS-01), self-hosted Supabase —
`supabase/postgres` (PostgreSQL 17) and `supabase/gotrue`, Supabase Studio (dev), Mailpit (dev).

**Design principles:**

- ts-rest contracts with no build step.
- Supabase Auth owns identities and sessions; the API owns everything else.
- Clients never reach the database: no PostgREST, no Realtime, no Storage.
- Row-level multi-tenancy, not schema-per-tenant.
- Isolation enforced by RLS, not only by a `where` clause in code.
- AsyncLocalStorage carries the `tenantContext`.
- Fail fast on a missing `tenantId` — both in ALS and in the RLS policies.
- No user-facing strings outside Lingui macros in application code.
- No AI-generated graphics; screens follow the designer's designs
  ([PRODUCT.md 8](PRODUCT.md#8-design-and-public-image)).
- Every frontend uses a feature-based layout, with boundaries enforced by eslint.

---

## 3. Monorepo structure

```
opos/
  package.json                # root scripts delegating to turbo run
  pnpm-workspace.yaml         # apps/*, packages/*, e2e
  turbo.json                  # task pipeline (3.1)
  .nvmrc                      # 24.15.0
  .prettierrc
  docker-compose.yml          # dev: supabase db + auth + studio, mailpit
  docker-compose.prod.yml     # prod: traefik + apps + supabase db + auth
  lefthook.yml                # hooks: prettier on staged files, commitlint on the message
  commitlint.config.mjs       # types, scopes, header length
  .prettierignore
  .gitignore
  AGENTS.md
  CLAUDE.md
  docs/
    PRODUCT.md
    PLAN.md
  infra/
    supabase/
      db/                # init SQL: Supabase's self-hosting scripts + opos-roles.sql
      .env.example       # dev configuration of the Supabase services
  apps/
    api/
      src/
        main.ts
        app.module.ts
        common/
          als/tenant-context.service.ts
          als/tenant-resolver.middleware.ts
          als/tenant-transaction.interceptor.ts
          guards/jwt-auth.guard.ts
          guards/platform-admin.guard.ts
          guards/tenant-permission.guard.ts
          guards/edition-permission.guard.ts
          decorators/require-tenant.decorator.ts
          decorators/require-edition.decorator.ts
          decorators/current-account.decorator.ts
          filters/http-exception.filter.ts
        modules/
          auth/          # Supabase JWT verification, send-email hook, GoTrue admin client
          accounts/      # MeModule
          superadmin/    # tenants, first head, custom domain
          tenants/       # tenant + tenant_memberships + invitations
          editions/      # editions + edition_memberships
          events/        # programme
          public/        # unauthenticated endpoints for the CMS and the portal
          mail/          # nodemailer + Lingui templates
      test/              # integration tests
      .env.example
      Dockerfile
    panel/
      lingui.config.ts
      src/
        locales/{en,pl}.po
        app/             # router, providers, application layout
        features/
          auth/
          tenants/
          editions/
          program/
            api/         # ts-rest hooks + query keys
            components/
            hooks/
            pages/
            model/       # types, zod schemas, mappings
            index.ts     # the feature's public API
          team/
          account/
        shared/{ui,lib,config}/
      .env.example       # VITE_API_URL, VITE_AUTH_URL
      Dockerfile
    portal/
      lingui.config.ts
      src/
        locales/{en,pl}.po
        app/
        features/{landing,auth,account,attendances}/
        shared/{ui,lib,config}/
      .env.example       # VITE_API_URL, VITE_AUTH_URL
      Dockerfile
    cms/
      lingui.config.ts
      src/
        locales/{en,pl}.po
        middleware.ts
        pages/           # thin Astro routes, delegate to features
        features/{tenant,program,archive}/
        shared/{ui,lib}/
      .env.example       # API_URL
      Dockerfile
  e2e/                   # a workspace package: playwright and the test helpers
    package.json
    playwright.config.ts
    specs/
    fixtures/            # Mailpit client, sign-in as a seeded account
  packages/
    contract/
      src/
        index.ts
        common.ts        # error schemas, pagination, identifiers
        me.ts
        tenants.ts
        editions.ts
        events.ts
        public.ts
        admin.ts
      package.json       # main + types -> src/index.ts
    db/
      src/
        index.ts
        client.ts        # appDb / globalDb / migrationDb
        rls.ts           # set_config + the policy verification query
        schema/
          enums.ts
          accounts.ts    # references auth.users through drizzle-orm/supabase
          tenants.ts
          tenant-memberships.ts
          editions.ts
          edition-memberships.ts
          events.ts
          attendees.ts
        seed.ts
      drizzle/           # drizzle-kit migrations + the hand-written RLS and trigger migrations
      drizzle.config.ts  # schemaFilter: ['public']
      package.json       # main + types -> src/index.ts
    i18n/
      src/
        index.ts         # locale list, detection, catalog activation, Intl formatters
        errors.ts        # API and Supabase Auth code -> MessageDescriptor mapping
      locales/{en,pl}.po        # shared messages: API errors, emails
      lingui.config.base.ts
      package.json       # main + types -> src/index.ts, catalogs compiled separately
    tsconfig/
      base.json, node.json, react.json, astro.json
    eslint-config/
      index.js
```

### 3.1 Turbo tasks

Root scripts in `package.json` only delegate — `"build": "turbo run build"` — and task logic lives
in the packages' own scripts. The exceptions are `prepare` (lefthook) and `format`/`format:check`
(prettier over the whole repository); those do not go through turbo.

`packages/contract`, `packages/db` and `packages/i18n` have no build step, so `^build` gives the
task graph no edges towards them. The `transit` task supplies those edges: declared only in
`turbo.json`, it matches no script in any package, and `typecheck`, `lint` and `test` depend on
it. A change in `packages/contract/src` then invalidates the cache of every consumer, and the
tasks still run in parallel.

| Task | dependsOn | outputs | cache |
|---|---|---|---|
| `transit` | `^transit` | — | — |
| `build` | `^build`, `i18n:compile` | `dist/**` | yes |
| `dev` | `i18n:compile` | — | no; `persistent: true` |
| `typecheck` | `transit` | — | yes |
| `lint` | `transit` | — | yes |
| `test` | `transit` | — | yes |
| `test:e2e` | — | — | no; runs against the full stack |
| `i18n:extract` | — | — | no; appends messages to the `.po` files |
| `i18n:compile` | `^i18n:compile` | compiled catalogs (`src/locales/*.mjs`, `locales/*.mjs`) | yes |
| `db:generate`, `db:migrate`, `db:push`, `db:seed`, `db:verify` | — | — | no; the database and generated migrations are side effects |
| `db:studio` | — | — | no; `persistent: true` |

- The `db:*` tasks exist only in `packages/db`, `test:e2e` only in `e2e`.
- Frontend build-time variables (`VITE_*`) enter task hashes through turbo's framework inference.
  The API's variables are read at runtime and stay out of the hash
  ([12](#12-environment-variables)).

### 3.2 Frontend application layout

The panel, the portal and the CMS share one layout: **feature based**. No directory for a
technical layer (`components/`, `hooks/`) exists at application level — those directories live
inside a feature.

```
src/
  app/                  # bootstrap: router, providers, layout
  features/
    <feature>/
      api/              # ts-rest hooks, query keys, mutations
      components/       # components belonging to this feature only
      hooks/
      pages/            # views mounted into the router
      model/            # types, zod schemas, mappings
      index.ts          # the feature's public API — the only thing others can see
  shared/
    ui/                 # shadcn/ui and components with no domain knowledge
    lib/                # API client, auth client, i18n, formatters, storage
    config/
```

Import rules, enforced by the `no-restricted-paths` rule in `packages/eslint-config`:

| From | To | Allowed |
|---|---|---|
| `features/x` | `shared/`, `packages/*` | yes |
| `features/x` | `features/y/index.ts` | yes |
| `features/x` | the internals of `features/y` | **no** |
| `shared/` | `features/` | **no** |
| `app/` | anywhere | yes |

Routes stay thin: a file in Astro's `pages/` holds no logic, it only mounts a view from the right
feature.

A feature never reaches the database or `fetch` directly: all network traffic goes through that
feature's `api/`, built on the API client and the auth client from `shared/lib`.

`shared/ui` starts from shadcn/ui, restyled to the designer's tokens (colours, typography,
spacing, radii). No image or illustration in `shared/ui` or in a feature is AI-generated
([18](#18-execution-rules)).

---

## 4. Database schema

PostgreSQL 17 from the `supabase/postgres` image. Every OPOS table lives in the `public` schema and
has `id uuid primary key default gen_random_uuid()`, `createdAt timestamptz not null default
now()`, `updatedAt timestamptz not null default now()` — `accounts.id` being the one exception
([4.2](#42-global-tables)).

The `auth` schema belongs to Supabase Auth: it creates and migrates it on start. Our migrations
never write to it; `drizzle.config.ts` sets `schemaFilter: ['public']`, and `accounts` references
`auth.users` through `authUsers` from `drizzle-orm/supabase`.

The [glossary](PRODUCT.md#3-glossary) terms map onto tables as follows:

| Term | Carrier |
|---|---|
| admin | `accounts.isPlatformAdmin = true` |
| org, head | `tenant_memberships` (+ optionally `edition_memberships`) |
| user | `auth.users` + `accounts` + rows in `attendees` |
| tenant | `tenants` |
| edition | `editions` |
| event | `events` |
| attendee | `attendees` |

### 4.1 Enums

```ts
permissionLevel = pgEnum('permission_level', ['none', 'read', 'write'])
tenantRole      = pgEnum('tenant_role',      ['head', 'org'])
```

`locale` is not an enum — the list of supported languages lives in `packages/i18n` and in
`SUPPORTED_LOCALES`, validated by zod. Adding a language requires no migration.

### 4.2 Global tables

Identities, passwords, sessions, refresh tokens and confirmation and recovery tokens live in
Supabase Auth's tables (`auth.users`, `auth.identities`, `auth.sessions`, `auth.refresh_tokens`).
OPOS keeps the profile only.

**`accounts`**

| column | type | notes |
|---|---|---|
| `id` | uuid | primary key, `references auth.users(id) on delete cascade`; equals the JWT `sub` |
| `email` | text | unique, lowercase; mirrored from `auth.users.email` |
| `firstName` | text | nullable |
| `lastName` | text | nullable |
| `isPlatformAdmin` | boolean | default `false` |
| `locale` | text | nullable; the user's choice, `null` = detect from `Accept-Language` |

Triggers on `auth.users`, in a hand-written migration, as `security definer` functions owned by
`opos_migrator`:

| Trigger | Effect |
|---|---|
| `after insert` | inserts `accounts`: `email`; `firstName`, `lastName`, `locale` from `raw_user_meta_data` (`first_name`, `last_name`, `locale` sent by the portal on sign-up; for Google `full_name` split on the first space) |
| `after update of email` | updates `accounts.email` |

Deleting a user in Supabase Auth removes `accounts`, and with it every row that references it.

### 4.3 Tenant-level tables

**`tenants`** — `slug` (unique, lowercase, `^[a-z0-9-]{3,40}$`), `name`,
`customDomain` (unique, nullable), `defaultLocale` (text, default `pl`),
`timezone` (IANA text, default `Europe/Warsaw`).

**`tenant_memberships`** — `accountId` (FK cascade), `tenantId` (FK cascade), `role`,
`settingsAccess`, `brandingAccess`, `shopConfigAccess` (default `none`).
Unique `(accountId, tenantId)` and `(id, tenantId)`. Index on `tenantId`.

### 4.4 Edition-level tables

**`editions`** — `tenantId` (FK cascade), `slug`, `name`, `startsAt`, `endsAt`,
`isActive` (default `false`), `isPublished` (default `false`).
Unique `(tenantId, slug)` and `(id, tenantId)`. Partial unique index `(tenantId) WHERE isActive`.

**`edition_memberships`** — `tenantId`, `tenantMembershipId`, `editionId` (FK cascade),
`programAccess`, `websiteContentAccess`, `ticketsAccess` (default `none`).
Unique `(tenantMembershipId, editionId)`. Composite foreign keys `(tenantMembershipId, tenantId)`
and `(editionId, tenantId)`.

**`events`** — `tenantId`, `editionId` (FK cascade), `title`, `description` (nullable),
`startsAt`, `endsAt`. Index `(tenantId, editionId, startsAt)`.

**`attendees`** — `accountId`, `tenantId`, `editionId` (FK cascade), `firstName`, `lastName`.
Unique `(accountId, editionId)`. Indexes `(tenantId, editionId)` and `(accountId)`.

Every RLS-covered table has an index starting with `tenantId`.

### 4.5 Invariants

1. **Exactly one `isActive=true` edition per tenant** — a transactional switch plus a partial
   unique index.
2. **At least one `head` per tenant** — checked in the service and by an
   `AFTER DELETE OR UPDATE` trigger on `tenant_memberships`.
3. **An edition in `edition_memberships` belongs to the same tenant as the `tenant_membership`** —
   enforced by composite foreign keys.
4. **Writes to tenant-level tables always carry the `tenantId` from ALS** — `scopedDb()` throws on
   an empty context, and `WITH CHECK` in the RLS policies closes it on the database side.
5. **Every `auth.users` row has exactly one `accounts` row** — the insert trigger and the cascading
   foreign key.

### 4.6 Tenant isolation — RLS in Postgres

#### Database roles

| Role | Attributes | Used by |
|---|---|---|
| `opos_migrator` | owner of the `public` tables, `BYPASSRLS` | `pnpm db:migrate`, `pnpm db:seed` |
| `opos_app` | DML only, no `BYPASSRLS` | runtime API inside a tenant context |
| `opos_app_global` | DML only, `BYPASSRLS` | `GlobalDbService` exclusively |

The three roles are created by `infra/supabase/db/opos-roles.sql`, which the `db` container runs
as `supabase_admin` when it initializes an empty data directory. Supabase's own roles
(`supabase_auth_admin`, `authenticator`, `anon`, `authenticated`, `service_role`) come from the
image; `anon` and `authenticated` hold no privileges on the `public` schema.

Every RLS-covered table also gets `FORCE ROW LEVEL SECURITY`.

#### Covered tables

`tenants`, `tenant_memberships`, `editions`, `edition_memberships`, `events`, `attendees`.

The global table `accounts` stays outside RLS — it is protected by filtering on the `accountId`
from the JWT. The `auth` schema is accessed only by Supabase Auth.

#### Tenant context

```sql
select set_config('app.tenant_id', $1, true);   -- SET LOCAL, dropped when the transaction ends
```

The third argument `true` is mandatory. Every request inside a tenant context runs in a
transaction.

#### Policy shape

```sql
alter table events enable row level security;
alter table events force  row level security;

create policy tenant_isolation on events
  using      (tenant_id = current_setting('app.tenant_id')::uuid)
  with check (tenant_id = current_setting('app.tenant_id')::uuid);

grant select, insert, update, delete on events to opos_app;
```

The same for the remaining tables; for `tenants` the condition is `id = current_setting(...)`.
`current_setting` without the `missing_ok` argument — a missing context has to raise an error, not
return zero rows.

#### Cross-tenant queries

Only through `GlobalDbService` on the `opos_app_global` role. The complete list:

| Query | Constraint |
|---|---|
| tenant lookup by slug or host | returns only `id`, `slug`, `name`, `customDomain`, `defaultLocale`, `timezone` |
| `GET /me/memberships` | `where account_id = <account from the JWT>` |
| `GET /me/attendances` | `where account_id = <account from the JWT>` |
| `GET /admin/tenants` | `PlatformAdminGuard` |

Every query in `GlobalDbService` carries either an `accountId` condition or the admin guard; adding
another one requires an entry in this table. The rest of the system, including `PublicModule`,
resolves the tenant first and then works on `opos_app`.

#### Migrations and verification

RLS policies and the `auth.users` triggers go into hand-written migrations
(`drizzle-kit generate --custom`). `pnpm db:verify` runs:

```sql
select c.relname from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id'
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
```

The result must be empty.

---

## 5. API contract

`packages/contract`, ts-rest + zod. Error schema:
`{ code: string, params?: Record<string, string | number>, message: string }`.

`code` is a stable identifier (for example `edition.already-active`) the client uses to pick a
translation from the catalog; `params` feed the interpolation. `message` is English, meant for logs
and debugging — **it never reaches the UI**.

Statuses: `400` validation, `401` missing or stale token, `403` insufficient permissions,
`404` does not exist **or belongs to another tenant**, `409` invariant conflict.

### 5.1 `auth` — Supabase Auth

Registration, sign-in, sessions and password reset are not part of the OPOS contract. The portal
and the panel call Supabase Auth at `auth.opos.land` through `@supabase/auth-js`:

| Operation | `auth-js` call | Notes |
|---|---|---|
| registration | `signUp({ email, password, options: { data: { first_name, last_name, locale }, emailRedirectTo } })` | the account works after the confirmation link |
| sign-in | `signInWithPassword({ email, password })` | `email_not_confirmed` until confirmed |
| Google | `signInWithOAuth({ provider: 'google', options: { redirectTo } })` | PKCE; return through `/auth/callback` ([7.5](#75-google-oauth)) |
| code exchange | `exchangeCodeForSession(code)` | Google return, email confirmation, recovery link |
| refresh | `autoRefreshToken: true` | rotation on the Supabase Auth side |
| sign-out | `signOut()` / `signOut({ scope: 'others' })` | |
| password reset | `resetPasswordForEmail(email, { redirectTo })`, then `updateUser({ password })` | [7.6](#76-password-reset) |

Supabase Auth errors carry an `error_code` (`invalid_credentials`, `email_not_confirmed`,
`user_already_exists`, `weak_password`, `over_email_send_rate_limit`, ...); the client translates
them the same way as API codes ([6](#6-localization)).

Outside the ts-rest contract: `POST /hooks/send-email` — called by Supabase Auth only, verified by
a Standard Webhooks signature ([11](#11-supabase)).

### 5.2 `me` — requires JWT

| Method | Path | Description |
|---|---|---|
| GET | `/me` | account profile |
| PATCH | `/me` | change `firstName`, `lastName`, `locale` |
| DELETE | `/me` | delete the account; `409` when it is some tenant's last `head`; `401` without a sign-in from the last 5 minutes |
| GET | `/me/memberships` | tenants with role and permissions, edition-level included |
| GET | `/me/attendances` | "my conventions" |
| POST | `/me/attendances` | `{ tenantSlug, editionSlug, firstName, lastName }`; `409` on a repeat sign-up, `404` for an unpublished edition |
| DELETE | `/me/attendances/:attendeeId` | withdraw |

### 5.3 `tenants` — JWT + `X-Tenant-Slug`

| Method | Path | Required permission |
|---|---|---|
| GET | `/tenants/current` | membership |
| PATCH | `/tenants/current` | `settings=write` (`name`, `slug`, `defaultLocale`, `timezone`) |
| GET | `/tenants/current/members` | `settings>=read` |
| POST | `/tenants/current/members` | `settings=write` |
| PATCH | `/tenants/current/members/:membershipId` | `settings=write` + anti-escalation |
| DELETE | `/tenants/current/members/:membershipId` | `settings=write` + anti-escalation |

Invitations — without the tenant header:

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/invitations/preview?token=` | none | convention name and the invitee's email |
| POST | `/invitations/accept` | JWT | creates `tenant_membership` + `edition_memberships` from the token |

### 5.4 `editions` — JWT + `X-Tenant-Slug`

| Method | Path | Required permission |
|---|---|---|
| GET | `/editions` | membership |
| POST | `/editions` | `settings=write` |
| GET | `/editions/:editionId` | membership |
| PATCH | `/editions/:editionId` | `settings=write` |
| DELETE | `/editions/:editionId` | `settings=write`; `409` when the edition is active |
| POST | `/editions/:editionId/activate` | `settings=write` |
| GET | `/editions/:editionId/members` | `settings>=read` |
| PUT | `/editions/:editionId/members/:tenantMembershipId` | `settings=write` + anti-escalation |
| DELETE | `/editions/:editionId/members/:tenantMembershipId` | `settings=write` |

### 5.5 `events` — JWT + `X-Tenant-Slug` + edition permission

| Method | Path | Required permission |
|---|---|---|
| GET | `/editions/:editionId/events` | `program>=read` |
| POST | `/editions/:editionId/events` | `program=write` |
| PATCH | `/editions/:editionId/events/:eventId` | `program=write` |
| DELETE | `/editions/:editionId/events/:eventId` | `program=write` |

Validation: `endsAt > startsAt`, `title` 3–200 characters, `description` up to 5000 characters.

### 5.6 `admin` — JWT + `isPlatformAdmin`

| Method | Path | Description |
|---|---|---|
| GET | `/admin/tenants` | list of all tenants |
| POST | `/admin/tenants` | `{ slug, name, headEmail }` — creates a tenant and appoints its first `head` |
| PUT | `/admin/tenants/:tenantId/domain` | sets or clears `customDomain` |

### 5.7 `public` — unauthenticated

| Method | Path | Description |
|---|---|---|
| GET | `/public/tenant?host=` | tenant by `Host`; `404` when unknown |
| GET | `/public/tenants/:slug/editions` | published editions, descending by `startsAt` |
| GET | `/public/tenants/:slug/editions/active` | the active and published edition |
| GET | `/public/tenants/:slug/editions/:editionSlug` | a single published edition |
| GET | `/public/tenants/:slug/editions/:editionSlug/events` | programme, ascending by `startsAt` |
| GET | `/public/tenants/:slug/editions/:editionSlug/events/:eventId` | programme item details |

The `isPublished = true` filter lives in the repository, not in the controller.

---

## 6. Localization

Lingui. The source language is **English** — messages are written in code in English, inside
macros, and they are their own identifiers. There are no separate keys to invent or misspell.

Supported locales: `en` (source) and `pl`. Czech joins with the Czech market beyond the MVP — a
new locale is another set of `.po` catalogs, no migration. The default interface language is `pl`
(`DEFAULT_LOCALE`) — a different thing from the source language. A missing translation falls back
to the source text, that is English; an identifier never appears on screen.

### Macros

```tsx
import { Trans, useLingui } from '@lingui/react/macro'

<Trans>Sign up for this edition</Trans>

const { t } = useLingui()
placeholder={t`Search the programme`}
```

Plurals only through the `plural` macro — CLDR rules cover the plural forms of Polish that the
English original does not have.

### Catalogs

One catalog per application plus a shared one:

| Catalog | Contains | Extracted from |
|---|---|---|
| `apps/<app>/src/locales/*.po` | that application's messages | `apps/<app>/src` |
| `packages/i18n/locales/*.po` | API and Supabase Auth errors, email content | `packages/i18n/src` |

The per-application split keeps the CMS from pulling in the panel's messages. Compiled catalogs are
loaded through a dynamic import per locale.

### Workflow

| Command | Effect |
|---|---|
| `pnpm i18n:extract` | scans the sources, appends new messages to the `.po` of every locale |
| `pnpm i18n:compile` | turns `.po` files into runtime catalogs |
| `pnpm i18n:extract -- --check` | in CI: code out of sync with the catalogs fails the run |

`i18n:compile` is a dependency of the `dev` and `build` tasks in turbo ([3.1](#31-turbo-tasks)) —
otherwise the application starts with stale messages.

### Locale detection

| Context | Order |
|---|---|
| panel, portal — signed in | `accounts.locale` -> `Accept-Language` -> `DEFAULT_LOCALE` |
| portal — signed out | `Accept-Language` -> `DEFAULT_LOCALE` |
| CMS | `tenants.defaultLocale`, regardless of the browser |
| emails | the recipient's `accounts.locale` -> `locale` from the sign-up metadata -> for an unknown address the inviting `tenants.defaultLocale` -> `DEFAULT_LOCALE` |

### API errors

The API returns a `code`, never a sentence. `packages/i18n/src/errors.ts` maps a `code` onto a
descriptor from the `msg` macro, and the client renders it through `i18n._(descriptor, params)`.
Supabase Auth's `error_code` values are mapped in the same file under `auth.<error_code>`; an
unmapped one renders a generic "Something went wrong" message. A new `code` in the contract
without an entry in that map fails a test ([16.1](#161-api-integration-tests)).

Emails are rendered by the API — it activates the recipient's catalog and composes the content
through `@lingui/core`. That includes Supabase Auth's confirmation, recovery and email change
messages, which reach the API through the send-email hook ([11](#11-supabase)).

### Formatting

- Dates and times: `Intl.DateTimeFormat` with a locale **and** an explicit time zone.
- Programme times are always formatted in `tenants.timezone`, never in the browser's zone.
- Numbers and currencies: `Intl.NumberFormat`.

### Tenant content

Names, programme item descriptions and CMS content are single-language — in the tenant's
`defaultLocale`. They do not pass through Lingui: they are data, not interface messages.

---

## 7. `apps/api`

### 7.1 Modules

| Module | Contents |
|---|---|
| `AuthModule` | `JwtAuthGuard` (Supabase JWT verification), the `POST /hooks/send-email` controller, the GoTrue admin client |
| `MeModule` | profile, memberships, edition sign-ups, account deletion |
| `SuperadminModule` | tenants, first `head`, custom domain; `PlatformAdminGuard` |
| `TenantsModule` | tenant data, `tenant_memberships`, invitations |
| `EditionsModule` | edition CRUD, activation, `edition_memberships` |
| `EventsModule` | programme item CRUD |
| `PublicModule` | unauthenticated endpoints for the CMS and the portal |
| `MailModule` | nodemailer + Lingui templates per locale: Supabase Auth emails and invitations ([6](#6-localization)) |

### 7.2 Tenant context

`TenantResolverMiddleware` (global, ahead of the guards):

1. Reads `X-Tenant-Slug`. No header -> empty context.
2. Loads the tenant by slug through `GlobalDbService`; an unknown slug -> `404`.
3. Loads the current account's `tenant_membership`.
4. Opens ALS with `{ tenantId, tenantSlug, membership, account }`.

`TenantTransactionInterceptor` — for requests carrying a tenant context:

1. Opens a transaction on the `opos_app` pool.
2. `select set_config('app.tenant_id', <tenantId>, true)`.
3. Puts the transaction handle into ALS; repositories take it from there.
4. Commit on `2xx`, rollback on an exception.

Outbound I/O (SMTP, the GoTrue admin API) happens outside the transaction.

`packages/db` exports `appDb()`, `globalDb()` and `migrationDb()`.

### 7.3 Permissions — guards

The permission model is described in [PRODUCT.md](PRODUCT.md#5-roles-and-permissions).
Implementation:

```
rank: none=0, read=1, write=2

checkTenant(resource, required):
  if account.isPlatformAdmin              -> allow
  m = ALS.tenantMembership
  if !m                                   -> 403
  if m.role == 'head'                     -> allow
  if rank(m[resource]) >= rank(required)  -> allow
  -> 403

checkEdition(editionId, resource, required):
  edition = load(editionId)
  if edition.tenantId != ALS.tenantId     -> 404
  if account.isPlatformAdmin              -> allow
  m = ALS.tenantMembership; if !m         -> 403
  if m.role == 'head'                     -> allow
  em = editionMembership(m.id, editionId)
  if !em                                  -> 403
  if rank(em[resource]) >= rank(required) -> allow
  -> 403
```

```ts
@UseGuards(JwtAuthGuard, TenantPermissionGuard)
@RequireTenant('settings', 'write')
async updateTenant() { ... }

@UseGuards(JwtAuthGuard, EditionPermissionGuard)
@RequireEdition('program', 'write')   // editionId taken from the route param
async createEvent() { ... }

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
async createTenant() { ... }
```

`EditionPermissionGuard` first checks that the edition belongs to the tenant from ALS and returns
`404` on a mismatch.

### 7.4 Authorization

Sessions are issued by Supabase Auth ([11](#11-supabase)):

- Access token: a JWT signed HS256 with `JWT_SECRET`, shared by Supabase Auth and the API; TTL
  **15 minutes** (`GOTRUE_JWT_EXP=900`).
- Refresh token: single-use, rotated on every refresh
  (`GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true`, reuse interval 10 s); reusing a spent
  token outside that interval revokes the whole session.
- Passwords: hashed by Supabase Auth; minimum length 8 (`GOTRUE_PASSWORD_MIN_LENGTH`).
- Email confirmation is required (`GOTRUE_MAILER_AUTOCONFIRM=false`); an unconfirmed account gets
  `email_not_confirmed` on sign-in.

**`JwtAuthGuard`** verifies the `Authorization: Bearer` token with `jose`: signature, `exp`,
`aud = authenticated`, `iss = <AUTH_URL>`. `sub` is `accounts.id`; the guard loads that row and
puts it into the request — `isPlatformAdmin` and `locale` come from the database, not from the
token. A valid token without an `accounts` row -> `401`. The JWT holds no `tenantId`.

**Session in the browser** — `@supabase/auth-js` with `flowType: 'pkce'`, `persistSession: true`,
`autoRefreshToken: true`, stored in the `localStorage` of the application's own origin under a
separate key (`opos-portal-auth`, `opos-panel-auth`). The portal and the panel never share a
session.

Because the session is readable by scripts on that origin, the portal and the panel are served
with a strict Content Security Policy: `script-src 'self'`, no inline scripts,
`connect-src 'self' <API_URL> <AUTH_URL>`, `frame-ancestors 'none'`.

**Recent sign-in** — `DELETE /me` requires an `amr` entry in the JWT with a timestamp younger than
5 minutes; the client gets one by confirming the password (`signInWithPassword`) or by signing in
with Google again.

### 7.5 Google OAuth

Supabase Auth's Google provider, PKCE flow:

1. The portal or the panel calls `signInWithOAuth({ provider: 'google', options: { redirectTo } })`
   with `redirectTo = <app URL>/auth/callback`.
2. Supabase Auth redirects to Google; Google comes back to `https://auth.opos.land/callback`.
3. Supabase Auth creates or links the user and redirects to `redirectTo` with `?code=`.
4. `/auth/callback` calls `exchangeCodeForSession(code)` and receives the session.

`redirectTo` must match `GOTRUE_URI_ALLOW_LIST` exactly ([11](#11-supabase)); anything else falls
back to `GOTRUE_SITE_URL`. Supabase Auth never redirects to an arbitrary address from the request.

Required behaviour when the email already exists, checked in the smoke test
([17](#17-smoke-test)):

| State of the account with that email | Behaviour |
|---|---|
| does not exist | a new user, confirmed; the trigger creates `accounts` |
| exists, confirmed | the Google identity is attached to the same `auth.users.id`; the password keeps working |
| exists, unconfirmed | the Google sign-in takes the account over: the unconfirmed password does not let anyone in |

### 7.6 Password reset

1. The portal calls `resetPasswordForEmail(email, { redirectTo: <PORTAL_URL>/reset-password })`.
   Supabase Auth answers the same way for an unknown address, so the form reveals nothing about
   registered emails. For a known address it calls the send-email hook with
   `email_action_type = recovery`; the API sends the link in the recipient's locale. The link is
   valid for 1 hour (`GOTRUE_MAILER_OTP_EXP=3600`) and works once.
2. `/reset-password` exchanges the `code` for a session, sets the new password with
   `updateUser({ password })` and calls `signOut({ scope: 'others' })` — every other session ends.
3. The flow works for a Google-only account as well: completing it adds password sign-in next to
   Google.

### 7.7 Organizer invitations

An invitation is a signed JWT (`INVITE_SECRET`, TTL 7 days) with the payload
`{ tenantId, email, role, tenantPermissions, editionPermissions }`.

- Email of a known account (`accounts.email`) -> the membership is created immediately, the email
  is a notification.
- Unknown email -> an email with a `panel.opos.land/invitation?token=...` link; after registering
  or signing in, `POST /invitations/accept` creates the membership.
- Permissions from the token go through the anti-escalation check.

Invitation emails are sent by `MailModule`, not by Supabase Auth.

### 7.8 CORS

Allowed `Origin`: `opos.land` and `panel.opos.land` — an explicit list, never `*` and never a
reflected header. Allowed headers: `Authorization`, `Content-Type`, `X-Tenant-Slug`,
`Accept-Language`. `credentials: false` — the API sets and reads no cookies.

`POST /hooks/send-email` is called server to server and needs no CORS; it rejects every request
without a valid signature.

### 7.9 Rate limiting

`@nestjs/throttler`, counters in process memory.

| Scope | Limit |
|---|---|
| `GET /invitations/preview` | 30 / hour per IP |
| `POST /tenants/current/members` | 20 / hour per tenant |
| the rest of the API | 300 / min per account |

A `429` response with `Retry-After`. The API runs with `trust proxy` — the client address comes
from `X-Forwarded-For`.

Sign-up, sign-in, refresh and recovery are limited by Supabase Auth and by Traefik in front of it
([11](#11-supabase)).

---

## 8. `apps/panel`

SPA (Vite + React), `@ts-rest/react-query`, `@supabase/auth-js` for the session, UI state in
`zustand`, forms with `react-hook-form` + zod using schemas from `packages/contract`.
Feature-based layout ([3](#3-monorepo-structure)). Desktop-first; usable from a tablet.

| Feature | Scope |
|---|---|
| `auth` | sign-in, Google return, invitation acceptance |
| `tenants` | convention picker, dashboard, settings, language and time zone |
| `editions` | edition list, creation, activation, publication |
| `program` | the edition's programme items |
| `team` | convention team and edition permissions |
| `account` | account menu, language switcher |

| Path | Screen |
|---|---|
| `/login` | organizer sign-in: email + password, Google button |
| `/auth/callback` | receives `code` from Supabase Auth, calls `exchangeCodeForSession` |
| `/invitation` | invitation acceptance (`?token=`) |
| `/` | convention picker; redirect when there is a single membership |
| `/:tenantSlug` | tenant dashboard |
| `/:tenantSlug/editions` | edition list + creation |
| `/:tenantSlug/editions/:editionSlug` | edition data, activation, publication |
| `/:tenantSlug/editions/:editionSlug/program` | programme items |
| `/:tenantSlug/editions/:editionSlug/access` | team members' edition permissions |
| `/:tenantSlug/team` | `tenant_memberships` — list, invitations, permissions |
| `/:tenantSlug/settings` | name, slug, public website language, time zone; custom domain read-only |

- An interceptor attaches `Authorization: Bearer <access token from auth-js>`, `X-Tenant-Slug` and
  `Accept-Language` based on the active locale.
- Language switcher in the account menu; the choice goes to `PATCH /me` and stays on the account.
- The compiled Lingui catalog is loaded through a dynamic import when the locale changes.
- `GET /me/memberships` after sign-in populates the permission store.
- The sidebar hides sections with a `none` permission; at `read` the save buttons are `disabled`.
- A `403` from the API -> a "no permissions" screen.
- Application start restores the session with `getSession()`, refreshing it when it has expired —
  until that resolves the user sees a loading view, not the sign-in screen.
- `401` from the API -> one `refreshSession()` and a retry; on failure, sign-out.

---

## 9. `apps/portal`

Feature-based layout ([3](#3-monorepo-structure)). **Mobile-first:** it is the attendees' only way
into OPOS on a phone, so every screen is designed for a 360 px wide viewport first and works up to
desktop.

| Feature | Scope |
|---|---|
| `landing` | the platform's home page, the privacy policy |
| `auth` | registration, email confirmation, sign-in, password reset, Google return |
| `account` | account settings, language, account deletion |
| `attendances` | "my conventions", edition sign-up, withdrawal |

| Path | Screen |
|---|---|
| `/` | OPOS platform landing page |
| `/privacy` | the privacy policy; linked from the registration form and the footer |
| `/register` | email + password + first and last name, Google button; after submitting — "check your inbox" |
| `/login` | the same without the profile fields; `email_not_confirmed` offers to resend the link |
| `/auth/callback` | receives `code` (Google return, email confirmation), calls `exchangeCodeForSession` |
| `/forgot-password` | password reset request; always confirms that the message was sent |
| `/reset-password` | new password form, opened from the recovery link (`?code=`) |
| `/account` | account settings, interface language, account deletion |
| `/my-conventions` | the list of editions the account is signed up for |
| `/join/:tenantSlug/:editionSlug` | edition sign-up; unauthenticated -> sign-in and back here |

`/join/...` is reached from the "Sign up" button on the public convention website.

**Account deletion:** `DELETE /me` after confirming with a password or a repeated Google sign-in
([7.4](#74-authorization)). The API deletes the user through the GoTrue admin API
(`DELETE /admin/users/:id`); `accounts` cascades from `auth.users`, and `tenant_memberships`,
`edition_memberships` and `attendees` cascade from `accounts`. `409` when the account is some
tenant's last `head`.

---

## 10. `apps/cms`

Astro SSR (Node adapter).

**Middleware** (`src/middleware.ts`): reads `Host`, queries `GET /public/tenant?host=`, keeps the
result in an LRU cache (500 entries, TTL 60 s) and puts the tenant into `Astro.locals` along with
its `defaultLocale` and `timezone`. An unknown host -> `404`.

The page renders in the tenant's language: `<html lang="{tenant.defaultLocale}">`, texts from the
`cms` catalog, programme times formatted in `tenant.timezone`. No language switcher.

In `.astro` files we use `@lingui/core` without the React layer; the catalog is activated in the
middleware, right after the tenant is resolved.

Feature-based layout ([3](#3-monorepo-structure)): `tenant` (resolution and layout),
`program` (list and item details), `archive` (past editions). Files in `src/pages/` are nothing but
the routing Astro requires — the logic sits in features.

| Path | Content |
|---|---|
| `/` | the active edition's home page + a "Sign up" button |
| `/program` | the active edition's programme, grouped by day |
| `/program/:eventId` | programme item details |
| `/archive` | published editions, descending by date |
| `/archive/:editionSlug` | a past edition's programme |

No active published edition -> a "Preparations under way" message and a link to the archive.
An unpublished edition under a direct URL -> `404`.

The "Sign up" button links to `https://opos.land/join/<tenant>/<edition>`.

---

## 11. Supabase

Self-hosted on the VPS, reduced to the services OPOS uses:

| Service | Image | Role | Reachable |
|---|---|---|---|
| `db` | `supabase/postgres` (17.x) | the only Postgres: `public` and `auth` schemas | internal network; `:5432` on `localhost` in dev |
| `auth` | `supabase/gotrue` (v2.x) | Supabase Auth | `auth.opos.land`; `localhost:9999` in dev |
| `studio`, `meta` | `supabase/studio`, `supabase/postgres-meta` | database browser | dev only, `localhost:54323` |

Not deployed: Kong, PostgREST, Realtime, Storage, Edge Functions, Analytics, Supavisor. Traefik
routes `auth.opos.land` straight to GoTrue, and clients use `@supabase/auth-js` with
`url: AUTH_URL` — not `supabase-js`, which expects Kong's `/auth/v1` prefix.

Image tags are pinned exactly in both compose files, to the versions from Supabase's
self-hosting compose. An upgrade bumps `db` and `auth` together, after a `pg_dump`. GoTrue
migrates the `auth` schema itself on start.

`infra/supabase/db/` holds the init SQL from Supabase's self-hosting setup (roles, JWT settings),
pinned to the same image version, plus `opos-roles.sql` ([4.6](#46-tenant-isolation--rls-in-postgres)).

### Supabase Auth configuration

| Variable | Value |
|---|---|
| `API_EXTERNAL_URL`, `GOTRUE_JWT_ISSUER` | `AUTH_URL` (`https://auth.opos.land`) |
| `GOTRUE_DB_DATABASE_URL` | `postgres://supabase_auth_admin:...@db:5432/postgres` |
| `GOTRUE_SITE_URL` | `PORTAL_URL` |
| `GOTRUE_URI_ALLOW_LIST` | `<PORTAL_URL>/auth/callback,<PORTAL_URL>/reset-password,<PANEL_URL>/auth/callback` |
| `GOTRUE_JWT_SECRET` | `JWT_SECRET`, the same value as in the API |
| `GOTRUE_JWT_AUD`, `GOTRUE_JWT_DEFAULT_GROUP_NAME` | `authenticated` |
| `GOTRUE_JWT_ADMIN_ROLES` | `service_role` |
| `GOTRUE_JWT_EXP` | `900` |
| `GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED` | `true` |
| `GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL` | `10` |
| `GOTRUE_PASSWORD_MIN_LENGTH` | `8` |
| `GOTRUE_DISABLE_SIGNUP` | `false` |
| `GOTRUE_EXTERNAL_EMAIL_ENABLED` | `true` |
| `GOTRUE_MAILER_AUTOCONFIRM` | `false` |
| `GOTRUE_MAILER_OTP_EXP` | `3600` |
| `GOTRUE_EXTERNAL_PHONE_ENABLED`, `GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED` | `false` |
| `GOTRUE_EXTERNAL_GOOGLE_ENABLED` | `true` |
| `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID`, `GOTRUE_EXTERNAL_GOOGLE_SECRET` | the Google OAuth client |
| `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI` | `<AUTH_URL>/callback` |
| `GOTRUE_HOOK_SEND_EMAIL_ENABLED` | `true` |
| `GOTRUE_HOOK_SEND_EMAIL_URI` | prod `https://api.opos.land/hooks/send-email`; dev `http://host.docker.internal:3001/hooks/send-email` |
| `GOTRUE_HOOK_SEND_EMAIL_SECRETS` | `v1,whsec_<base64>`, the same value as the API's `SEND_EMAIL_HOOK_SECRET` |
| `GOTRUE_RATE_LIMIT_HEADER` | `X-Forwarded-For` |

GoTrue accepts plain `http` hook URLs only for `localhost` and `host.docker.internal`, so in
production the hook goes through Traefik over HTTPS. In dev the `auth` container needs
`extra_hosts: ["host.docker.internal:host-gateway"]`, because the API runs natively.

### Send-email hook

Supabase Auth sends no email itself. For every message it calls `POST /hooks/send-email` with
`{ user, email_data: { token_hash, redirect_to, email_action_type, ... } }`, signed according to
Standard Webhooks.

1. The API verifies the signature with `SEND_EMAIL_HOOK_SECRET`; a missing or invalid one -> `401`.
2. It picks the locale: `accounts.locale` -> `user.user_metadata.locale` -> `DEFAULT_LOCALE`.
3. It builds the link `<AUTH_URL>/verify?token=<token_hash>&type=<email_action_type>&redirect_to=<redirect_to>`
   and renders the template through Lingui.
4. It sends the message through `MailModule` and answers `200 {}`. An SMTP failure -> `500`, which
   Supabase Auth reports to the client as a failed send.

| `email_action_type` | Template |
|---|---|
| `signup` | address confirmation |
| `recovery` | password reset |
| `email_change` | confirmation of the new address |
| anything else | `400` — those flows are disabled |

### Admin API

The API holds `SUPABASE_SERVICE_ROLE_KEY` — a JWT with `role = service_role`, signed with
`JWT_SECRET` — and uses it only for `DELETE /admin/users/:id` (account deletion) and in the seed
for `POST /admin/users` ([15](#15-demo-data-seed)). The key never reaches a frontend.

### Rate limits

GoTrue's built-in limits stay at their defaults, keyed by the client IP from `X-Forwarded-For`.
Traefik adds a `rateLimit` middleware on the `auth.opos.land` router: an average of 30 requests per
minute per IP, burst 10, a `429` above that.

---

## 12. Environment variables

No `.env` at the repository root: a root file hides which application consumes which variable and
turns every change into a cache invalidation for all of them. Each application keeps its own
`.env` next to a committed `.env.example`.

**`apps/api/.env`** — everything below belongs to the API and is read at runtime:

```bash
# Database - three roles
DATABASE_URL=postgres://opos_app:opos@localhost:5432/postgres
DATABASE_GLOBAL_URL=postgres://opos_app_global:opos@localhost:5432/postgres
DATABASE_MIGRATION_URL=postgres://opos_migrator:opos@localhost:5432/postgres

# Supabase Auth
AUTH_URL=http://localhost:9999
JWT_SECRET=dev-jwt-secret-at-least-32-characters-long
SUPABASE_SERVICE_ROLE_KEY=
SEND_EMAIL_HOOK_SECRET=v1,whsec_ZGV2LXNlbmQtZW1haWwtaG9vay1zZWNyZXQ=

# Invitations
INVITE_SECRET=dev-invite-secret
INVITE_TTL=7d

# i18n
DEFAULT_LOCALE=pl
SUPPORTED_LOCALES=en,pl

# Addresses
ROOT_DOMAIN=localhost
API_URL=http://api.localhost:3001
PANEL_URL=http://panel.localhost:5173
PORTAL_URL=http://opos.localhost:5174

# SMTP (Mailpit in dev)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
MAIL_FROM=OPOS <noreply@opos.land>

# API
PORT=3001
NODE_ENV=development
```

`SUPABASE_SERVICE_ROLE_KEY` in dev is generated from `JWT_SECRET` by `pnpm --filter api
auth:service-key`.

**`infra/supabase/.env`** — the dev configuration of `db`, `auth` and `studio`: `POSTGRES_PASSWORD`,
`JWT_SECRET` (the same as the API's), the Google client, `SEND_EMAIL_HOOK_SECRET` (the same as the
API's) and the dev addresses. The full list of the `auth` variables is in [11](#11-supabase).

**The other applications:**

| File | Variables |
|---|---|
| `apps/panel/.env` | `VITE_API_URL`, `VITE_AUTH_URL` |
| `apps/portal/.env` | `VITE_API_URL`, `VITE_AUTH_URL` |
| `apps/cms/.env` | `API_URL` — read at SSR runtime, not baked into the build |

`VITE_*` values are baked into the bundle at build time; turbo hashes them through framework
inference, so a changed value rebuilds exactly the applications that read it.

Production configuration lives in a `.env` next to `docker-compose.prod.yml` on the VPS — compose
injects it into the containers. It adds `POSTGRES_PASSWORD`, `ACME_EMAIL`, `CF_DNS_API_TOKEN` and
the Supabase Auth variables, and overrides `ROOT_DOMAIN=opos.land` and the `https://` addresses.
`JWT_SECRET` and `SEND_EMAIL_HOOK_SECRET` are generated once per environment and are never reused
between dev and production.

---

## 13. Local development

Applications run natively through pnpm, infrastructure runs in Docker.

```bash
# 1. Infrastructure
docker compose up -d
# -> supabase db on :5432, auth on :9999, studio on :54323
# -> mailpit on :1025 (SMTP) + :8025 (UI)

# 2. Migrations and seed
pnpm db:migrate
pnpm db:seed

# 3. All applications in parallel
pnpm dev
# -> api    on api.localhost:3001
# -> panel  on panel.localhost:5173
# -> portal on opos.localhost:5174
# -> cms    on convention-a.localhost:4321
```

`/etc/hosts`:

```
127.0.0.1 api.localhost panel.localhost opos.localhost convention-a.localhost convention-b.localhost
```

Root scripts: `dev`, `build`, `typecheck`, `lint`, `format`, `test`, `test:e2e`, `i18n:extract`,
`i18n:compile`, `db:generate`, `db:migrate`, `db:push`, `db:seed`, `db:studio`, `db:verify`.
Apart from `format`, each of them is a `turbo run <task>` delegate ([3.1](#31-turbo-tasks)).

`db:migrate` and `db:seed` connect as `opos_migrator`; the API runs as `opos_app`. The roles are
created by `infra/supabase/db/opos-roles.sql` when the `db` container starts on an empty volume —
`docker compose down -v` resets them together with the data.

Mailpit catches all dev email — UI at http://localhost:8025. Supabase Auth's messages land there
too, because they go through the API's send-email hook. Supabase Studio at http://localhost:54323
browses both the `public` and the `auth` schema.

### Versions and dependencies

`corepack enable pnpm` once per machine; from then on the `packageManager` field pins the pnpm
version. Node comes from `.nvmrc` — run `nvm use` before starting work.

`pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (minutes, that is 7 days): pnpm will not
install a version published within the last week. It is a grace window against a hijacked publisher
account or a version pulled right after release. Side effect: `pnpm add` may pick a version one
below the newest — that is intended. An urgent security fix requires a deliberate
`minimumReleaseAgeExclude` for that specific package.

### Git hooks

`lefthook install` runs from `prepare`, so `pnpm install` is enough. Two hooks are active today:
prettier on staged files (`pre-commit`) and commitlint on the message (`commit-msg`). The eslint
and pre-push jobs wait commented out in `lefthook.yml` for the first packages.

Single-call escape hatch: `LEFTHOOK=0 git commit ...`.

---

## 14. Deployment

VPS + Docker Compose behind Traefik v3.

### Images

| Service | Dockerfile / image |
|---|---|
| `api` | multi-stage on `node:24-alpine`: prune -> `turbo run build` -> `node dist/main.js` |
| `panel`, `portal` | multi-stage: prune -> Vite build -> `nginx:alpine` with an SPA fallback and the CSP header ([7.4](#74-authorization)) |
| `cms` | multi-stage: prune -> Astro build -> `node ./dist/server/entry.mjs` |
| `db` | `supabase/postgres`, exact tag, with a `pgdata` volume and `infra/supabase/db` as init scripts |
| `auth` | `supabase/gotrue`, exact tag |
| `traefik` | `traefik:v3`, docker provider + ACME resolvers |

Every application Dockerfile starts with `turbo prune <app> --docker`: the build context holds
only that application's slice of the dependency graph and a pruned lockfile, so a change in one
application does not invalidate the image layers of another.

### Routers

```
opos.land                    -> portal
panel.opos.land              -> panel
api.opos.land                -> api
auth.opos.land               -> auth     # + rateLimit middleware (11)
HostRegexp(^.+\.opos\.land$) -> cms      # lower priority than the routers named above
<custom domains>             -> cms      # Traefik dynamic file
```

`db` has no router and publishes no port.

### TLS

Wildcard `*.opos.land` + `opos.land` through DNS-01 (`CF_DNS_API_TOKEN`).

A custom domain needs its own HTTP-01 certificate. Order of operations:

1. The customer points the domain's A record at the server IP.
2. The admin sets the domain through `PUT /admin/tenants/:tenantId/domain`.
3. The admin adds a router to Traefik's dynamic file with the HTTP-01 resolver.
4. Verification: `curl -I https://<domain>`.

Step 3 before step 1 ends in a failed ACME challenge and a Let's Encrypt rate limit.

### Backups

- `pg_dump -Fc` of the whole database — `public` and `auth` together — every 6 hours, into a
  volume outside `pgdata`. A dump without `auth` leaves accounts nobody can sign in to.
- Retention: 7 daily, 4 weekly, 3 monthly.
- Off-server copy: `restic` or `rclone` to S3/R2, encrypted, with a separate key.
- Once a month, restore a dump into a clean `supabase/postgres` container of the same tag, start
  `auth` against it and run `pnpm db:verify` plus a test sign-in.
- Dumps are encrypted at rest — they contain attendees' personal data and password hashes.

### Deployment procedure

1. `git pull` on the VPS.
2. `docker compose -f docker-compose.prod.yml pull db auth traefik`.
3. `docker compose -f docker-compose.prod.yml build`.
4. `pg_dump` before the migration.
5. `docker compose -f docker-compose.prod.yml run --rm api pnpm db:migrate`.
6. `docker compose -f docker-compose.prod.yml run --rm api pnpm db:verify`.
7. `docker compose -f docker-compose.prod.yml up -d`.
8. The smoke test from chapter [17](#17-smoke-test).

---

## 15. Demo data (seed)

`packages/db/src/seed.ts`, idempotent. With `NODE_ENV=production` it fails unless
`--i-know-what-i-am-doing` is passed.

Accounts are created through the Supabase Auth admin API (`POST /admin/users` with
`email_confirm: true` and the dev password); an existing user is skipped. The trigger fills
`accounts`, and the seed then sets `isPlatformAdmin`, `locale` and the names. Everything else is
written directly as `opos_migrator`.

- **Accounts:** `admin@opos.land` (`isPlatformAdmin`), `head@convention-a.test`, three organizer
  accounts, `attendee@example.com`. Dev password: `password123`. One organizer account has
  `locale=en`.
- **Tenant `convention-a`** — "Convention A", `defaultLocale=pl`, `timezone=Europe/Warsaw`,
  no custom domain.
  - Edition `2025` — `isPublished=true`, `isActive=false`, 8 programme items.
  - Edition `2026` — `isPublished=true`, `isActive=true`, 12 programme items.
- **Tenant `convention-b`** — "Convention B", `defaultLocale=en`, `timezone=Europe/Prague`,
  a single `2026` edition with an English programme.
- **Convention A team:**

| Account | Role | Tenant level | Edition level |
|---|---|---|---|
| `head@convention-a.test` | `head` | bypass | bypass |
| `program@convention-a.test` | `org` | everything `none` | 2026: `program=write`; 2025: no membership |
| `settings@convention-a.test` | `org` | `settings=write` | none |
| `viewer@convention-a.test` | `org` | `settings=read` | 2026: `program=read` |

- **Attendee:** `attendee@example.com` signed up for `convention-a/2025`, not for `2026`.

---

## 16. Tests

### 16.1 API integration tests

Supertest against Postgres and Supabase Auth in containers (`supabase/postgres` and
`supabase/gotrue`, the production tags), no database or auth mocks, in `apps/api/test`. Test
accounts are created through the admin API and signed in with `signInWithPassword`.

| Area | What we check |
|---|---|
| permission matrix | for every (endpoint, permission) pair: `none` -> `403`, `read` -> reads yes / writes `403`, `write` -> both; `head` passes everywhere |
| tenant isolation | the same set of requests with someone else's `X-Tenant-Slug` and someone else's identifiers -> `403` / `404` |
| RLS | a query on `opos_app` without `app.tenant_id` -> error; with tenant B's context -> zero rows of tenant A; an `insert` with a foreign `tenant_id` -> `WITH CHECK` violation; `anon` and `authenticated` cannot read any `public` table |
| anti-escalation | an org cannot grant permissions above their own, edit themselves or touch a `head` |
| invariants | a second active edition, removing the last `head`, an `edition_membership` with a foreign edition |
| JWT | an expired token, a token signed with another secret, `aud != authenticated` and a foreign `iss` -> `401`; a valid token without an `accounts` row -> `401` |
| account lifecycle | a new `auth.users` row creates `accounts` with the metadata; an email change updates it; `DELETE /me` without a recent sign-in -> `401`, with one -> the user, `accounts`, memberships and `attendees` are gone |
| send-email hook | an unsigned or wrongly signed request -> `401`; `signup`, `recovery` and `email_change` land in Mailpit in the recipient's locale with a working `/verify` link; another `email_action_type` -> `400` |
| rate limit | `GET /invitations/preview` above the limit -> `429` with `Retry-After` |
| i18n | `lingui extract --check` reports no drift between code and catalogs; every error `code` from the contract has a descriptor in `errors.ts`; programme time formatting returns the tenant's zone, not the server's |

### 16.2 E2E tests

Playwright in `e2e/`, through the UI of all three web applications, against the full stack on a
fresh database.

**Environment:** `docker compose up -d` (Supabase `db` + `auth`, Mailpit),
`pnpm db:migrate && pnpm db:seed`, applications started through `webServer` in the Playwright
configuration. Chromium in two projects: desktop, and a mobile viewport (Pixel 7) for the portal;
a browser matrix is beyond the MVP. The `e2e` directory is a workspace package — Playwright and
the fixtures are its dependencies, not the root's.

Emails — address confirmation, password reset, invitations — are read through Mailpit's HTTP API
(`:8025/api/v1`). Google sign-in is not covered by e2e: Supabase Auth talks to the real Google,
and the smoke test checks that flow ([17](#17-smoke-test)).

**Scenarios:**

| # | Scenario |
|---|---|
| 1 | Registration with a password: sign-in before confirming -> `email_not_confirmed`; the link from Mailpit confirms; sign-out, sign-in again; the language switch survives the session |
| 2 | Resending the confirmation link from the sign-in screen delivers a new message |
| 3 | The session survives a page reload; after sign-out the stored session is gone and the API answers `401` |
| 4 | A head creates an edition, activates it, publishes it and adds programme items |
| 5 | The programme shows up in the CMS of both tenants, each in its own language and time zone |
| 6 | Organizer invitation: email from Mailpit -> acceptance -> the invitee sees only their edition |
| 7 | An org with `read`: no sidebar section, entering by URL -> the "no permissions" screen |
| 8 | Isolation: attempting to enter another tenant's convention through the UI and by a direct API request |
| 9 | An attendee signs up for an edition from the CMS, sees it under "my conventions", deletes the account |
| 10 | Password reset: request from the sign-in screen, the link from Mailpit sets a new password, the old session stops working |

Scenarios 1, 9 and 10 run in both the desktop and the mobile project.

Tests share no data: every scenario that creates a tenant works on its own slug, and scenarios
using seeded data only read it.

### 16.3 CI

GitHub Actions on every PR. `turbo run typecheck lint test --affected` covers the packages changed
against `main` and their dependents; the turbo cache is persisted between runs with
`actions/cache`, so an unchanged task inside an affected package is still a cache hit.
`pnpm i18n:extract -- --check`, `pnpm db:verify` and `pnpm test:e2e` run in full on every PR.

The e2e job receives `/etc/hosts` entries for `api.localhost`, `panel.localhost`,
`opos.localhost`, `convention-a.localhost` and `convention-b.localhost`. Artifacts from failed runs
(traces, video, screenshots) are kept for 7 days.

---

## 17. Smoke test

Run by hand after every deployment, on the production environment. The same flows run automatically
in e2e ([16.2](#162-e2e-tests)) — the smoke test exists to check them where e2e cannot reach: with
real TLS, real Google, real email delivery and a real phone.

1. **Attendee registration.** `opos.land` -> registration by email -> the confirmation message
   arrives in the recipient's language -> the link signs in and lands on "my conventions". With
   `Accept-Language: en` the portal is in English before sign-in; after changing the language in
   settings the choice survives sign-out and a fresh visit.
2. **Password reset.** The forgot-password form sends a real email; the link sets a new password,
   the previous password stops working and the earlier session is signed out.
3. **Google cannot take over an account.** An unconfirmed account created with a password on an
   address available in Google: after signing in with Google, the password does not let anyone in.
   For a confirmed account, Google sign-in keeps the same `auth.users.id` and the password keeps
   working.
4. **Refresh token rotation.** A refresh token used a second time, more than 10 s after the first
   use, is rejected and ends the session. `panel.opos.land` and `opos.land` answer with the CSP
   header from [7.4](#74-authorization).
5. **Edition activation.** A new 2027 edition activated -> 2026 loses `isActive`, and the database
   holds exactly one active Convention A edition.
6. **The programme reaches the website.** An item added in the panel shows up on
   `convention-a.localhost/program` (allowing for the 60 s tenant cache TTL).
7. **Organizer invitation.** A head invites an email with `program=write` for 2026 -> the message
   arrives -> acceptance -> the invitee sees the 2026 programme and nothing else.
8. **Permissions in the UI and on the server.** `viewer@convention-a.test` has no team management
   in the sidebar, and a direct URL ends with the "no permissions" screen and a `403` from the API.
9. **Tenant isolation.** A Convention A org with `X-Tenant-Slug: convention-b` -> `403`;
   `GET /editions/:id` with a Convention B edition -> `404`. In `psql` on `opos_app` with
   Convention B's `app.tenant_id`: `select count(*) from events` returns only Convention B items,
   and an `insert` with a foreign `tenant_id` hits `WITH CHECK`.
10. **The CMS respects publication and tenant language.** An unpublished edition -> `404`, the
   archive shows 2025, an unknown host -> the "we couldn't find that convention" page.
   `convention-b.localhost` renders in English with `lang="en"` regardless of `Accept-Language`,
   and the programme times match the tenant's zone.
11. **The portal on a phone.** On a real phone browser (iOS Safari and Android Chrome): registration,
   the "Sign up" button on a convention website, edition sign-up and "my conventions" work without
   horizontal scrolling.
12. **Supabase stays internal.** `auth.opos.land` answers only GoTrue's paths, nothing listens on
   `:5432` from outside, and `https://api.opos.land/hooks/send-email` without a signature -> `401`.

---

## 18. Execution rules

1. **Pinned versions** — Node `24.15.0` and pnpm `11.17.0`, enforced by `engineStrict`.
   Dependencies no younger than 7 days (`minimumReleaseAge`). Supabase images pinned to exact
   tags.
2. **No build step for the contracts** — `packages/contract`, `packages/db` and `packages/i18n`
   point `main`/`types` at `src/index.ts`. The only exception is the translation catalogs: they
   need `pnpm i18n:compile`, wired in as a dependency of `dev` and `build` ([3.1](#31-turbo-tasks)).
3. **Atomic commits**, Conventional Commits in English — the convention and the scopes live in
   [AGENTS.md](../AGENTS.md#commits), enforced by commitlint.
4. **Green before every PR** — `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm db:verify`.
   A change visible in the UI is additionally clicked through or checked with `curl`; a portal
   change also in a mobile viewport.
5. **No emoji in code or commit messages.**
6. **Every user-facing string inside a Lingui macro** — `<Trans>`, `t`, `plural`, `msg`. A bare
   literal in a prop or in JSX is a review error. The API returns a `code`, not a sentence. After
   adding a string, run `pnpm i18n:extract`; the `pl` translations may arrive later, the
   fallback to the English original covers them.
7. **English across the repository.** Code, table and column names, endpoints, route paths,
   comments in code and configuration, branch names, commits and all documentation — English.
   The only Polish in the repository is the `pl` translation catalog.
8. **Feature based in every frontend.** A new screen starts with the question of which feature it
   belongs to; if none, a new feature is created rather than an application-level `components/`
   directory. Shared things go to `shared/`, never through an import from inside another feature.
9. **No AI-generated graphics.** Illustrations, logos, images and icons come from the designer or
   from the licensed icon set; screens follow the designer's designs. A screen without a design
   uses plain blocks and real copy, not generated artwork. A generated image in a PR is a review
   error.
10. **Only the API and Supabase Auth touch the database.** No frontend gets a database URL, a
    service role key or a PostgREST endpoint.
