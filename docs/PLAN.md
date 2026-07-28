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
11. [apps/mobile](#11-appsmobile)
12. [Environment variables](#12-environment-variables)
13. [Local development](#13-local-development)
14. [Deployment](#14-deployment)
15. [Demo data (seed)](#15-demo-data-seed)
16. [Tests](#16-tests)
17. [Smoke test](#17-smoke-test)
18. [Execution rules](#18-execution-rules)

---

## 1. Architecture

Five applications, three shared packages, one backend.

```mermaid
graph TB
    traefik["Traefik v3 (wildcard TLS)"]
    portal["apps/portal<br>Vite + React"]
    panel["apps/panel<br>Vite + React"]
    api["apps/api<br>NestJS + Drizzle"]
    cms["apps/cms<br>Astro SSR"]
    mobile["apps/mobile<br>Expo / RN"]
    packages["packages/contract · packages/db · packages/i18n"]
    pg[("PostgreSQL 16")]

    traefik -->|"opos.land"| portal
    traefik -->|"panel.opos.land"| panel
    traefik -->|"api.opos.land"| api
    traefik -->|"&lt;slug&gt;.opos.land + custom domains"| cms
    mobile --> api
    portal --> packages
    panel --> packages
    api --> packages
    cms --> packages
    packages --> pg
```

| App | Stack | Role | Host |
|---|---|---|---|
| `apps/api` | NestJS + Drizzle + ts-rest | the only backend for every frontend | `api.opos.land` |
| `apps/panel` | Vite + React + Tailwind + shadcn/ui | organizer panel (SPA) | `panel.opos.land` |
| `apps/portal` | Vite + React + Tailwind + shadcn/ui | landing page, registration, "my conventions" | `opos.land` |
| `apps/cms` | Astro SSR (Node adapter) | public convention website, Host -> tenant mapping | `<slug>.opos.land` + custom domains |
| `apps/mobile` | Expo (React Native) | a stub of the portal's scope on iOS and Android | stores / TestFlight |

**`packages/contract`** — ts-rest + zod, the single source of truth for the API. No build step,
apps infer types from the TS source.

**`packages/db`** — Drizzle ORM: schema, migrations, connection factories. Row-level multi-tenancy
through `tenantId` + `editionId` columns, enforced by RLS
([4.6](#46-tenant-isolation--rls-in-postgres)).

**`packages/i18n`** — Lingui configuration, the list of supported locales, locale detection, `Intl`
formatters and message descriptors for API error codes. Application catalogs live next to the
applications ([6](#6-localization)).

---

## 2. Technology stack

**Monorepo:** turborepo, pnpm workspaces, TypeScript strict, shared `packages/tsconfig` and
`packages/eslint-config` (including the feature boundary rules).

**Hard-pinned versions:** Node `24.15.0` (`.nvmrc` + `engines.node`), pnpm `11.17.0`
(`packageManager` + corepack). `engineStrict: true` makes a mismatched version abort the install
instead of printing a warning.

**Repository tooling:** lefthook (git hooks), commitlint with `config-conventional`, prettier.

**Backend:** NestJS, Drizzle ORM + postgres-js, `@ts-rest/nest`, Passport (JWT, local, Google),
argon2, nodemailer, `@nestjs/throttler`, `cookie-parser`.

**Frontend SPA:** Vite + React + TypeScript, Tailwind CSS + shadcn/ui, `@ts-rest/react-query`,
react-router, react-hook-form + zod, zustand, `@lingui/react`.

**Frontend SSR:** Astro (Node adapter), `@ts-rest/core`, Tailwind CSS, Host -> tenant middleware,
LRU lookup cache, `@lingui/core` (in `.astro`, without the React layer).

**Mobile:** Expo (React Native) + expo-router, NativeWind, `@ts-rest/react-query`,
`expo-secure-store` (tokens), `expo-auth-session` + `expo-web-browser` (OAuth),
`expo-localization` (device language), `@lingui/react`. Builds through EAS.

**i18n:** Lingui — `@lingui/core`, `@lingui/react`, `@lingui/macro` macros, `@lingui/cli`.
`Intl` for dates, numbers and currencies.

**Tests:** supertest (integration), Playwright (web e2e), Maestro (mobile e2e).

**Infrastructure:** Docker Compose, Traefik v3 (wildcard TLS via DNS-01), PostgreSQL 16,
Mailpit (dev).

**Design principles:**

- ts-rest contracts with no build step.
- Row-level multi-tenancy, not schema-per-tenant.
- Isolation enforced by RLS, not only by a `where` clause in code.
- AsyncLocalStorage carries the `tenantContext`.
- Fail fast on a missing `tenantId` — both in ALS and in the RLS policies.
- No user-facing strings outside Lingui macros in application code.
- Every frontend and the mobile app use a feature-based layout, with boundaries enforced by eslint.

---

## 3. Monorepo structure

```
opos/
  package.json                # root scripts delegating to turbo run
  pnpm-workspace.yaml         # apps/*, packages/*, e2e
  turbo.json                  # task pipeline (3.1)
  .nvmrc                      # 24.15.0
  .prettierrc
  docker-compose.yml          # dev: postgres + mailpit
  docker-compose.prod.yml     # prod: traefik + apps + postgres
  lefthook.yml                # hooks: prettier on staged files, commitlint on the message
  commitlint.config.mjs       # types, scopes, header length
  .prettierignore
  .gitignore
  AGENTS.md
  CLAUDE.md
  docs/
    PRODUCT.md
    PLAN.md
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
          auth/          # local, jwt, google, refresh rotation, authCode exchange
          accounts/      # MeModule
          superadmin/    # tenants, first head, custom domain
          tenants/       # tenant + tenant_memberships + invitations
          editions/      # editions + edition_memberships
          events/        # programme
          public/        # unauthenticated endpoints for the CMS and the portal
          mail/          # nodemailer + text templates
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
      .env.example       # VITE_API_URL
      Dockerfile
    portal/
      lingui.config.ts
      src/
        locales/{en,pl}.po
        app/
        features/{landing,auth,account,attendances}/
        shared/{ui,lib,config}/
      .env.example       # VITE_API_URL
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
    mobile/
      lingui.config.ts
      app/               # thin expo-router routes, delegate to features
      src/
        locales/{en,pl}.po
        features/{auth,account,attendances}/
        shared/{ui,lib,config}/
      app.json           # opos:// scheme, universal links, identifiers
      eas.json
      metro.config.js    # watchFolders + pnpm symlink resolver
      .env.example       # EXPO_PUBLIC_API_URL
  e2e/                   # a workspace package: playwright and the test helpers
    package.json
    playwright.config.ts
    specs/
    fixtures/            # OAuth stub, Mailpit client, sign-in as a seeded account
    maestro/             # mobile flows
  packages/
    contract/
      src/
        index.ts
        common.ts        # error schemas, pagination, identifiers
        auth.ts
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
          accounts.ts
          oauth-identities.ts
          refresh-tokens.ts
          password-reset-tokens.ts
          tenants.ts
          tenant-memberships.ts
          editions.ts
          edition-memberships.ts
          events.ts
          attendees.ts
        seed.ts
      drizzle/           # drizzle-kit migrations + the hand-written RLS migration
      drizzle.config.ts
      package.json       # main + types -> src/index.ts
    i18n/
      src/
        index.ts         # locale list, detection, catalog activation, Intl formatters
        errors.ts        # API code -> MessageDescriptor mapping
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
- `apps/mobile` defines no `build` script — it is built through EAS ([11](#11-appsmobile));
  `typecheck`, `lint` and `test` cover it like every other package.
- Frontend build-time variables (`VITE_*`, `EXPO_PUBLIC_*`) enter task hashes through turbo's
  framework inference. The API's variables are read at runtime and stay out of the hash
  ([12](#12-environment-variables)).

### 3.2 Frontend application layout

The panel, the portal, the CMS and the mobile application share one layout: **feature based**.
No directory for a technical layer (`components/`, `hooks/`) exists at application level — those
directories live inside a feature.

```
src/
  app/                  # bootstrap: router, providers, layout (in mobile that role belongs to expo-router's app/)
  features/
    <feature>/
      api/              # ts-rest hooks, query keys, mutations
      components/       # components belonging to this feature only
      hooks/
      pages/            # views mounted into the router (in mobile: screens/)
      model/            # types, zod schemas, mappings
      index.ts          # the feature's public API — the only thing others can see
  shared/
    ui/                 # shadcn/ui and components with no domain knowledge
    lib/                # API client, i18n, formatters, storage
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

Routes stay thin: a file in Astro's `pages/` or in expo-router's `app/` holds no logic, it only
mounts a view from the right feature. In mobile the view directory is called `screens/` instead of
`pages/` — the rest of the layout is identical.

A feature never reaches the database or `fetch` directly: all network traffic goes through that
feature's `api/`, built on the client from `shared/lib`.

---

## 4. Database schema

PostgreSQL 16. Every table has `id uuid primary key default gen_random_uuid()`,
`createdAt timestamptz not null default now()`, `updatedAt timestamptz not null default now()`.

The [glossary](PRODUCT.md#3-glossary) terms map onto tables as follows:

| Term | Carrier |
|---|---|
| admin | `accounts.isPlatformAdmin = true` |
| org, head | `tenant_memberships` (+ optionally `edition_memberships`) |
| user | `accounts` + rows in `attendees` |
| tenant | `tenants` |
| edition | `editions` |
| event | `events` |
| attendee | `attendees` |

### 4.1 Enums

```ts
permissionLevel = pgEnum('permission_level', ['none', 'read', 'write'])
tenantRole      = pgEnum('tenant_role',      ['head', 'org'])
oauthProvider   = pgEnum('oauth_provider',   ['google'])
tokenPurpose    = pgEnum('token_purpose',    ['portal', 'panel', 'mobile'])
```

`locale` is not an enum — the list of supported languages lives in `packages/i18n` and in
`SUPPORTED_LOCALES`, validated by zod. Adding a language requires no migration.

### 4.2 Global tables

**`accounts`**

| column | type | notes |
|---|---|---|
| `email` | text | unique, stored lowercase |
| `passwordHash` | text | nullable — an OAuth-only account has no password |
| `firstName` | text | |
| `lastName` | text | |
| `isPlatformAdmin` | boolean | default `false` |
| `emailVerifiedAt` | timestamptz | nullable; set by OAuth sign-in and by a completed password reset |
| `locale` | text | nullable; the user's choice, `null` = detect from `Accept-Language` |

**`oauth_identities`** — `accountId` (FK cascade), `provider`, `providerId`.
Unique `(provider, providerId)`. Index on `accountId`.

**`refresh_tokens`** — `accountId` (FK cascade), `tokenHash` (sha256 of the raw token), `purpose`
(`portal` / `panel` / `mobile`), `expiresAt`, `revokedAt` (nullable).
Indexes on `(accountId, purpose)` and `tokenHash`.

**`password_reset_tokens`** — `accountId` (FK cascade), `tokenHash` (sha256 of the raw token),
`expiresAt`, `usedAt` (nullable). Indexes on `accountId` and `tokenHash`.

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

### 4.6 Tenant isolation — RLS in Postgres

#### Database roles

| Role | Attributes | Used by |
|---|---|---|
| `opos_migrator` | table owner, `BYPASSRLS` | `pnpm db:migrate`, `pnpm db:seed` |
| `opos_app` | DML only, no `BYPASSRLS` | runtime API inside a tenant context |
| `opos_app_global` | DML only, `BYPASSRLS` | `GlobalDbService` exclusively |

Every RLS-covered table also gets `FORCE ROW LEVEL SECURITY`.

#### Covered tables

`tenants`, `tenant_memberships`, `editions`, `edition_memberships`, `events`, `attendees`.

The global tables (`accounts`, `oauth_identities`, `refresh_tokens`, `password_reset_tokens`)
stay outside RLS — they are protected by filtering on the `accountId` from the JWT.

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

RLS policies go into a hand-written migration (`drizzle-kit generate --custom`).
`pnpm db:verify` runs:

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

### 5.1 `auth` — unauthenticated

| Method | Path | Body / Query | Response |
|---|---|---|---|
| POST | `/auth/register` | `email, password, firstName, lastName` | `201 { account, accessToken }` |
| POST | `/auth/login` | `email, password, purpose` | `200 { account, accessToken }` |
| POST | `/auth/refresh` | — (cookie) | `200 { accessToken }` (rotation) |
| POST | `/auth/logout` | — (cookie) | `204` + cookie cleared |
| POST | `/auth/oauth/exchange` | `authCode` | `200 { account, accessToken }` |
| POST | `/auth/password-reset/request` | `email` | `204` — always, an unknown address included |
| POST | `/auth/password-reset/confirm` | `token, password` | `204`; every refresh token revoked |

For `purpose` = `portal` / `panel` the refresh token appears in no body — only in an `HttpOnly`
cookie, and the client calls these endpoints with `credentials: 'include'`.

For `purpose = mobile` it is the other way round: the API sets no cookie and returns `refreshToken`
in the body, and `/auth/refresh` and `/auth/logout` accept it in the body. A native client has no
origin and no sensible cookie store — it keeps the token in the system keychain
([7.4](#74-authorization)). Rotation, TTL and revocation are identical in both variants.

Outside the ts-rest contract (these return `302`):

- `GET /auth/oauth/:provider/start?purpose=portal`
- `GET /auth/oauth/:provider/callback`

### 5.2 `me` — requires JWT

| Method | Path | Description |
|---|---|---|
| GET | `/me` | account profile |
| PATCH | `/me` | change `firstName`, `lastName`, `locale` |
| DELETE | `/me` | delete the account; `409` when it is some tenant's last `head` |
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
| `packages/i18n/locales/*.po` | API errors and email content | `packages/i18n/src` |

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
| mobile | `accounts.locale` -> device language (`expo-localization`) -> `DEFAULT_LOCALE` |
| CMS | `tenants.defaultLocale`, regardless of the browser |
| emails | the recipient's `accounts.locale`; for an unknown address the inviting `tenants.defaultLocale` |

### API errors

The API returns a `code`, never a sentence. `packages/i18n/src/errors.ts` maps a `code` onto a
descriptor from the `msg` macro, and the client renders it through `i18n._(descriptor, params)`.
A new `code` in the contract without an entry in that map fails a test
([16.1](#161-api-integration-tests)).

Emails are rendered by the API — it activates the recipient's catalog and composes the content
through `@lingui/core`.

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
| `AuthModule` | registration, sign-in, refresh rotation, password reset, Google OAuth, `authCode` exchange; `local`, `jwt`, `google` strategies |
| `MeModule` | profile, memberships, edition sign-ups, account deletion |
| `SuperadminModule` | tenants, first `head`, custom domain; `PlatformAdminGuard` |
| `TenantsModule` | tenant data, `tenant_memberships`, invitations |
| `EditionsModule` | edition CRUD, activation, `edition_memberships` |
| `EventsModule` | programme item CRUD |
| `PublicModule` | unauthenticated endpoints for the CMS and the portal |
| `MailModule` | nodemailer + text templates per locale ([6](#6-localization)) |

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

Outbound I/O (SMTP, HTTP to the OAuth provider) happens outside the transaction.

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

- Access token: **15 minutes**, refresh: **30 days**.
- Rotating refresh — every `/auth/refresh` invalidates the old one (`revokedAt`) and issues a new
  one; using an invalidated token -> `401`.
- Passwords: **argon2id**.
- `refresh_tokens` carry a `purpose`, revocable separately.
- The JWT holds no `tenantId`. Payload: `{ sub, email, isPlatformAdmin }`.

**Access token** — in SPA memory only (zustand), sent in the `Authorization: Bearer` header.

**Refresh token on the web** — an `HttpOnly; Secure; SameSite=Lax; Domain=.opos.land; Path=/auth`
cookie, separate for the portal and the panel (`opos_rt_portal`, `opos_rt_panel`).
`/auth/refresh` requires the `X-Requested-With: opos` header. In dev: `Domain=.localhost`, without
`Secure` (`COOKIE_SECURE=false`).

**Refresh token in the mobile application** — `expo-secure-store`, that is the Keychain on iOS and
EncryptedSharedPreferences on Android. The token travels in the request body, not in a cookie;
responses for `purpose = mobile` set no cookie at all. The access token, as on the web, lives only
in the application process memory.

The variant is decided by the `purpose` from sign-in, not by a client header — `purpose = mobile`
issues the token into the body, everything else into a cookie. Everything else (rotation,
`revokedAt`, TTL, limits) is shared.

### 7.5 Google OAuth

1. The portal redirects to `/auth/oauth/google/start`.
2. The API redirects to Google; Google comes back to `/auth/oauth/google/callback`.
3. The API exchanges the code, creates or links the account and issues a one-time `authCode`
   (TTL 60 s, in process memory).
4. Redirect to the portal with `authCode` in the URL.
5. The portal calls `/auth/oauth/exchange` and receives an access token plus the refresh cookie.

On mobile the same flow with two differences: step 1 opens the system browser
(`ASWebAuthenticationSession` / Custom Tabs), and step 4 comes back through the
`opos://oauth/callback?authCode=...` deep link.

The return address is picked from an **allowlist** in the API configuration (`PORTAL_URL`,
`PANEL_URL`, `MOBILE_REDIRECT_SCHEME`) based on `purpose`. The API never redirects to an address
supplied in the request.

Linking by email:

| State of the account with that email | Behaviour |
|---|---|
| does not exist | create the account: `passwordHash = null`, `emailVerifiedAt = now()`, attach the identity |
| exists, `emailVerifiedAt` set | attach the identity, leave the password untouched |
| exists, `emailVerifiedAt` empty | `passwordHash = null`, `emailVerifiedAt = now()`, revoke all the account's `refresh_tokens`, attach the identity |

### 7.6 Password reset

1. `POST /auth/password-reset/request` always answers `204` — for an unknown address too, so the
   endpoint reveals nothing about registered emails. For a known address the API generates a
   random token, stores its sha256 in `password_reset_tokens` with a `PASSWORD_RESET_TTL` (1 h)
   expiry, invalidates the account's earlier unused tokens and sends a
   `<PORTAL_URL>/reset-password?token=...` link in the recipient's locale.
2. `POST /auth/password-reset/confirm` checks the token (known hash, unexpired, `usedAt` empty),
   sets the new argon2id `passwordHash`, marks the token used, sets `emailVerifiedAt` — the reset
   proved control of the mailbox — and revokes all the account's `refresh_tokens`.
3. The flow works for an OAuth-only account as well (`passwordHash = null`): completing it adds
   password sign-in next to Google.

### 7.7 Organizer invitations

An invitation is a signed JWT (`INVITE_SECRET`, TTL 7 days) with the payload
`{ tenantId, email, role, tenantPermissions, editionPermissions }`.

- Email of a known account -> the membership is created immediately, the email is a notification.
- Unknown email -> an email with a `panel.opos.land/invitation?token=...` link; after registering
  or signing in, `POST /invitations/accept` creates the membership.
- Permissions from the token go through the anti-escalation check.

### 7.8 CORS

Allowed `Origin`: `opos.land` and `panel.opos.land` — an explicit list, never `*` and never a
reflected header. Allowed headers: `Authorization`, `Content-Type`, `X-Tenant-Slug`,
`X-Requested-With`. `credentials: true`.

Requests with no `Origin` header — that is everything from the mobile application — pass normally.
CORS is a browser mechanism and does not apply to a native client; the security of those requests
rests on the token, not on the origin.

### 7.9 Rate limiting

`@nestjs/throttler`, counters in process memory.

| Scope | Limit |
|---|---|
| `POST /auth/login`, `/auth/register` | 10 / 15 min per IP **and** 5 / 15 min per email address |
| `POST /auth/refresh` | 60 / hour per IP |
| `POST /auth/oauth/exchange`, `GET /invitations/preview` | 30 / hour per IP |
| `POST /auth/password-reset/request` | 5 / 15 min per email **and** 10 / hour per IP |
| `POST /tenants/current/members` | 20 / hour per tenant |
| the rest of the API | 300 / min per account |

A `429` response with `Retry-After`. The API runs with `trust proxy` — the client address comes
from `X-Forwarded-For`.

Mobile traffic goes through carrier NAT, so many users share one IP. Per-IP limits apply to the
auth endpoints only and sit next to a per-email limit; the general limit counts per account, not
per IP.

---

## 8. `apps/panel`

SPA (Vite + React), `@ts-rest/react-query`, auth state in `zustand`, forms with
`react-hook-form` + zod using schemas from `packages/contract`. Feature-based layout
([3](#3-monorepo-structure)).

| Feature | Scope |
|---|---|
| `auth` | sign-in, invitation acceptance, session refresh |
| `tenants` | convention picker, dashboard, settings, language and time zone |
| `editions` | edition list, creation, activation, publication |
| `program` | the edition's programme items |
| `team` | convention team and edition permissions |
| `account` | account menu, language switcher |

| Path | Screen |
|---|---|
| `/login` | organizer sign-in |
| `/invitation` | invitation acceptance (`?token=`) |
| `/` | convention picker; redirect when there is a single membership |
| `/:tenantSlug` | tenant dashboard |
| `/:tenantSlug/editions` | edition list + creation |
| `/:tenantSlug/editions/:editionSlug` | edition data, activation, publication |
| `/:tenantSlug/editions/:editionSlug/program` | programme items |
| `/:tenantSlug/editions/:editionSlug/access` | team members' edition permissions |
| `/:tenantSlug/team` | `tenant_memberships` — list, invitations, permissions |
| `/:tenantSlug/settings` | name, slug, public website language, time zone; custom domain read-only |

- An interceptor attaches `X-Tenant-Slug` and `Accept-Language` based on the active locale.
- Language switcher in the account menu; the choice goes to `PATCH /me` and stays on the account.
- The compiled Lingui catalog is loaded through a dynamic import when the locale changes.
- `GET /me/memberships` after sign-in populates the permission store.
- The sidebar hides sections with a `none` permission; at `read` the save buttons are `disabled`.
- A `403` from the API -> a "no permissions" screen.
- Application start begins with `/auth/refresh` (the access token lives in memory only) — until the
  response arrives the user sees a loading view, not the sign-in screen.
- `401` -> an attempt at `/auth/refresh` with `credentials: 'include'`; on failure, sign-out.

---

## 9. `apps/portal`

Feature-based layout ([3](#3-monorepo-structure)).

| Feature | Scope |
|---|---|
| `landing` | the platform's home page, the privacy policy |
| `auth` | registration, sign-in, password reset, OAuth return |
| `account` | account settings, language, account deletion |
| `attendances` | "my conventions", edition sign-up, withdrawal |

| Path | Screen |
|---|---|
| `/` | OPOS platform landing page |
| `/privacy` | the privacy policy; linked from the registration form and the footer |
| `/register` | email + password + first and last name, Google button |
| `/login` | the same without the profile fields |
| `/forgot-password` | password reset request; always confirms that the message was sent |
| `/reset-password` | new password form (`?token=`) |
| `/oauth/callback` | receives `authCode`, calls `/auth/oauth/exchange` |
| `/account` | account settings, interface language, account deletion |
| `/my-conventions` | the list of editions the account is signed up for |
| `/join/:tenantSlug/:editionSlug` | edition sign-up; unauthenticated -> sign-in and back here |

`/join/...` is reached from the "Sign up" button on the public convention website.

**Account deletion:** `DELETE /me` after confirming with a password or a repeated OAuth sign-in.
It removes `accounts`; `oauth_identities`, `refresh_tokens` and `attendees` cascade. `409` when the
account is some tenant's last `head`.

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

---

## 11. `apps/mobile`

Expo (React Native) + expo-router. In the MVP a deliberate stub of the portal's scope
([PRODUCT.md 7](PRODUCT.md#7-mobile-application)): the same contract, the same translation
catalogs, the same account.

Feature-based layout ([3](#3-monorepo-structure)) — the same three features as the portal minus the
landing page: `auth`, `account`, `attendances`. The `app/` directory holds expo-router routes only;
views live in `features/<feature>/screens/`.

| Route | Screen |
|---|---|
| `/(auth)/login` | email + password, Google button |
| `/(auth)/register` | email + password + first and last name, Google button |
| `/(tabs)/conventions` | "my conventions" — the list of editions the account is signed up for |
| `/(tabs)/account` | account settings, language, account deletion |
| `/join/[tenantSlug]/[editionSlug]` | edition sign-up; signed out -> sign-in and back here |

The application contains no organizer panel and no public convention websites. The sign-in screen
links "Forgot password" and the registration screen links the privacy policy — both open the
portal's page in the system browser; the stub has no native flow for either.

### Session

- Sign-in with `purpose = mobile`; access token in memory, refresh in `expo-secure-store`.
- Application start: read the refresh token from the keychain -> `/auth/refresh` -> home screen or
  sign-in. Until the response arrives, the splash screen, not the sign-in screen.
- Sign-out clears the keychain and calls `/auth/logout` with the token in the body.
- `401` -> one `/auth/refresh` attempt; on failure, clear the keychain and go to sign-in.

### Deep links

The `opos://` scheme plus universal links / app links on `opos.land`:

| Link | Effect |
|---|---|
| `https://opos.land/join/<tenant>/<edition>` | opens the application on the sign-up screen; without the application — the portal |
| `opos://oauth/callback?authCode=...` | return from Google sign-in |

The `apple-app-site-association` and `assetlinks.json` files are served by `opos.land`
([14](#14-deployment)).

### Localization

`expo-localization` provides the device language; the detection order is the one in
[6](#6-localization). The catalogs are the same as on the web — `packages/i18n` contains nothing
DOM-dependent.

### Monorepo

Lingui macros run at compile time, so the application's `babel.config.js` must include
`@lingui/babel-plugin-lingui-macro`, and `pnpm i18n:compile` must pass before Metro starts.

Metro does not understand pnpm symlinks out of the box, so `apps/mobile` needs `watchFolders`
pointing at the repository root and a symlink resolver in `metro.config.js`. Shared packages are
consumed as TypeScript source, exactly as in the web applications.

`apps/mobile` is part of neither `docker-compose.prod.yml` nor the turbo `build` pipeline — it is
built through EAS.

### Releases

Builds through EAS: the `development` profile (development client), `preview` (internal
distribution), `production` (a signed artifact). In the MVP we release to TestFlight and Google
Play's internal channel; store publication is beyond the MVP.

---

## 12. Environment variables

No `.env` at the repository root: a root file hides which application consumes which variable and
turns every change into a cache invalidation for all of them. Each application keeps its own
`.env` next to a committed `.env.example`.

**`apps/api/.env`** — everything below belongs to the API and is read at runtime:

```bash
# Database - three roles
DATABASE_URL=postgres://opos_app:opos@localhost:5432/opos
DATABASE_GLOBAL_URL=postgres://opos_app_global:opos@localhost:5432/opos
DATABASE_MIGRATION_URL=postgres://opos_migrator:opos@localhost:5432/opos

# Cookies
COOKIE_DOMAIN=.localhost
COOKIE_SECURE=false

# JWT
JWT_ACCESS_SECRET=dev-access-secret-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
INVITE_SECRET=dev-invite-secret
INVITE_TTL=7d
PASSWORD_RESET_TTL=1h

# i18n
DEFAULT_LOCALE=pl
SUPPORTED_LOCALES=en,pl

# Addresses
ROOT_DOMAIN=localhost
API_URL=http://api.localhost:3001
PANEL_URL=http://panel.localhost:5173
PORTAL_URL=http://opos.localhost:5174
MOBILE_REDIRECT_SCHEME=opos://

# OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# SMTP (Mailpit in dev)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
MAIL_FROM=OPOS <noreply@opos.land>

# API
PORT=3001
NODE_ENV=development
OAUTH_STUB=false        # true only in e2e
```

**The other applications:**

| File | Variables |
|---|---|
| `apps/panel/.env` | `VITE_API_URL` |
| `apps/portal/.env` | `VITE_API_URL` |
| `apps/cms/.env` | `API_URL` — read at SSR runtime, not baked into the build |
| `apps/mobile/.env` | `EXPO_PUBLIC_API_URL` — in dev the machine's address on the local network (`http://192.168.x.x:3001`), because `localhost` from a device means that device |

`VITE_*` and `EXPO_PUBLIC_*` values are baked into the bundle at build time; turbo hashes them
through framework inference, so a changed value rebuilds exactly the applications that read it.

Production configuration lives in a `.env` next to `docker-compose.prod.yml` on the VPS — compose
injects it into the containers. It adds `POSTGRES_PASSWORD`, `ACME_EMAIL`, `CF_DNS_API_TOKEN` and
overrides `COOKIE_DOMAIN=.opos.land`, `COOKIE_SECURE=true`, `ROOT_DOMAIN=opos.land` and the
`https://` addresses.

---

## 13. Local development

Applications run natively through pnpm, infrastructure runs in Docker.

```bash
# 1. Infrastructure
docker compose up -d
# -> postgres on :5432, mailpit on :1025 (SMTP) + :8025 (UI)

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
created by the first migration.

Mailpit catches all dev email — UI at http://localhost:8025.

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

### Mobile application

```bash
pnpm --filter mobile start          # Expo dev server
pnpm --filter mobile ios            # iOS simulator
pnpm --filter mobile android        # Android emulator
```

The API must listen on `0.0.0.0`, and `EXPO_PUBLIC_API_URL` must point at the machine's address on
the local network. Google sign-in on a device requires the `opos://` scheme registered in
`app.json` — in the Expo development client that works only after building the `development`
profile, not in Expo Go.

---

## 14. Deployment

VPS + Docker Compose behind Traefik v3.

### Images

| Service | Dockerfile |
|---|---|
| `api` | multi-stage on `node:24-alpine`: prune -> `turbo run build` -> `node dist/main.js` |
| `panel`, `portal` | multi-stage: prune -> Vite build -> `nginx:alpine` with an SPA fallback |
| `cms` | multi-stage: prune -> Astro build -> `node ./dist/server/entry.mjs` |
| `postgres` | `postgres:16-alpine` with a `pgdata` volume |
| `traefik` | `traefik:v3`, docker provider + ACME resolvers |

Every application Dockerfile starts with `turbo prune <app> --docker`: the build context holds
only that application's slice of the dependency graph and a pruned lockfile, so a change in one
application does not invalidate the image layers of another.

### Routers

```
opos.land                    -> portal
panel.opos.land              -> panel
api.opos.land                -> api
HostRegexp(^.+\.opos\.land$) -> cms      # lower priority than the routers named above
<custom domains>             -> cms      # Traefik dynamic file
```

### TLS

Wildcard `*.opos.land` + `opos.land` through DNS-01 (`CF_DNS_API_TOKEN`).

A custom domain needs its own HTTP-01 certificate. Order of operations:

1. The customer points the domain's A record at the server IP.
2. The admin sets the domain through `PUT /admin/tenants/:tenantId/domain`.
3. The admin adds a router to Traefik's dynamic file with the HTTP-01 resolver.
4. Verification: `curl -I https://<domain>`.

Step 3 before step 1 ends in a failed ACME challenge and a Let's Encrypt rate limit.

### Universal links

`opos.land` serves two files verifying the association with the application:

| Path | For |
|---|---|
| `/.well-known/apple-app-site-association` | iOS; `Content-Type: application/json`, no file extension |
| `/.well-known/assetlinks.json` | Android |

Both are served by the `portal` container, and both must answer `200` over HTTPS without a
redirect — the operating systems fetch them directly and do not follow redirects.

### Backups

- `pg_dump -Fc` every 6 hours, into a volume outside `pgdata`.
- Retention: 7 daily, 4 weekly, 3 monthly.
- Off-server copy: `restic` or `rclone` to S3/R2, encrypted, with a separate key.
- Once a month, restore a dump into a clean database and run `pnpm db:verify`.
- Dumps are encrypted at rest — they contain attendees' personal data.

### Deployment procedure

1. `git pull` on the VPS.
2. `docker compose -f docker-compose.prod.yml build`.
3. `pg_dump` before the migration.
4. `docker compose -f docker-compose.prod.yml run --rm api pnpm db:migrate`.
5. `docker compose -f docker-compose.prod.yml run --rm api pnpm db:verify`.
6. `docker compose -f docker-compose.prod.yml up -d`.
7. The smoke test from chapter [17](#17-smoke-test).

---

## 15. Demo data (seed)

`packages/db/src/seed.ts`, idempotent. With `NODE_ENV=production` it fails unless
`--i-know-what-i-am-doing` is passed.

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

Supertest + Postgres in a container, no database mocks, in `apps/api/test`:

| Area | What we check |
|---|---|
| permission matrix | for every (endpoint, permission) pair: `none` -> `403`, `read` -> reads yes / writes `403`, `write` -> both; `head` passes everywhere |
| tenant isolation | the same set of requests with someone else's `X-Tenant-Slug` and someone else's identifiers -> `403` / `404` |
| RLS | a query on `opos_app` without `app.tenant_id` -> error; with tenant B's context -> zero rows of tenant A; an `insert` with a foreign `tenant_id` -> `WITH CHECK` violation |
| anti-escalation | an org cannot grant permissions above their own, edit themselves or touch a `head` |
| invariants | a second active edition, removing the last `head`, an `edition_membership` with a foreign edition |
| auth | refresh rotation, the three OAuth linking cases from [7.5](#75-google-oauth), rate limit -> `429` |
| password reset | `204` and no message for an unknown address; the token is single-use and expires; a completed reset revokes every refresh token and sets `emailVerifiedAt` |
| i18n | `lingui extract --check` reports no drift between code and catalogs; every error `code` from the contract has a descriptor in `errors.ts`; programme time formatting returns the tenant's zone, not the server's |

### 16.2 E2E tests

Playwright in `e2e/`, through the UI of all three web applications, against the full stack on a
fresh database.

**Environment:** `docker compose up -d` (Postgres + Mailpit), `pnpm db:migrate && pnpm db:seed`,
applications started through `webServer` in the Playwright configuration. Chromium; a browser
matrix is beyond the MVP. The `e2e` directory is a workspace package — Playwright, the fixtures
and the Maestro helpers are its dependencies, not the root's.

**Two crutches, without which e2e would be brittle:**

- `OAUTH_STUB=true` replaces the Google strategy with a local stub returning a fixed profile. The
  whole flow (`/start` -> `/callback` -> `authCode` -> `/exchange`) stays real, only Google
  disappears. We never sign in to a real Google account from e2e.
- Emails are read through Mailpit's HTTP API (`:8025/api/v1`) — that is where the test picks the
  invitation link from.

**Scenarios:**

| # | Scenario |
|---|---|
| 1 | Registration with a password, sign-out, sign-in again; the language switch survives the session |
| 2 | OAuth through the stub: a new account, linking to a verified account, taking over an account with an empty `emailVerifiedAt` |
| 3 | Refresh rotation: the session survives a page reload, the cookie disappears after sign-out |
| 4 | A head creates an edition, activates it, publishes it and adds programme items |
| 5 | The programme shows up in the CMS of both tenants, each in its own language and time zone |
| 6 | Organizer invitation: email from Mailpit -> acceptance -> the invitee sees only their edition |
| 7 | An org with `read`: no sidebar section, entering by URL -> the "no permissions" screen |
| 8 | Isolation: attempting to enter another tenant's convention through the UI and by a direct API request |
| 9 | An attendee signs up for an edition from the CMS, sees it under "my conventions", deletes the account |
| 10 | Password reset: request from the sign-in screen, the link from Mailpit sets a new password, the old session stops working |

Tests share no data: every scenario that creates a tenant works on its own slug, and scenarios
using seeded data only read it.

**Mobile — Maestro**, `e2e/maestro`, on the iOS simulator and the Android emulator, against the
same stack and the same OAuth stub. Three flows, because the remaining guarantees are already
covered by the API integration tests:

| # | Flow |
|---|---|
| 1 | Registration, sign-out, sign-in again; the session survives an application restart |
| 2 | Sign-in through the OAuth stub with a deep-link return |
| 3 | Edition sign-up and "my conventions"; the same sign-up visible after signing in to the portal |

### 16.3 CI

GitHub Actions on every PR. `turbo run typecheck lint test --affected` covers the packages changed
against `main` and their dependents; the turbo cache is persisted between runs with
`actions/cache`, so an unchanged task inside an affected package is still a cache hit.
`pnpm i18n:extract -- --check`, `pnpm db:verify` and `pnpm test:e2e` run in full on every PR.

The Maestro flows run in a separate job on a macOS runner, because that runner is slow and
expensive. The job is gated by `turbo-ignore mobile`: the dependency graph decides whether
`apps/mobile` is affected — directly or through `packages/contract` and `packages/i18n` — instead
of a hand-maintained path list. The runner receives `/etc/hosts` entries for `api.localhost`,
`panel.localhost`, `opos.localhost`, `convention-a.localhost` and `convention-b.localhost`.
Artifacts from failed runs (traces, video, screenshots) are kept for 7 days.

---

## 17. Smoke test

Run by hand after every deployment, on the production environment. The same flows run automatically
in e2e ([16.2](#162-e2e-tests)) — the smoke test exists to check them where e2e cannot reach: with
real TLS, real Google and real email delivery.

1. **Attendee registration.** `opos.land` -> registration by email -> "my conventions" with a
   signed-in session. With `Accept-Language: en` the portal is in English before sign-in; after
   changing the language in settings the choice survives sign-out and a fresh visit.
2. **Password reset.** The forgot-password form sends a real email; the link sets a new password,
   the previous password stops working and the earlier session is signed out.
3. **OAuth cannot take over an account.** An account created with a password on an address
   available in Google: after signing in with Google, `accounts.id` is unchanged, the password
   stops working and earlier sessions are revoked. For an account with `emailVerifiedAt` set, the
   password stays untouched.
4. **Refresh token rotation.** The old refresh -> `401`, the new one works; the cookie carries
   `HttpOnly` and is absent from `localStorage`.
5. **Edition activation.** A new 2027 edition activated -> 2026 loses `isActive`, and the database
   holds exactly one active Convention A edition.
6. **The programme reaches the website.** An item added in the panel shows up on
   `convention-a.localhost/program` (allowing for the 60 s tenant cache TTL).
7. **Organizer invitation.** A head invites an email with `program=write` for 2026 -> the message
   lands in Mailpit -> acceptance -> the invitee sees the 2026 programme and nothing else.
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
11. **Mobile application on a test release.** A build from TestFlight or Google Play's internal
   channel signs in with an account created in the portal, Google sign-in returns through a deep
   link, an edition sign-up made in the application is visible in the portal, and
   `https://opos.land/join/...` opens the application instead of the browser.

---

## 18. Execution rules

1. **Pinned versions** — Node `24.15.0` and pnpm `11.17.0`, enforced by `engineStrict`.
   Dependencies no younger than 7 days (`minimumReleaseAge`).
2. **No build step for the contracts** — `packages/contract`, `packages/db` and `packages/i18n`
   point `main`/`types` at `src/index.ts`. The only exception is the translation catalogs: they
   need `pnpm i18n:compile`, wired in as a dependency of `dev` and `build` ([3.1](#31-turbo-tasks)).
3. **Atomic commits**, Conventional Commits in English — the convention and the scopes live in
   [AGENTS.md](../AGENTS.md#commits), enforced by commitlint.
4. **Green before every PR** — `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm db:verify`.
   A change visible in the UI is additionally clicked through or checked with `curl`.
5. **No emoji in code or commit messages.**
6. **Every user-facing string inside a Lingui macro** — `<Trans>`, `t`, `plural`, `msg`. A bare
   literal in a prop or in JSX is a review error. The API returns a `code`, not a sentence. After
   adding a string, run `pnpm i18n:extract`; the `pl` translations may arrive later, the
   fallback to the English original covers them.
7. **English across the repository.** Code, table and column names, endpoints, route paths,
   comments in code and configuration, branch names, commits and all documentation — English.
   The only Polish in the repository is the `pl` translation catalog.
8. **Feature based in every frontend and in the mobile application.** A new screen starts with the
   question of which feature it belongs to; if none, a new feature is created rather than an
   application-level `components/` directory. Shared things go to `shared/`, never through an
   import from inside another feature.
