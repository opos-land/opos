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
10. [Supabase](#10-supabase)
11. [Environment variables](#11-environment-variables)
12. [Local development](#12-local-development)
13. [Deployment](#13-deployment)
14. [Demo data (seed)](#14-demo-data-seed)
15. [Tests](#15-tests)
16. [Smoke test](#16-smoke-test)
17. [Execution rules](#17-execution-rules)

---

## 1. Architecture

Three applications, three shared packages, one backend, and self-hosted Supabase for the database
and authentication.

```mermaid
graph TB
    traefik["Traefik v3 (wildcard TLS)"]
    portal["apps/portal<br>Vite + React"]
    panel["apps/panel<br>Vite + React"]
    api["apps/api<br>NestJS + Drizzle"]
    auth["Supabase Auth<br>GoTrue"]
    packages["packages/contract · packages/db · packages/i18n"]
    pg[("Supabase Postgres 17")]
    pay["payment provider<br>(the convention's account)"]

    traefik -->|"opos.land"| portal
    traefik -->|"panel.opos.land"| panel
    traefik -->|"api.opos.land"| api
    traefik -->|"auth.opos.land"| auth
    portal -.->|"sign-in"| auth
    panel -.->|"sign-in"| auth
    auth -.->|"send-email hook"| api
    portal -.->|"checkout redirect"| pay
    pay -.->|"payment webhook"| api
    portal --> packages
    panel --> packages
    api --> packages
    packages --> pg
    auth --> pg
```

| App | Stack | Role | Host |
|---|---|---|---|
| `apps/api` | NestJS + Drizzle + ts-rest | the only application backend; verifies Supabase Auth sessions | `api.opos.land` |
| `apps/panel` | Vite + React + Tailwind + shadcn/ui | organizer panel (SPA) and the ticket scanner under `/scanner` | `panel.opos.land` |
| `apps/portal` | Vite + React + Tailwind + shadcn/ui | landing page, registration, convention pages with the programme, likes, personal schedule, reviews, ticket checkout, "my tickets", "my conventions" (SPA, mobile-first) | `opos.land` |
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

**Hard-pinned versions:** Node `24.15.0` (`mise.toml` + `engines.node`), pnpm `11.17.0`
(`packageManager` + corepack, enabled by mise). `engineStrict: true` makes a mismatched
version abort the install instead of printing a warning.

**Repository tooling:** mise (tool versions), lefthook (git hooks), commitlint with
`config-conventional`, prettier.

**Backend:** NestJS, Drizzle ORM + postgres-js, `@ts-rest/nest`, `jose` (Supabase JWT
verification), `standardwebhooks` (send-email hook signatures), `@supabase/auth-js` (admin API),
nodemailer, `@nestjs/throttler`, `@nestjs/schedule` (expiring unpaid orders), `qrcode` (ticket
QR codes in emails).

**Authentication:** Supabase Auth (GoTrue), self-hosted ([10](#10-supabase)). Clients use
`@supabase/auth-js` directly against `auth.opos.land`.

**Frontend SPA:** Vite + React + TypeScript, Tailwind CSS + shadcn/ui, `@ts-rest/react-query`,
`@supabase/auth-js`, react-router, react-hook-form + zod, zustand, `@lingui/react`; in the
scanner the `BarcodeDetector` API with the `barcode-detector` polyfill.

**i18n:** Lingui — `@lingui/core`, `@lingui/react`, `@lingui/macro` macros, `@lingui/cli`.
`Intl` for dates, numbers and currencies.

**Tests:** supertest (integration), Playwright (web e2e, desktop and mobile viewports).

**Infrastructure:** Docker Compose, Traefik v3 (wildcard TLS via DNS-01), self-hosted Supabase —
`supabase/postgres` (PostgreSQL 17) and `supabase/gotrue`, Supabase Studio (dev), Mailpit (dev).

**Design principles:**

- ts-rest contracts with no build step.
- Supabase Auth owns identities and sessions; the API owns everything else.
- Clients never reach the database: no PostgREST, no Realtime, no Storage.
- OPOS never holds attendee money: payments go to the convention's own provider account, and the
  API keeps only the provider's payment reference.
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
  mise.toml                   # node 24.15.0, corepack for pnpm
  .prettierrc
  docker-compose.yml          # dev: supabase db + auth + studio, mailpit
  docker-compose.prod.yml     # prod: traefik + apps + supabase db + auth
  lefthook.yml                # hooks: prettier on staged files, commitlint on the message
  commitlint.config.mjs       # types, scopes, header length
  .prettierignore
  .gitignore
  AGENTS.md
  CLAUDE.md
  .github/
    workflows/ci.yml          # CI (15.3)
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
          guards/scanner-device.guard.ts
          guards/tenant-permission.guard.ts
          guards/edition-permission.guard.ts
          decorators/require-tenant.decorator.ts
          decorators/require-edition.decorator.ts
          decorators/current-account.decorator.ts
          filters/http-exception.filter.ts
        modules/
          auth/          # Supabase JWT verification, send-email hook, GoTrue admin client
          accounts/      # MeModule
          tenants/       # tenant + tenant_memberships + invitations
          editions/      # editions + edition_memberships
          program/       # programme items, speakers, review moderation
          engagement/    # likes, personal schedule, reviews
          shop/          # the tenant's payment provider configuration
          tickets/       # ticket types, orders in the panel, scanner pairing
          checkout/      # orders from the portal, payment webhooks
          payments/      # PaymentProvider port + one adapter per provider + the fake one
          scanner/       # ticket lookup and redemption for paired devices
          public/        # unauthenticated endpoints for the portal
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
          shop/
          tickets/
          scanner/
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
        features/{landing,auth,account,attendances,conventions,schedule,speaking,tickets}/
        shared/{ui,lib,config}/
      .env.example       # VITE_API_URL, VITE_AUTH_URL
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
        program.ts
        engagement.ts
        shop.ts
        tickets.ts
        checkout.ts
        scanner.ts
        public.ts
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
          program-items.ts
          program-item-speakers.ts
          program-item-likes.ts
          program-item-reviews.ts
          tenant-payment-configs.ts
          ticket-types.ts
          orders.ts
          tickets.ts
          scanner-devices.ts
          attendees.ts
        seed.ts
        scripts/
          create-tenant.ts   # db:tenant:create
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
      base.json, node.json, react.json
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
| `db:generate`, `db:migrate`, `db:push`, `db:seed`, `db:verify`, `db:tenant:create` | — | — | no; the database and generated migrations are side effects |
| `db:studio` | — | — | no; `persistent: true` |

- The `db:*` tasks exist only in `packages/db`, `test:e2e` only in `e2e`.
- Frontend build-time variables (`VITE_*`) enter task hashes through turbo's framework inference.
  The API's variables are read at runtime and stay out of the hash
  ([11](#11-environment-variables)).

### 3.2 Frontend application layout

The panel and the portal share one layout: **feature based**. No directory for a
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

Routes stay thin: a route definition holds no logic, it only mounts a view from the right
feature.

A feature never reaches the database or `fetch` directly: all network traffic goes through that
feature's `api/`, built on the API client and the auth client from `shared/lib`.

`shared/ui` starts from shadcn/ui, restyled to the designer's tokens (colours, typography,
spacing, radii). No image or illustration in `shared/ui` or in a feature is AI-generated
([17](#17-execution-rules)).

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
| admin | no table: works on the database directly, through `pnpm db:tenant:create` |
| org, head | `tenant_memberships` (+ optionally `edition_memberships`) |
| user | `auth.users` + `accounts` + rows in `attendees` |
| tenant | `tenants` |
| edition | `editions` |
| programme item | `program_items` |
| speaker | `program_item_speakers` |
| like | `program_item_likes` |
| review | `program_item_reviews` |
| ticket type | `ticket_types` |
| order | `orders` |
| ticket | `tickets` |
| scanner | `scanner_devices` |
| attendee | `attendees` |

### 4.1 Enums

```ts
permissionLevel  = pgEnum('permission_level',  ['none', 'read', 'write'])
tenantRole       = pgEnum('tenant_role',       ['head', 'org'])
reviewVisibility = pgEnum('review_visibility', ['public', 'speakers'])
orderStatus      = pgEnum('order_status',      ['pending', 'paid', 'expired', 'cancelled'])
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
`defaultLocale` (text, default `pl`), `timezone` (IANA text, default `Europe/Warsaw`).

**`tenant_memberships`** — `accountId` (FK cascade), `tenantId` (FK cascade), `role`,
`settingsAccess`, `brandingAccess`, `shopConfigAccess` (default `none`),
`expiresAt` (timestamptz, nullable). Check `role = 'org' or expiresAt is null`.
Unique `(accountId, tenantId)` and `(id, tenantId)`. Index on `tenantId`.

**`tenant_payment_configs`** — `tenantId` (FK cascade, unique), `provider` (text, the adapter
name), `accountRef` (text, the convention's account identifier at the provider),
`credentialsEncrypted` (bytea, nullable; AES-256-GCM with `PAYMENT_CONFIG_KEY`), `currency`
(char(3), default `PLN`). Credentials are write-only: no endpoint returns them.

A membership with `expiresAt <= now()` is **expired**: every read that grants access filters it
out, so the account behaves as if it were not in the team. The row stays until someone removes it
or extends it.

### 4.4 Edition-level tables

**`editions`** — `tenantId` (FK cascade), `slug`, `name`, `startsAt`, `endsAt`,
`isActive` (default `false`), `isPublished` (default `false`).
Unique `(tenantId, slug)` and `(id, tenantId)`. Partial unique index `(tenantId) WHERE isActive`.

**`edition_memberships`** — `tenantId`, `tenantMembershipId`, `editionId` (FK cascade),
`programAccess`, `websiteContentAccess`, `ticketsAccess` (default `none`).
Unique `(tenantMembershipId, editionId)`. Composite foreign keys `(tenantMembershipId, tenantId)`
and `(editionId, tenantId)`.

**`program_items`** — `tenantId`, `editionId` (FK cascade), `title`, `description` (nullable),
`startsAt`, `endsAt`. Unique `(id, tenantId)`. Index `(tenantId, editionId, startsAt)`.

**`program_item_speakers`** — `tenantId`, `programItemId` (FK cascade), `accountId` (FK cascade).
Unique `(programItemId, accountId)`. Composite foreign key `(programItemId, tenantId)`. Index
`(accountId)`.

**`program_item_likes`** — `tenantId`, `programItemId` (FK cascade), `accountId` (FK cascade).
Unique `(programItemId, accountId)`. Composite foreign key `(programItemId, tenantId)`. Indexes
`(tenantId, programItemId)` and `(accountId)`.

**`program_item_reviews`** — `tenantId`, `programItemId` (FK cascade), `accountId` (FK cascade),
`rating` (smallint, check 1–5), `comment` (text, nullable, up to 2000 characters),
`isAnonymous` (default `false`), `visibility` (`review_visibility`, default `public`),
`hiddenAt` (timestamptz, nullable), `hiddenByAccountId` (nullable, FK set null).
Unique `(programItemId, accountId)`. Composite foreign key `(programItemId, tenantId)`. Indexes
`(tenantId, programItemId)` and `(accountId)`.

**`ticket_types`** — `tenantId`, `editionId` (FK cascade), `name`, `priceMinor` (integer, in the
tenant's currency), `quantity` (integer, nullable = no limit), `salesStartAt`, `salesEndAt`,
`isActive` (default `true`). Unique `(id, tenantId)`. Index `(tenantId, editionId)`.

**`orders`** — `tenantId`, `editionId` (FK restrict), `email` (lowercase), `firstName`, `lastName`,
`locale`, `status` (`order_status`, default `pending`), `totalMinor`, `currency`,
`holdExpiresAt`, `providerPaymentRef` (unique, nullable), `paidAt`, `cancelledAt`,
`accessTokenHash` (sha256 of the token in the order link). Unique `(id, tenantId)`. Indexes
`(tenantId, editionId, status)` and `(email)`.

**`tickets`** — `tenantId`, `orderId` (FK cascade), `ticketTypeId` (FK restrict), `code` (unique,
22 characters base62, 128 random bits), `redeemedAt` (nullable), `redeemedByDeviceId` (nullable).
Composite foreign keys `(orderId, tenantId)` and `(ticketTypeId, tenantId)`. Index
`(tenantId, orderId)`. A ticket is valid when its order is `paid`.

**`scanner_devices`** — `tenantId`, `editionId` (FK cascade), `name`, `tokenHash` (unique, sha256),
`pairingJti` (unique), `createdByMembershipId`, `expiresAt` (the edition's `endsAt` + 1 day),
`revokedAt` (nullable). Index `(tenantId, editionId)`.

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
6. **A `head` membership never expires** — the check constraint on `tenant_memberships`.
7. **A review exists only for an item that has started, written by an eligible account** —
   checked in `EngagementModule` on every write: `program_items.startsAt <= now()`, and the author
   holds a valid ticket for the item's edition (a `paid` order placed with the account's email), is
   a non-expired `head`, or is a non-expired `org` with an `edition_memberships` row for that
   edition.
8. **Speakers, likes and reviews belong to the tenant of their programme item** — enforced by
   composite foreign keys.
9. **No ticket type sells beyond its `quantity`** — checkout locks the ticket type rows
   (`select ... for update`) and counts tickets in `paid` orders plus `pending` orders whose
   `holdExpiresAt` is in the future.
10. **A ticket is redeemed once** — `update tickets set redeemedAt = now() ... where redeemedAt is
    null`; zero updated rows means it was already used.
11. **A scanner works only inside its edition** — every scanner query filters on the device's
    `editionId`; a ticket from another edition is `404`.

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

`tenants`, `tenant_memberships`, `editions`, `edition_memberships`, `program_items`,
`program_item_speakers`, `program_item_likes`, `program_item_reviews`, `tenant_payment_configs`,
`ticket_types`, `orders`, `tickets`, `scanner_devices`, `attendees`.

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
alter table program_items enable row level security;
alter table program_items force  row level security;

create policy tenant_isolation on program_items
  using      (tenant_id = current_setting('app.tenant_id')::uuid)
  with check (tenant_id = current_setting('app.tenant_id')::uuid);

grant select, insert, update, delete on program_items to opos_app;
```

The same for the remaining tables; for `tenants` the condition is `id = current_setting(...)`.
`current_setting` without the `missing_ok` argument — a missing context has to raise an error, not
return zero rows.

#### Cross-tenant queries

Only through `GlobalDbService` on the `opos_app_global` role. The complete list:

| Query | Constraint |
|---|---|
| tenant lookup by slug | returns only `id`, `slug`, `name`, `defaultLocale`, `timezone` |
| `GET /me/memberships` | `where account_id = <account from the JWT>`, expired memberships excluded |
| `GET /me/attendances` | `where account_id = <account from the JWT>` |
| `GET /me/schedule` | `where account_id = <account from the JWT>` on `program_item_likes` |
| `GET /me/program-items` | `where account_id = <account from the JWT>` on `program_item_speakers` |
| `GET /me/tickets` | `where email = <confirmed email of the account from the JWT>` on `orders` |
| payment webhook | order lookup by the `orderId` from a verified webhook; returns only `id`, `tenantId` |
| order status link | order lookup by `id` and `accessTokenHash`; returns only `id`, `tenantId` |
| scanner request | device lookup by `tokenHash`, not revoked, not expired; returns only `id`, `tenantId`, `editionId` |

Every query in `GlobalDbService` carries an `accountId` or `email` condition from the JWT, or a
secret the caller proved it holds (a webhook signature, an order token, a device token); adding
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
a Standard Webhooks signature ([10](#10-supabase)) — and `POST /hooks/payments/:provider`, called
by the payment provider only ([7.10](#710-payments)).

### 5.2 `me` — requires JWT

| Method | Path | Description |
|---|---|---|
| GET | `/me` | account profile |
| PATCH | `/me` | change `firstName`, `lastName`, `locale` |
| DELETE | `/me` | delete the account; `409` when it is some tenant's last `head`; `401` without a sign-in from the last 5 minutes |
| GET | `/me/memberships` | tenants with role and permissions, edition-level included; expired memberships left out |
| GET | `/me/attendances` | "my conventions" |
| GET | `/me/schedule` | liked programme items across all tenants, ascending by `startsAt` |
| GET | `/me/program-items` | programme items where the account is a speaker, with their non-hidden reviews |
| GET | `/me/tickets` | tickets from `paid` orders placed with the account's email, across all tenants, with their codes |
| POST | `/me/attendances` | `{ tenantSlug, editionSlug, firstName, lastName }`; `409` on a repeat sign-up, `404` for an unpublished edition |
| DELETE | `/me/attendances/:attendeeId` | withdraw |

### 5.3 `tenants` — JWT + `X-Tenant-Slug`

| Method | Path | Required permission |
|---|---|---|
| GET | `/tenants/current` | membership |
| PATCH | `/tenants/current` | `settings=write` (`name`, `slug`, `defaultLocale`, `timezone`) |
| GET | `/tenants/current/members` | `settings>=read` |
| POST | `/tenants/current/members` | `settings=write` |
| PATCH | `/tenants/current/members/:membershipId` | `settings=write` + anti-escalation (permissions, `expiresAt`) |
| DELETE | `/tenants/current/members/:membershipId` | `settings=write` + anti-escalation |
| GET | `/tenants/current/payment-config` | `shop>=read`; provider, `accountRef`, currency, whether credentials are set |
| PUT | `/tenants/current/payment-config` | `shop=write`; `{ provider, accountRef, credentials?, currency }` |

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

### 5.5 `program` — JWT + `X-Tenant-Slug` + edition permission

| Method | Path | Required permission |
|---|---|---|
| GET | `/editions/:editionId/program-items` | `program>=read` |
| POST | `/editions/:editionId/program-items` | `program=write` |
| PATCH | `/editions/:editionId/program-items/:programItemId` | `program=write` |
| DELETE | `/editions/:editionId/program-items/:programItemId` | `program=write` |
| PUT | `/editions/:editionId/program-items/:programItemId/speakers` | `program=write`; `{ emails }` replaces the list; an email without an account -> `404` `speaker.account-not-found` |
| GET | `/editions/:editionId/program-items/:programItemId/reviews` | `program>=read`; hidden reviews included, anonymous authors without a name |
| PUT | `/editions/:editionId/program-items/:programItemId/reviews/:reviewId/hidden` | `program=write`; hides the review |
| DELETE | `/editions/:editionId/program-items/:programItemId/reviews/:reviewId/hidden` | `program=write`; shows it again |

Validation: `endsAt > startsAt`, `title` 3–200 characters, `description` up to 5000 characters,
up to 10 speakers per item.

### 5.6 `engagement` — JWT + `X-Tenant-Slug`, no membership required

| Method | Path | Description |
|---|---|---|
| PUT | `/editions/:editionId/program-items/:programItemId/like` | like; idempotent; `404` for an unpublished edition |
| DELETE | `/editions/:editionId/program-items/:programItemId/like` | remove the like |
| PUT | `/editions/:editionId/program-items/:programItemId/review` | `{ rating, comment?, isAnonymous, visibility }`; creates or replaces the account's review; `403` `review.not-eligible`, `409` `review.not-started` |
| DELETE | `/editions/:editionId/program-items/:programItemId/review` | delete the account's review |

Eligibility and start time are checked as invariant 7 in [4.5](#45-invariants) describes.

### 5.7 `public` — unauthenticated

| Method | Path | Description |
|---|---|---|
| GET | `/public/tenants/:slug` | tenant name, `defaultLocale`, `timezone`; `404` when unknown |
| GET | `/public/tenants/:slug/editions` | published editions, descending by `startsAt` |
| GET | `/public/tenants/:slug/editions/active` | the active and published edition |
| GET | `/public/tenants/:slug/editions/:editionSlug` | a single published edition |
| GET | `/public/tenants/:slug/editions/:editionSlug/program-items` | programme, ascending by `startsAt`, with speaker names, `likeCount`, `ratingAverage`, `reviewCount` |
| GET | `/public/tenants/:slug/editions/:editionSlug/program-items/:programItemId` | programme item details with the same counters |
| GET | `/public/tenants/:slug/editions/:editionSlug/program-items/:programItemId/reviews` | public, non-hidden reviews; anonymous authors without a name |

The `isPublished = true` filter lives in the repository, not in the controller. Counters and
averages count non-hidden reviews only. Who liked an item is never returned.

### 5.8 `tickets` — JWT + `X-Tenant-Slug` + edition permission

| Method | Path | Required permission |
|---|---|---|
| GET | `/editions/:editionId/ticket-types` | `tickets>=read`; with sold and held counts |
| POST | `/editions/:editionId/ticket-types` | `tickets=write` |
| PATCH | `/editions/:editionId/ticket-types/:ticketTypeId` | `tickets=write`; `quantity` cannot drop below the sold count -> `409` `tickets.quantity-below-sold` |
| GET | `/editions/:editionId/orders` | `tickets>=read`; filters `status`, `email`; paginated |
| GET | `/editions/:editionId/orders/:orderId` | `tickets>=read`; with tickets and redemption state |
| POST | `/editions/:editionId/orders/:orderId/cancel` | `tickets=write`; only a `paid` order; the refund itself happens at the provider |
| POST | `/editions/:editionId/scanner-devices/pairing` | `tickets=write`; returns a pairing token (JWT, `SCANNER_PAIRING_SECRET`, TTL 10 minutes) for the QR code |
| GET | `/editions/:editionId/scanner-devices` | `tickets>=read` |
| DELETE | `/editions/:editionId/scanner-devices/:deviceId` | `tickets=write`; sets `revokedAt` |

Validation: `priceMinor >= 0`, `salesEndAt > salesStartAt`, `name` 2–100 characters.

### 5.9 `checkout` — unauthenticated, JWT optional

| Method | Path | Description |
|---|---|---|
| GET | `/public/tenants/:slug/editions/:editionSlug/ticket-types` | types on sale now, with price and availability (`available`, `sold-out`) |
| POST | `/public/tenants/:slug/editions/:editionSlug/orders` | `{ email, firstName, lastName, items: [{ ticketTypeId, quantity }] }`; up to 10 tickets; creates a `pending` order holding the tickets for `ORDER_HOLD_MINUTES` and returns the provider's checkout URL; `409` `tickets.sold-out`, `409` `tickets.not-on-sale`, `409` `shop.not-configured` |
| GET | `/public/orders/:orderId?token=` | order status; for a `paid` order the tickets with their codes |

The order link (`<PORTAL_URL>/orders/:orderId?token=`) is the provider's return URL and goes into
the ticket email; the token is 32 random bytes, stored hashed.

### 5.10 `scanner` — device token

`Authorization: Bearer <device token>` instead of a JWT; `ScannerDeviceGuard` resolves the device
and opens the tenant context ([7.11](#711-scanner)).

| Method | Path | Description |
|---|---|---|
| POST | `/scanner/pair` | `{ pairingToken, name }`, no auth; returns the device token and the edition name; a reused pairing token -> `409` |
| GET | `/scanner/tickets/:code` | the ticket's order: buyer name, every ticket with type and `redeemedAt`, whether the order is valid; another edition's ticket -> `404` |
| POST | `/scanner/tickets/redeem` | `{ codes }`; redeems each; per code `redeemed`, `already-redeemed` (with the first `redeemedAt`) or `invalid` |

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

The per-application split keeps the portal from pulling in the panel's messages. Compiled catalogs are
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
| emails | the recipient's `accounts.locale` -> `locale` from the sign-up metadata -> for an unknown address the inviting `tenants.defaultLocale` -> `DEFAULT_LOCALE` |
| ticket emails | `orders.locale`, taken from the portal's active locale at checkout |

### API errors

The API returns a `code`, never a sentence. `packages/i18n/src/errors.ts` maps a `code` onto a
descriptor from the `msg` macro, and the client renders it through `i18n._(descriptor, params)`.
Supabase Auth's `error_code` values are mapped in the same file under `auth.<error_code>`; an
unmapped one renders a generic "Something went wrong" message. A new `code` in the contract
without an entry in that map fails a test ([15.1](#151-api-integration-tests)).

Emails are rendered by the API — it activates the recipient's catalog and composes the content
through `@lingui/core`. That includes Supabase Auth's confirmation, recovery and email change
messages, which reach the API through the send-email hook ([10](#10-supabase)).

### Formatting

- Dates and times: `Intl.DateTimeFormat` with a locale **and** an explicit time zone.
- Programme times are always formatted in `tenants.timezone`, never in the browser's zone.
- Numbers and currencies: `Intl.NumberFormat`.

### Tenant content

Names and programme item descriptions are single-language — in the tenant's `defaultLocale`.
Review comments stay in whatever language their author wrote. None of it passes through Lingui:
it is data, not interface messages.

---

## 7. `apps/api`

### 7.1 Modules

| Module | Contents |
|---|---|
| `AuthModule` | `JwtAuthGuard` (Supabase JWT verification), the `POST /hooks/send-email` controller, the GoTrue admin client |
| `MeModule` | profile, memberships, edition sign-ups, personal schedule, speaker's items, account deletion |
| `TenantsModule` | tenant data, `tenant_memberships` with expiry, invitations |
| `EditionsModule` | edition CRUD, activation, `edition_memberships` |
| `ProgramModule` | programme item CRUD, speakers, review moderation |
| `EngagementModule` | likes and reviews, with the review eligibility check |
| `PublicModule` | unauthenticated endpoints for the portal's convention pages |
| `ShopModule` | `tenant_payment_configs`, credential encryption |
| `TicketsModule` | ticket types, orders in the panel, cancellation, scanner pairing and revocation |
| `CheckoutModule` | orders from the portal, the payment webhook, the job expiring unpaid orders, the ticket email |
| `PaymentsModule` | the `PaymentProvider` port and its adapters ([7.10](#710-payments)) |
| `ScannerModule` | `ScannerDeviceGuard`, ticket lookup and redemption |
| `MailModule` | nodemailer + Lingui templates per locale: Supabase Auth emails and invitations ([6](#6-localization)) |

### 7.2 Tenant context

`TenantResolverMiddleware` (global, ahead of the guards):

1. Reads `X-Tenant-Slug`. No header -> empty context.
2. Loads the tenant by slug through `GlobalDbService`; an unknown slug -> `404`.
3. Loads the current account's `tenant_membership`, skipping an expired one.
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
  m = ALS.tenantMembership                # never an expired one
  if !m                                   -> 403
  if m.role == 'head'                     -> allow
  if rank(m[resource]) >= rank(required)  -> allow
  -> 403

checkEdition(editionId, resource, required):
  edition = load(editionId)
  if edition.tenantId != ALS.tenantId     -> 404
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
async createProgramItem() { ... }
```

`EditionPermissionGuard` first checks that the edition belongs to the tenant from ALS and returns
`404` on a mismatch.

### 7.4 Authorization

Sessions are issued by Supabase Auth ([10](#10-supabase)):

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
puts it into the request — `locale` comes from the database, not from the token. A valid token without an `accounts` row -> `401`. The JWT holds no `tenantId`.

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

`redirectTo` must match `GOTRUE_URI_ALLOW_LIST` exactly ([10](#10-supabase)); anything else falls
back to `GOTRUE_SITE_URL`. Supabase Auth never redirects to an arbitrary address from the request.

Required behaviour when the email already exists, checked in the smoke test
([16](#16-smoke-test)):

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
`{ tenantId, email, role, tenantPermissions, editionPermissions, expiresAt }`.

- Email of a known account (`accounts.email`) -> the membership is created immediately, the email
  is a notification.
- Unknown email -> an email with a `panel.opos.land/invitation?token=...` link; after registering
  or signing in, `POST /invitations/accept` creates the membership.
- Permissions from the token go through the anti-escalation check.

Invitation emails are sent by `MailModule`, not by Supabase Auth.

### 7.8 CORS

Allowed `Origin`: `opos.land` and `panel.opos.land` (the scanner included) — an explicit list,
never `*` and never a reflected header. Allowed headers: `Authorization`, `Content-Type`, `X-Tenant-Slug`,
`Accept-Language`. `credentials: false` — the API sets and reads no cookies.

`POST /hooks/send-email` and `POST /hooks/payments/:provider` are called server to server and need
no CORS; they reject every request without a valid signature.

### 7.9 Rate limiting

`@nestjs/throttler`, counters in process memory.

| Scope | Limit |
|---|---|
| `GET /invitations/preview` | 30 / hour per IP |
| `POST /tenants/current/members` | 20 / hour per tenant |
| `PUT .../review` | 30 / hour per account |
| `POST /public/.../orders` | 10 / 10 min per IP |
| `GET /public/orders/:orderId` | 60 / min per IP |
| `POST /scanner/pair` | 10 / hour per IP |
| `/scanner/*` | 600 / min per device |
| the rest of the API | 300 / min per account |

A `429` response with `Retry-After`. The API runs with `trust proxy` — the client address comes
from `X-Forwarded-For`.

Sign-up, sign-in, refresh and recovery are limited by Supabase Auth and by Traefik in front of it
([10](#10-supabase)).

### 7.10 Payments

One provider in the MVP, chosen when the module is implemented. Requirements: payments land in an
account owned by the convention, BLIK, Przelewy24 and cards, a hosted payment page, signed
webhooks, a payment session that expires with the order's hold.

```ts
interface PaymentProvider {
  name: string
  createCheckout(config: PaymentConfig, order: Order, returnUrl: string): Promise<{ url: string; paymentRef: string }>
  verifyWebhook(headers: Headers, rawBody: Buffer): Promise<PaymentEvent>   // throws on a bad signature
}

type PaymentEvent = { orderId: string; paymentRef: string; status: 'paid' | 'failed'; amountMinor: number; currency: string }
```

- `PAYMENT_PROVIDER=fake` in dev and tests: a page at `<API_URL>/dev/payments/:orderId` with "Pay"
  and "Fail" buttons that calls the webhook with a valid signature. The fake adapter does not load
  when `NODE_ENV=production`.
- Webhook: verify the signature -> look up the order ([4.6](#46-tenant-isolation--rls-in-postgres))
  -> open its tenant context -> compare amount and currency with the order (a mismatch is logged
  and the order stays `pending`) -> `pending` becomes `paid`, `paidAt` is set, the ticket email
  goes out. An order already `paid` answers `200` without a second email.
- A payment that arrives after the hold expired still marks the order `paid`: the money is taken.
  The panel flags a ticket type sold above its `quantity`.
- A job every minute flips `pending` orders past `holdExpiresAt` to `expired`; availability counts
  already ignore them.
- Ticket email: `MailModule`, the order's locale, one QR code per ticket as an inline PNG
  (`qrcode`), the payload `OPOS1:<code>`, and the order link.

### 7.11 Scanner

1. An org with `tickets=write` opens the scanner screen in the panel; the panel requests a pairing
   token and shows it as a QR code.
2. The phone opens `panel.opos.land/scanner`, scans that code and calls `POST /scanner/pair`. The
   API checks the token, records its `jti` in `scanner_devices.pairingJti` and returns a device
   token: 32 random bytes, stored as sha256.
3. The phone keeps the device token in `localStorage` (`opos-scanner-device`) and sends it on every
   request. No sign-in, no Supabase session.
4. `ScannerDeviceGuard` hashes the token, finds a device that is neither revoked nor past
   `expiresAt` through `GlobalDbService`, then opens the tenant transaction exactly like
   `TenantTransactionInterceptor`; anything else -> `401` and the phone returns to pairing.

The scanner is online only: no local ticket list, no queue of offline redemptions.

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
| `program` | the edition's programme items, their speakers, review moderation |
| `shop` | the payment provider account and currency |
| `tickets` | ticket types, orders, cancellation, paired scanners |
| `scanner` | the scanner itself: pairing, camera, manual code entry, redemption |
| `team` | convention team, edition permissions, membership expiry |
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
| `/:tenantSlug/editions/:editionSlug/program/:programItemId` | item form, speakers, reviews with hide and show |
| `/:tenantSlug/editions/:editionSlug/access` | team members' edition permissions |
| `/:tenantSlug/team` | `tenant_memberships` — list, invitations, permissions, expiry date |
| `/:tenantSlug/settings` | name, slug, convention language, time zone |
| `/:tenantSlug/shop` | payment provider account, currency; credentials write-only |
| `/:tenantSlug/editions/:editionSlug/tickets` | ticket types with sold and held counts |
| `/:tenantSlug/editions/:editionSlug/tickets/orders` | orders, search by email, order details, cancellation |
| `/:tenantSlug/editions/:editionSlug/tickets/scanners` | pairing QR code, paired devices, revocation |
| `/scanner` | the scanner on a phone: pairing, then scan -> order view -> tick tickets handed in |

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
- `/scanner` is the one mobile-first screen of the panel and the only one that works without a
  sign-in. Camera access through `getUserMedia`; the panel is served with
  `Permissions-Policy: camera=(self)`. A text field accepts the code when the camera cannot read
  it.

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
| `conventions` | a convention's page: the active edition's programme, past editions, item details, likes, reviews |
| `schedule` | the personal schedule built from likes |
| `speaking` | the speaker's programme items and the reviews they received |
| `tickets` | ticket checkout, order status, "my tickets" |

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
| `/conventions/:tenantSlug` | the active edition's programme grouped by day, a "Sign up" button, past editions |
| `/conventions/:tenantSlug/:editionSlug` | a past or active edition's programme |
| `/conventions/:tenantSlug/:editionSlug/program/:programItemId` | item details: speakers, like button, rating, public comments, review form once the item has started |
| `/schedule` | liked items across conventions, grouped by day |
| `/my-program-items` | the speaker's items with every non-hidden review |
| `/conventions/:tenantSlug/:editionSlug/tickets` | ticket types on sale, quantities, buyer's email and name (prefilled when signed in), redirect to the payment provider |
| `/orders/:orderId` | order status from the link (`?token=`); after payment the tickets with QR codes |
| `/my-tickets` | tickets bought with the account's email, grouped by edition, with QR codes |

Convention pages work without signing in. Liking or reviewing while signed out leads to sign-in
and back to the same item. Programme times are formatted in the tenant's time zone. No active
published edition -> a "Preparations under way" message and the list of past editions; an
unpublished edition under a direct URL or an unknown tenant -> `404`.

`/join/...` is reached from the "Sign up" button on the convention's page.

**Account deletion:** `DELETE /me` after confirming with a password or a repeated Google sign-in
([7.4](#74-authorization)). The API deletes the user through the GoTrue admin API
(`DELETE /admin/users/:id`); `accounts` cascades from `auth.users`, and `tenant_memberships`,
`edition_memberships`, `attendees`, `program_item_speakers`, `program_item_likes` and
`program_item_reviews` cascade from `accounts`. Orders are linked by email, not by account, and
stay. `409` when the account is some
tenant's last `head`.

---

## 10. Supabase

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
for `POST /admin/users` ([14](#14-demo-data-seed)). The key never reaches a frontend.

### Rate limits

GoTrue's built-in limits stay at their defaults, keyed by the client IP from `X-Forwarded-For`.
Traefik adds a `rateLimit` middleware on the `auth.opos.land` router: an average of 30 requests per
minute per IP, burst 10, a `429` above that.

---

## 11. Environment variables

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

# Tickets
PAYMENT_PROVIDER=fake
PAYMENT_CONFIG_KEY=ZGV2LXBheW1lbnQtY29uZmlnLWtleS0zMi1ieXRlcyE=
ORDER_HOLD_MINUTES=15
SCANNER_PAIRING_SECRET=dev-scanner-pairing-secret

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
API's) and the dev addresses. The full list of the `auth` variables is in [10](#10-supabase).

**The other applications:**

| File | Variables |
|---|---|
| `apps/panel/.env` | `VITE_API_URL`, `VITE_AUTH_URL` |
| `apps/portal/.env` | `VITE_API_URL`, `VITE_AUTH_URL` |

`VITE_*` values are baked into the bundle at build time; turbo hashes them through framework
inference, so a changed value rebuilds exactly the applications that read it.

Production configuration lives in a `.env` next to `docker-compose.prod.yml` on the VPS — compose
injects it into the containers. It adds `POSTGRES_PASSWORD`, `ACME_EMAIL`, `CF_DNS_API_TOKEN` and
the Supabase Auth variables, and overrides `ROOT_DOMAIN=opos.land` and the `https://` addresses.
`JWT_SECRET` and `SEND_EMAIL_HOOK_SECRET` are generated once per environment and are never reused
between dev and production.

---

## 12. Local development

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
```

`/etc/hosts`:

```
127.0.0.1 api.localhost panel.localhost opos.localhost
```

Root scripts: `dev`, `build`, `typecheck`, `lint`, `format`, `test`, `test:e2e`, `i18n:extract`,
`i18n:compile`, `db:generate`, `db:migrate`, `db:push`, `db:seed`, `db:studio`, `db:verify`,
`db:tenant:create`.
Apart from `format`, each of them is a `turbo run <task>` delegate ([3.1](#31-turbo-tasks)).

`db:migrate` and `db:seed` connect as `opos_migrator`; the API runs as `opos_app`. The roles are
created by `infra/supabase/db/opos-roles.sql` when the `db` container starts on an empty volume —
`docker compose down -v` resets them together with the data.

Mailpit catches all dev email — UI at http://localhost:8025. Supabase Auth's messages land there
too, because they go through the API's send-email hook. Payments go through the fake provider
page at http://api.localhost:3001/dev/payments/:orderId ([7.10](#710-payments)). Supabase Studio at http://localhost:54323
browses both the `public` and the `auth` schema.

### Versions and dependencies

Tool versions come from `mise.toml`: `mise install` in the repository root installs Node and,
through `node.corepack = true`, enables corepack, which then provides the pnpm version pinned by
the `packageManager` field. pnpm is pinned only there, never in `mise.toml`. Activated mise
(`mise activate`) switches versions on entering the directory. A version bump changes `mise.toml`
and `engines` together (Node) or `packageManager` and `engines` together (pnpm).

`mise.toml` holds no tasks: task logic lives in turbo and root scripts ([3.1](#31-turbo-tasks)).

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

## 13. Deployment

VPS + Docker Compose behind Traefik v3.

### Images

| Service | Dockerfile / image |
|---|---|
| `api` | multi-stage on `node:24-alpine`: prune -> `turbo run build` -> `node dist/main.js` |
| `panel`, `portal` | multi-stage: prune -> Vite build -> `nginx:alpine` with an SPA fallback and the CSP header ([7.4](#74-authorization)) |
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
auth.opos.land               -> auth     # + rateLimit middleware (10)
```

`db` has no router and publishes no port.

### TLS

Wildcard `*.opos.land` + `opos.land` through DNS-01 (`CF_DNS_API_TOKEN`).

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
8. The smoke test from chapter [16](#16-smoke-test).

---

## 14. Demo data (seed)

`packages/db/src/seed.ts`, idempotent. With `NODE_ENV=production` it fails unless
`--i-know-what-i-am-doing` is passed.

Accounts are created through the Supabase Auth admin API (`POST /admin/users` with
`email_confirm: true` and the dev password); an existing user is skipped. The trigger fills
`accounts`, and the seed then sets `locale` and the names. Everything else is written directly as
`opos_migrator`.

- **Accounts:** `head@convention-a.test`, five organizer accounts, `speaker@example.com`,
  `attendee@example.com`. Dev password: `password123`. One organizer account has `locale=en`.
- **Tenant `convention-a`** — "Convention A", `defaultLocale=pl`, `timezone=Europe/Warsaw`.
  - Edition `2025` — `isPublished=true`, `isActive=false`, 8 programme items, all in the past.
    `speaker@example.com` speaks at two of them; one has a public review and a speakers-only
    anonymous review from `attendee@example.com`, plus one hidden review.
  - Edition `2026` — `isPublished=true`, `isActive=true`, 12 programme items, all in the future;
    `attendee@example.com` likes three of them.
  - Payment config: provider `fake`, currency `PLN`.
  - Tickets 2025: type "Weekend" (90 PLN, 300); a `paid` order of `attendee@example.com` with two
    tickets, one of them redeemed.
  - Tickets 2026: types "Weekend" (120 PLN, 500) and "Saturday" (70 PLN, no limit, sales ending
    the day before the edition); a `paid` order of `guest@example.com`, who has no account, one
    `expired` order and one `cancelled` order.
- **Tenant `convention-b`** — "Convention B", `defaultLocale=en`, `timezone=Europe/Prague`,
  a single `2026` edition with an English programme and one "Day pass" ticket type (provider
  `fake`, currency `PLN`).
- **Convention A team:**

| Account | Role | Tenant level | Edition level |
|---|---|---|---|
| `head@convention-a.test` | `head` | bypass | bypass |
| `program@convention-a.test` | `org` | everything `none` | 2026: `program=write`; 2025: no membership |
| `settings@convention-a.test` | `org` | `settings=write` | none |
| `viewer@convention-a.test` | `org` | `settings=read` | 2026: `program=read` |
| `expired@convention-a.test` | `org`, `expiresAt` in the past | `settings=write` | 2026: `program=write` |
| `gate@convention-a.test` | `org` | everything `none` | 2026: `tickets=write` |

- **Attendee:** `attendee@example.com` signed up for `convention-a/2025`, not for `2026`.

### Creating a tenant

There is no admin interface or endpoint in the MVP. A new convention is created on the server with
`packages/db/src/scripts/create-tenant.ts`:

```bash
pnpm db:tenant:create --slug convention-c --name "Convention C" --head-email head@example.com \
  [--locale pl] [--timezone Europe/Warsaw]
```

- Runs as `opos_migrator`, in a single transaction: inserts `tenants` and a `head`
  `tenant_memberships` row.
- The head's account must already exist — the person registers in the portal first. An unknown
  email or a taken slug aborts with a non-zero exit code and changes nothing.
- In production: `docker compose -f docker-compose.prod.yml run --rm api pnpm db:tenant:create ...`.

---

## 15. Tests

### 15.1 API integration tests

Supertest against Postgres and Supabase Auth in containers (`supabase/postgres` and
`supabase/gotrue`, the production tags), no database or auth mocks, in `apps/api/test`. Test
accounts are created through the admin API and signed in with `signInWithPassword`.

| Area | What we check |
|---|---|
| permission matrix | for every (endpoint, permission) pair: `none` -> `403`, `read` -> reads yes / writes `403`, `write` -> both; `head` passes everywhere |
| tenant isolation | the same set of requests with someone else's `X-Tenant-Slug` and someone else's identifiers -> `403` / `404` |
| RLS | a query on `opos_app` without `app.tenant_id` -> error; with tenant B's context -> zero rows of tenant A; an `insert` with a foreign `tenant_id` -> `WITH CHECK` violation; `anon` and `authenticated` cannot read any `public` table |
| anti-escalation | an org cannot grant permissions above their own, edit themselves or touch a `head` |
| invariants | a second active edition, removing the last `head`, an `edition_membership` with a foreign edition, `expiresAt` on a `head`, a speaker, like or review pointing at another tenant's item |
| membership expiry | an expired org gets `403` on every tenant endpoint and is missing from `GET /me/memberships`; extending `expiresAt` restores access; an org cannot set an expiry later than their own |
| reviews | before `startsAt` -> `409`; an account that holds no valid ticket for the edition and is not a team member with access to it -> `403`; a second review replaces the first; an anonymous review returns no author name from any endpoint, panel included; a speakers-only comment is missing from the public endpoint and present in `GET /me/program-items` for the speaker; a hidden review disappears from the public counters |
| likes | idempotent `PUT`; `likeCount` changes; no endpoint returns who liked an item; `GET /me/schedule` spans tenants |
| checkout | 20 concurrent orders against `quantity=5` -> exactly 5 hold tickets, the rest `409`; an expired hold releases its tickets; outside the sales window -> `409`; no payment config -> `409`; more than 10 tickets -> `400` |
| payment webhook | unsigned or wrongly signed -> `401`; `paid` issues the tickets and sends one email with QR codes to Mailpit; a repeated webhook sends nothing; an amount mismatch leaves the order `pending`; a payment after the hold expired still marks it `paid` |
| orders | the order link with a wrong token -> `404`; `GET /me/tickets` returns tickets bought with the account's email in any tenant, before the account existed included; a cancelled order's tickets are invalid at the scanner; credentials never appear in any response |
| scanner | a pairing token used twice -> `409`; a revoked or expired device -> `401`; another edition's ticket -> `404`; the second redemption of a ticket -> `already-redeemed` with the first time; a device of tenant A sees nothing of tenant B |
| JWT | an expired token, a token signed with another secret, `aud != authenticated` and a foreign `iss` -> `401`; a valid token without an `accounts` row -> `401` |
| account lifecycle | a new `auth.users` row creates `accounts` with the metadata; an email change updates it; `DELETE /me` without a recent sign-in -> `401`, with one -> the user, `accounts`, memberships and `attendees` are gone |
| send-email hook | an unsigned or wrongly signed request -> `401`; `signup`, `recovery` and `email_change` land in Mailpit in the recipient's locale with a working `/verify` link; another `email_action_type` -> `400` |
| rate limit | `GET /invitations/preview` above the limit -> `429` with `Retry-After` |
| i18n | `lingui extract --check` reports no drift between code and catalogs; every error `code` from the contract has a descriptor in `errors.ts`; programme time formatting returns the tenant's zone, not the server's |

### 15.2 E2E tests

Playwright in `e2e/`, through the UI of both web applications, against the full stack on a fresh
database.

**Environment:** `docker compose up -d` (Supabase `db` + `auth`, Mailpit),
`pnpm db:migrate && pnpm db:seed`, applications started through `webServer` in the Playwright
configuration. Chromium in two projects: desktop, and a mobile viewport (Pixel 7) for the portal;
a browser matrix is beyond the MVP. The `e2e` directory is a workspace package — Playwright and
the fixtures are its dependencies, not the root's.

Emails — address confirmation, password reset, invitations, tickets — are read through Mailpit's
HTTP API
(`:8025/api/v1`). Google sign-in is not covered by e2e: Supabase Auth talks to the real Google,
and the smoke test checks that flow ([16](#16-smoke-test)).

**Scenarios:**

| # | Scenario |
|---|---|
| 1 | Registration with a password: sign-in before confirming -> `email_not_confirmed`; the link from Mailpit confirms; sign-out, sign-in again; the language switch survives the session |
| 2 | Resending the confirmation link from the sign-in screen delivers a new message |
| 3 | The session survives a page reload; after sign-out the stored session is gone and the API answers `401` |
| 4 | A head creates an edition, activates it, publishes it and adds programme items |
| 5 | The programme shows up on the portal pages of both tenants, signed out, each in its own time zone |
| 6 | Organizer invitation: email from Mailpit -> acceptance -> the invitee sees only their edition |
| 7 | An org with `read`: no sidebar section, entering by URL -> the "no permissions" screen |
| 8 | Isolation: attempting to enter another tenant's convention through the UI and by a direct API request |
| 9 | An attendee signs up for an edition from the convention's page, sees it under "my conventions", deletes the account |
| 10 | Password reset: request from the sign-in screen, the link from Mailpit sets a new password, the old session stops working |
| 11 | An attendee likes items, finds them in the personal schedule, reviews a past item anonymously with a speakers-only comment; the speaker sees it under "my programme items"; an org hides another review in the panel and the public rating changes |
| 12 | An org whose membership has expired signs in to the panel and sees no convention |
| 13 | A visitor without an account buys two tickets through the fake provider; the email in Mailpit has two QR codes; registering with the same address shows both under "my tickets" |
| 14 | An org pairs the scanner from the panel, enters a ticket code by hand, sees the whole order, redeems one ticket; the next lookup shows it as used |
| 15 | An org cancels a paid order in the panel; the scanner shows its tickets as invalid |

Scenarios 1, 9, 10, 11, 13 and 14 run in both the desktop and the mobile project.

Tests share no data: every scenario that creates a tenant works on its own slug, and scenarios
using seeded data only read it.

### 15.3 CI

GitHub Actions on every PR and every push to `main` (`.github/workflows/ci.yml`). Tool versions
come from `mise.toml` through `jdx/mise-action`, the same source as local machines; then
`pnpm install --frozen-lockfile` and `pnpm format:check`. `turbo run typecheck lint test --affected` covers the packages changed
against `main` and their dependents; the turbo cache is persisted between runs with
`actions/cache`, so an unchanged task inside an affected package is still a cache hit.
`pnpm i18n:extract -- --check`, `pnpm db:verify` and `pnpm test:e2e` run in full on every PR.

The e2e job receives `/etc/hosts` entries for `api.localhost`, `panel.localhost` and
`opos.localhost`. Artifacts from failed runs
(traces, video, screenshots) are kept for 7 days.

---

## 16. Smoke test

Run by hand after every deployment, on the production environment. The same flows run automatically
in e2e ([15.2](#152-e2e-tests)) — the smoke test exists to check them where e2e cannot reach: with
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
6. **The programme reaches the portal.** An item added in the panel shows up on
   `opos.land/conventions/convention-a`, signed out, with its time in the tenant's zone.
7. **Organizer invitation.** A head invites an email with `program=write` for 2026 -> the message
   arrives -> acceptance -> the invitee sees the 2026 programme and nothing else.
8. **Permissions in the UI and on the server.** `viewer@convention-a.test` has no team management
   in the sidebar, and a direct URL ends with the "no permissions" screen and a `403` from the API.
9. **Tenant isolation.** A Convention A org with `X-Tenant-Slug: convention-b` -> `403`;
   `GET /editions/:id` with a Convention B edition -> `404`. In `psql` on `opos_app` with
   Convention B's `app.tenant_id`: `select count(*) from program_items` returns only Convention B items,
   and an `insert` with a foreign `tenant_id` hits `WITH CHECK`.
10. **The portal respects publication and tenant time zone.** An unpublished edition -> `404`,
   the convention page lists 2025 among past editions, an unknown slug -> the "we couldn't find
   that convention" page. `opos.land/conventions/convention-b` shows programme times in
   `Europe/Prague` regardless of the browser's zone.
11. **The portal on a phone.** On a real phone browser (iOS Safari and Android Chrome): registration,
   the "Sign up" button on a convention's page, edition sign-up, liking, the personal schedule, a
   review, ticket checkout and "my conventions" work without horizontal scrolling.
12. **Supabase stays internal.** `auth.opos.land` answers only GoTrue's paths, nothing listens on
   `:5432` from outside, and `https://api.opos.land/hooks/send-email` without a signature -> `401`.
13. **A real payment.** On a test edition, a BLIK payment of the cheapest ticket through the
   convention's real provider account: the money shows up in that account, not in any OPOS
   account, the ticket email arrives, the order turns `paid`. Refund in the provider's dashboard,
   cancel in the panel. `https://api.opos.land/hooks/payments/<provider>` without a signature ->
   `401`.
14. **The scanner on a real phone.** Pairing by camera from the panel, scanning a ticket QR code
   from another phone's screen, redemption, a second scan showing "already used", revocation
   sending the phone back to pairing.

---

## 17. Execution rules

1. **Pinned versions** — Node `24.15.0` (`mise.toml`) and pnpm `11.17.0` (`packageManager`),
   enforced by `engineStrict`.
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
