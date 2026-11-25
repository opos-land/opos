# OPOS — architecture

The rules of the code that no single file shows. How a part works is in its code and tests; product
intent and business rules are in [PRODUCT.md](PRODUCT.md); why a rule is so, and what is decided but
not built, in the [decision records](adr/README.md) and the [specs](specs/README.md); how to work
here in [AGENTS.md](../AGENTS.md).

## Applications and packages

```mermaid
graph LR
    portal["apps/portal"] -->|cookie| api["apps/api"]
    server["the portal's server"] -->|public routes| api
    panel["apps/panel"] -->|cookie| api
    admin["apps/admin"] -->|cookie| api
    api -->|secret key| auth["Supabase Auth"]
    api --> pg[("Postgres")]
    auth --> pg
    api -->|bucket key| s3[("S3 bucket")]
    api -->|signed| imgproxy["imgproxy"]
    imgproxy -->|signed address| s3
```

| Part                | Role                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`          | NestJS, Drizzle ([0005](adr/0005-build-the-api-with-nestjs-and-drizzle.md)), oRPC ([0006](adr/0006-define-the-api-in-an-orpc-contract.md)): the only backend, and the only holder of a Supabase address or key                                                                                                                                      |
| `apps/panel`        | the organizers' SPA, desktop-first; later also the scanner under `/scanner`                                                                                                                                                                                                                                                                         |
| `apps/portal`       | the attendees' SPA, mobile-first: home page with the list of editions, account, convention and edition pages, likes, schedule; a server beside it answers the document of each page with that page's head ([0091](adr/0091-fill-the-head-of-the-portals-pages-on-a-server-beside-it.md))                                                            |
| `apps/admin`        | the admins' SPA: the conventions with their suspension and deletion, the reset of an account's two-factor authentication, the log ([0029](adr/0029-ship-four-web-applications.md))                                                                                                                                                                  |
| `packages/contract` | the oRPC contract with zod schemas, the single source of the API's shape                                                                                                                                                                                                                                                                            |
| `packages/db`       | schema, migrations, database roles, seed, verification, the scripts that grant the admin role and take it away                                                                                                                                                                                                                                      |
| `packages/i18n`     | locales, detection, formatters and the shared catalog                                                                                                                                                                                                                                                                                               |
| Supabase            | a hosted project per environment, in the EU: Postgres and Supabase Auth only, the Data API off ([0003](adr/0003-use-hosted-supabase-for-postgres-and-auth-only.md))                                                                                                                                                                                 |
| S3 bucket           | the uploaded files, one private bucket per environment, in the EU and encrypted at rest; the API holds its key, which opens it alone ([0041](adr/0041-keep-uploaded-files-in-an-s3-bucket-behind-the-api.md)), and so does the seed, on `local` and `dev`, for its demo files ([0045](adr/0045-let-the-seed-put-its-demo-files-into-the-bucket.md)) |
| imgproxy            | makes an image's master and its variants, reached by the API alone with signed requests, reading one object at an address the API signed for a minute ([0042](adr/0042-keep-a-cleaned-master-of-an-image-and-make-its-variants-in-imgproxy.md))                                                                                                     |

- The packages have no build step; only the translation catalogs compile.
- **The BFF boundary**
  ([0004](adr/0004-make-the-api-the-only-backend-with-the-session-in-cookies.md)). The panel, the
  portal and the admin application talk to the API alone: no `@supabase/*` package, Supabase
  address or key, or `VITE_*` variable naming Supabase in their sources or bundles. The `react`
  ESLint preset refuses the import, [bff-boundary.mjs](../scripts/bff-boundary.mjs) the rest (a
  hook, `pre-commit`, and CI over the built bundles), and every e2e scenario a request that leaves
  the API and the page's own origin.
- **Files** are uploaded and read through the API alone: no browser reaches the bucket or
  imgproxy. The storage in `apps/api/src/modules/files` knows a file's owner, an account, a
  convention or an edition, and nothing of what it is for; a feature declares its kinds of file,
  with the variants of a kind of images, and its own routes take and serve them under its own
  requirement. A file never changes, keeps only the inert types PDF, JPEG, PNG and WebP, each
  checked against its content, and an image is kept as a cleaned master, decoded only by imgproxy.
- **The admin** works in the admin application, through the admin routes of the API
  ([0029](adr/0029-ship-four-web-applications.md)). Only granting the admin role and taking it
  away are scripts, run on the server as `postgres` (`pnpm db:admin:grant`,
  `pnpm db:admin:revoke`): no route and no screen does either.

Dev's deployment is described in [infra](../infra/README.md) but not running yet
([0033](adr/0033-host-dev-on-the-teams-coolify-server-and-leave-productions-hosting-open.md)); a
deployed environment reaches its database directly, with TLS verified against Supabase's CA
([0039](adr/0039-verify-postgres-tls-against-the-supabase-ca-trusted-by-node.md)). The backups are
decided but not built ([0014](adr/0014-back-up-production-beyond-supabase.md)); the modules
[waiting for their domain owner](#modules-waiting-for-their-domain-owner) have only their rules.

## Tenant isolation

Row-level multitenancy under RLS, not only a `where` in code
([0002](adr/0002-isolate-tenants-by-row-under-postgres-rls.md)). A tenant table carries its own
`tenant_id` (never only an `edition_id`), a composite foreign key to its parent's `(id, tenant_id)`
and an index starting with `tenant_id`.

| Role                                    | May                                                                                                                               | Used by                                                                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres`                              | owns the OPOS tables; `BYPASSRLS`, not a superuser                                                                                | migrations, `db:*` scripts, the seed, the backup; never the running API                                                               |
| `opos_app`                              | `select`; `insert`, `delete` and per-column `update` only where the API writes; bypasses nothing, owns nothing, member of no role | the API                                                                                                                               |
| `opos_app_global`                       | `BYPASSRLS`; `select` on the columns the cross-tenant queries read, nothing else                                                  | `GlobalDbService` alone                                                                                                               |
| `opos_admin`                            | `BYPASSRLS`; only what the admin routes read and write, its reads by column                                                       | `AdminDbService` and `AdminProfilesDb` alone ([0030](adr/0030-guard-admin-access-with-its-own-role-application-and-second-factor.md)) |
| `anon`, `authenticated`, `service_role` | nothing in `public`                                                                                                               | nobody                                                                                                                                |

`pnpm db:roles` ([roles.ts](../packages/db/src/roles.ts)) sets the runtime roles up with their
timeouts and strips Supabase's default grants; it runs on every new database, after a change to it
and after every restore.

- **Policy.** A covered table has RLS enabled and forced, and one permissive policy
  `tenant_isolation` with `USING` and `WITH CHECK` both
  `tenant_id = (select current_setting('app.tenant_id')::uuid)` (`id` on `tenants`), without
  `missing_ok`, so a missing context raises. No other permissive policy may exist.
- **Context.** A tenant request is one transaction on `opos_app`:
  [setTenantContext](../packages/db/src/rls.ts) sets `set_config('app.tenant_id', $1, true)` and
  refuses any other role, and repositories take it from `TenantContextService.tx()`, which throws
  outside one. Without the tenant header, `withTenant` opens it from a cross-tenant lookup or a
  verified token. The queries that decide access filter on the tenant themselves too. No tenant
  transaction goes on for a suspended tenant: the check sits where the transaction opens, so it
  holds for every way in (`403` `tenant.suspended`;
  [0031](adr/0031-suspend-a-tenant-before-deleting-it.md)).
- **Global tables.** `accounts`, `account_recovery_codes`, `account_files`, `account_profiles`,
  `account_avatars` and `profile_reports` have no RLS: column privileges limit them, and the API
  reaches there only the account a verified token, a fresh session or a signed hook names; the
  sweep alone removes an account's file nothing points at.
  Another account is read only in a tenant transaction, through a tenant table, by a confirmed
  email behind a write permission and a rate limit of the tenant, or by the confirmed email of
  an order as it is paid and of the recipient of an order's email as it is written, which
  answer nothing to anyone: the recipient's account is read for its language and for whether
  the order is on it, and these shape the email to that address alone; by its own publication,
  as the profile it published and the avatar it uploaded, which answer its public name and never
  its identifier or its email address
  ([0071](adr/0071-let-anyone-read-the-profile-an-account-published.md)); or behind
  `@RequireAdmin`, as a tenant's head, as an account an entry of the log names, as an account
  whose profile was reported or taken down, or by its email address for a new tenant's first
  head, for a reset of two-factor authentication and for its profile.
  `opos_app` never sets the identifier of a profile's page or what a takedown sets, and reads
  nothing a report says; an avatar is a row added and removed, never changed. A change of a
  profile, of its avatar or of its reports holds the profile's row first, as a takedown does, so
  that neither overtakes the other.
  The admin's tables are global too, and `opos_app` and `opos_app_global` hold nothing on them:
  `admins` is written by `postgres` alone, each grant bound to the one verified factor its account
  holds; `admin_actions` only grows, each entry dated by the database, a grant and a withdrawal
  of the role recorded by a script alone; and `retired_tenant_slugs` is out of every runtime
  role's reach, written and read by triggers of `tenants`.

**Cross-tenant queries** run only in
[GlobalDbService](../apps/api/src/common/database/global-db.service.ts):

| Query                                  | Bound                                                                                                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a tenant by slug                       | its public columns, and whether it is suspended: a public route answers a suspended one as an unknown address                                                   |
| `GET /me/memberships`                  | the session's account; expired memberships left out, and the editions of a suspended tenant                                                                     |
| `GET /me/schedule`                     | the session's own likes; published editions only, of tenants not suspended                                                                                      |
| `GET /public/editions`                 | publication: the published editions of tenants not suspended, with the columns anyone reads of each one convention at a time                                    |
| `DELETE /me`                           | the session's account; answers only whether it is a tenant's last head                                                                                          |
| the sweep of files                     | the API's own job; the identifiers, owners and kinds of files, and whether a feature's row points at one                                                        |
| a payment attempt by its identifier    | the address of a provider's notification; it answers the tenant and the provider alone, and nothing counts before the provider's signature holds                |
| the orders whose hold ended            | the API's own job; identifiers alone, of tenants not suspended                                                                                                  |
| the emails of orders that are due      | the API's own job; identifiers alone, of tenants not suspended                                                                                                  |
| a scanner by a hash                    | the pairing code or the token the caller sent, by its hash; it answers the scanner and its tenant alone, and the device is judged in that tenant's transaction  |
| an order link by a hash                | the token the caller sent, by its hash; it answers the link's tenant alone, and the link and its order are read in that tenant's transaction                    |
| the editions whose reminder may be due | the API's own job; identifiers, the tenant's time zone and the start a page continues from alone, of published editions of tenants not suspended                |
| a published profile by its identifier  | the account's own publication: the public name and what the profile's page shows, of a profile published and not taken down, and nothing that names the account |
| whose avatar a file is                 | the avatar is public from its upload; it answers the account to the API alone, which then serves the file                                                       |

A new one is bound by the session's account or its confirmed email address, a secret the caller
proved (a signature, a link or device token), the API's own job, or publication: an edition's,
for what anyone already reads one convention at a time
([0043](adr/0043-list-every-published-edition-on-the-portals-home-page.md)), or an account's own,
of its profile and its avatar
([0071](adr/0071-let-anyone-read-the-profile-an-account-published.md)); it joins this table
and puts its columns into `globalReads` of [verify.ts](../packages/db/src/verify.ts). What a query
bound by publication answers is the schema of its route: a field added there is public at once,
for every convention, or for every account that published its profile.

**The admin routes** read and write across tenants on `opos_admin`, only in
[AdminDbService](../apps/api/src/modules/admin/admin-db.service.ts) and in
[AdminProfilesDb](../apps/api/src/modules/admin/admin-profiles.db.ts), which takes its connection
from it, and only behind `@RequireAdmin`: their bound is the admin role of the session's account.
They never open a tenant transaction, read nothing of a tenant's team but its heads and nothing
of its editions or programme, and write each change with its entry of the log in one transaction.
Of a profile they read what it shows, its state and its reports, and write a takedown, a
restoring, a closed report and a cleared name, never what a profile says
([0074](adr/0074-take-a-profile-down-with-a-reason-and-change-nothing-it-says.md)). What the role
may reach is in `adminReads`, `adminWrites`, `adminInserts` and `adminUpdates` of verify.ts.

**Migrations.** RLS, grants and triggers are hand-written in the PR of their table; a merged
migration never changes. `opos_app` never updates `id`, `tenant_id` or a column pointing at an
account or another row, but for two pointers of an order's line that its constraints keep
within its edition and its tenant: the variant a merchandise line names
([0058](adr/0058-let-the-api-change-the-variant-an-order-line-names.md)) and the scanner that
marked a line handed out
([0065](adr/0065-let-the-api-name-the-scanner-that-marked-a-hand-out.md)). `tenants` rows are inserted, deleted, suspended and given a new slug only by
`opos_admin`, behind the admin routes, and by the seed; `opos_app` updates `name`, `default_locale`
and `timezone` alone. Nothing is written into `auth`; OPOS's triggers on `auth.users` and
`auth.mfa_factors` are listed in verify.ts. A `security definer` function pins `search_path = ''`
and no runtime role may execute it; constraints have explicit names, since errors map to codes by
them. `pnpm db:verify` checks the policies, grants, roles, functions and triggers, each check with a
case in [verify.test.ts](../packages/db/test/verify.test.ts);
[check-migrations.mjs](../scripts/check-migrations.mjs) refuses a change to a merged migration.

## Invariants

| #   | Invariant                                                                                                                   | Enforced by                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | At most one active edition per tenant                                                                                       | a partial unique index; activation locks the tenant row                                                                                                                                                                                       |
| 2   | At least one `head` per tenant, also against deleting the last head's account                                               | constraint triggers deferred to commit, locking the tenant row                                                                                                                                                                                |
| 3   | An edition membership stays in the tenant of its membership and edition                                                     | composite foreign keys                                                                                                                                                                                                                        |
| 4   | A tenant write carries the tenant of the context                                                                            | `TenantContextService.tx()`; `WITH CHECK`                                                                                                                                                                                                     |
| 5   | Every `auth.users` row has exactly one `accounts` row                                                                       | an insert trigger, a cascading foreign key                                                                                                                                                                                                    |
| 6   | A `head` never expires and holds no tenant-level permission                                                                 | check constraints                                                                                                                                                                                                                             |
| 7   | An attendee registration stays in its edition's tenant and goes with its account                                            | a composite foreign key, a cascade                                                                                                                                                                                                            |
| 8   | Speakers, likes and reviews stay in the tenant of their programme item                                                      | composite foreign keys                                                                                                                                                                                                                        |
| 9   | A limit on what is sold holds under concurrent sales and changes of the limit                                               | a sale, and a change of a capacity, a stock or a discount code's limit, lock the rows carrying the limit in one fixed order before counting, a discount code's last ([0053](adr/0053-lock-the-rows-that-carry-a-limit-in-one-fixed-order.md)) |
| 10  | Two scans of one ticket never act on the same state                                                                         | a hand-out is one update that matches only a line not yet handed out, by a scanner and in the panel alike                                                                                                                                     |
| 11  | A scanner works only inside its tenant and edition                                                                          | the transaction of the tenant its token named; every query filters on that tenant, and a scan reads the orders of the scanner's edition alone                                                                                                 |
| 12  | `accounts.mfaEnabledAt` is set exactly while a verified factor exists                                                       | the trigger on `auth.mfa_factors`, locking the account row                                                                                                                                                                                    |
| 13  | A tenant is deleted only while suspended                                                                                    | the statement that deletes it judges the suspension itself                                                                                                                                                                                    |
| 14  | The slug of a deleted tenant is never a tenant's again; the seed alone frees the slugs of its demo tenants                  | triggers of `tenants`: one retires the slug with the tenant, one refuses it after the unique index, and any slug above READ COMMITTED, where it could not see one retired since                                                               |
| 15  | An order holds at most one ticket                                                                                           | a partial unique index ([0083](adr/0083-hold-at-most-one-ticket-in-an-order.md))                                                                                                                                                              |
| 16  | What an order names is never deleted from under it: its edition, what it sold, what its ticket holder answered and accepted | foreign keys that do not cascade ([0048](adr/0048-keep-what-an-order-names-with-foreign-keys-that-do-not-cascade.md))                                                                                                                         |

Invariant 7 belongs to a [module not built yet](#modules-waiting-for-their-domain-owner);
[invariants.test.ts](../packages/db/test/invariants.test.ts),
[tenants.test.ts](../packages/db/test/tenants.test.ts) and
[accounts.test.ts](../packages/db/test/accounts.test.ts) cover the database-side ones.

## Permissions

The model is in [PRODUCT.md](PRODUCT.md#5-roles-and-permissions), the decision in
[permissions.ts](../apps/api/src/common/permissions/permissions.ts).

- `none < read < write`. A `head` passes every check; an expired membership counts as none, its
  expiry measured when the read runs (`statement_timestamp()`), not when the transaction began.
- Tenant-level permissions (`settings`, `branding`, `shop`) never grant edition-level ones
  (`program`, `websiteContent`, `tickets`).
- A non-member gets `403` before any edition is looked up. For a member, a row of another tenant or
  of another parent than the path names, and an identifier that is not a uuid, are `404`; so is a
  row of another parent that a body names.
- A tenant route takes exactly one of `@RequireTenant`, `@RequireEdition` or, as the exception,
  `@InTenant`: no membership, so the handler's filters are its only guard, and no write lock, so it
  lowers nobody's access. Each applies `JwtAuthGuard`.
- An admin route takes `@RequireAdmin` and nothing else: `JwtAuthGuard`, then the admin
  application's `Origin` (`403` `request.origin-denied`), the role (`403` `permission.denied`),
  two-factor authentication on (`403` `admin.mfa-not-enabled`) with the factor of the grant (`403`
  `admin.grant-outdated`), and a recent sign-in. No route grants the role or takes it away
  ([0030](adr/0030-guard-admin-access-with-its-own-role-application-and-second-factor.md)).
- A route at `write` checks, waits in its tenant's queue in the API process, takes the tenant's
  advisory lock and checks again (`503` `request.busy` past the limit;
  [0008](adr/0008-serialize-the-writes-of-a-tenant.md)). Every route that lowers a member's access
  is a write route, except `DELETE /me`, which lowers only the account's own; reads neither queue
  nor lock.
- Anti-escalation is set in PRODUCT.md and enforced by the API on locked memberships. An invitation
  stands only while its sender could still send it.

## Sessions and sign-in

- The API keeps the session Supabase Auth issues in `HttpOnly`, `SameSite=Strict` cookies on its own
  host, `Secure` beyond local `http`, a pair per application chosen by the request's `Origin`. No
  response carries a token
  ([0004](adr/0004-make-the-api-the-only-backend-with-the-session-in-cookies.md)).
- Only the API calls Supabase Auth, with the secret key and the visitor's address in
  `Sb-Forwarded-For`; a refusal reaches the browser as a code `auth.<error_code>`, never as its
  text. Its emails go through a signed hook to the API, which renders them.
- `JwtAuthGuard` accepts ES256 alone, against the project's JWKS, with `aud = authenticated`,
  `iss = <SUPABASE_URL>/auth/v1`, `exp`, a uuid `sub`, no `is_anonymous` and an `accounts` row. The
  session travels only in the cookies: a token in `Authorization` is no session. Keys out of reach
  answer `503`, never `401`: an outage signs nobody out.
- A request that changes state with a session cookie needs the `Origin` of an application (`403`
  `request.origin-denied`) and a JSON body (`415`): with `SameSite=Strict`, the CSRF protection.
  CORS names the applications, never `*`.
- **The admin application** has an origin and a cookie pair of its own, its refresh cookie kept for
  30 minutes. Its origin reaches only the admin routes, sign-in, refresh, sign-out, the code of
  two-factor authentication and the account's own name, language and theme; anything else answers
  `403` `request.origin-denied`, so a flaw in it cannot change an admin's credentials
  ([0030](adr/0030-guard-admin-access-with-its-own-role-application-and-second-factor.md)). An API
  process without the admin application's address and the connection of `opos_admin` serves none.
- **The password comes after the confirmation**: a sign-up takes none, and the button of a link
  that confirms the address, never its opening, replaces any password set before. **An email address
  leads to an account only once confirmed**, in every lookup by email; sign-up, resending and
  password reset answer alike for any address.
- `DELETE /me`, `PUT /auth/password`, `POST /auth/mfa/enroll` and `DELETE /auth/mfa` need a
  sign-in younger than 5 minutes (`session.reauthentication-required`); a recovery code needs none,
  it is the proof. A new password and a factor the account removes itself end the account's other
  sessions; a reset of two-factor authentication by an admin ends none, since Supabase Auth's
  admin API ends a session only with that session's own token. Every admin route needs a sign-in
  younger than 30 minutes, and deleting a tenant and resetting an account's two-factor
  authentication one younger than 5.
- **Two-factor authentication.** With a verified factor, a session below `aal2` reaches only the
  code routes, refresh and sign-out; every other route answers `401` `session.mfa-required` before
  any permission check, by invariant 12, so an older token loses access at once.
- A redirect, Google sign-in's included, leads only to a path of the application that started it.
- The cookies are safe only while no subdomain serves content a tenant controls: the feature that
  first does moves them to `__Host-` names. The API serves the files a tenant or an account
  uploaded from its own origin, but only inert types, under their stored type with `nosniff`, a
  content security policy that allows nothing and sandboxes them, a resource policy of the same
  site, and a PDF as a download. Dev's hosts sit under `opos.land` too, so they move
  before production is deployed
  ([0034](adr/0034-address-dev-under-dev-opos-land-in-a-dns-zone-of-its-own.md)).

## API conventions

- The contract is the single source of the API: a route starts from `publicRoute`, `accountRoute`,
  `tenantRoute`, `adminRoute` or `scannerRoute` of [common.ts](../packages/contract/src/common.ts)
  ([0006](adr/0006-define-the-api-in-an-orpc-contract.md)). A scanner's route is called by a
  device with no session and no membership, named by its token in `Authorization: Bearer`, the
  one bearer credential the API takes
  ([0059](adr/0059-pair-a-scanner-with-a-code-and-know-it-by-a-token.md)). An admin route lives under `/admin/`,
  and nothing else does.
- An error is `{ code, params?, message }`, its code in
  [errors.ts](../packages/contract/src/errors.ts). The UI shows the code through the catalog, never
  the English `message`.
- A tenant request is one transaction: an exception or a status of `300` or more rolls it back, and
  the response waits for the commit
  ([0007](adr/0007-run-each-tenant-request-in-one-transaction.md)).
- Outbound I/O never runs inside a transaction. Started by a tenant request, it waits for the
  commit (`afterCommit`), and its failure is logged while the response stands; a send the business
  cannot lose keeps an outbox. A call to Supabase Auth outside a transaction answers with its own
  failure.
- **A route that takes a file** (`takesFile` in the contract, `@TakesFile` in the API) is a write:
  its requirement is judged, then the file in its JSON body, up to 21 MB, is received outside every
  transaction, then its one transaction keeps it; every other route keeps the default body limit.
  **A route that serves a file** (`servesFile`, `@ServesFile`) is judged in a short transaction and
  reads the bucket outside every transaction. A public route serves only a file that is for
  everyone, after its own check in a short transaction of the tenant its address names, or, for an
  avatar, after the cross-tenant lookup of whose avatar the file is, and never takes one. A route
  of the account takes a file the same way, with the session in place of the requirement and the
  account's own transaction. The routes that take a file share one rate limit per
  account. The bucket or imgproxy out of reach stops nothing else of the API.
- **A route that asks outside before it writes** (`@Prepares`), as connecting a payment provider
  account does, is a write: its requirement is judged, then the call out runs outside every
  transaction, then its one transaction judges the actor again and acts on the answer. An answer
  for an actor refused meanwhile is stored nowhere. A route that asks no membership may prepare
  too, as placing an account's order does for its bot check, and one that asks outside between
  its writes (`@CallsOut`), as the start of a payment attempt does, runs its handler outside
  every transaction and opens its tenant's own.
- **The API's own jobs** run in each process, each safe with several: the sweep of files daily
  behind an advisory lock, so one process sweeps at a time, removing, once older than 24 hours,
  a file's row nothing points at and an object no row explains; the expiry of orders every
  minute and the outbox of their emails every quarter of a minute, each claiming a row under a
  lock another process skips; the reminders before an edition every five minutes, each queued
  under a lock of its edition's shop row, so a second process finds it gone out; the removal of
  the profile reports closed twelve months before, daily, which two processes do once. A job finds its
  rows across tenants by identifiers alone, passes a suspended tenant's by, and acts on each in
  its own tenant's transaction.
- Every route has a default rate limit per account, or per address without a session; a route open
  to abuse adds its own in code
  ([route-rate-limit.ts](../apps/api/src/common/rate-limit/route-rate-limit.ts)).
- A log line written on purpose names no token, password or email address; an unexpected error is
  logged whole, never sent in the body.

| Status | Meaning                                                                                                            | Default code                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `400`  | validation; `params.field` names the field                                                                         | `request.invalid`                                            |
| `401`  | no valid session; a stale sign-in, `aal1` and Supabase Auth's refusals have their own                              | `session.invalid`                                            |
| `403`  | insufficient permission; anti-escalation, `Origin` and a suspended tenant have their own                           | `permission.denied`                                          |
| `404`  | absent or of another tenant                                                                                        | `request.not-found`                                          |
| `409`  | an invariant or unique constraint, by constraint name; an owner's files over its limit                             | always specific                                              |
| `410`  | an invitation expired or revoked                                                                                   | `invitation.expired`, `invitation.revoked`                   |
| `413`  | a file over its kind's limit, or an image over 50 megapixels                                                       | `file.too-large`                                             |
| `415`  | a body that is not JSON                                                                                            | `request.invalid`                                            |
| `422`  | a file whose content is not what its type says, or not of its kind's types; credentials a payment provider refuses | `file.type-refused`, `provider.credentials-refused`          |
| `429`  | rate limit, with `Retry-After`                                                                                     | `request.rate-limited`                                       |
| `500`  | unexpected; no details in the body                                                                                 | `server.error`                                               |
| `503`  | a write waiting too long; Supabase Auth, the bucket, imgproxy or a payment provider out of reach                   | `request.busy`, `server.unavailable`, `provider.unavailable` |

## Frontends

- **Feature based.** `src/app` (router, providers), `src/features/<feature>`, whose `index.ts` is all
  others may import, and `src/shared`, which imports no feature; the `react` ESLint preset
  ([react.js](../packages/eslint-config/react.js)) enforces it. Routes stay thin; network traffic
  goes only through a feature's `api/`.
- Every page calls `usePageTitle` before its first `return`, naming the page, then its edition or
  convention, as the tab title and the panel's breadcrumb show them; `src/app/pages.test.ts`
  enforces it.
- **The portal's document comes with the head of the page asked for**: the title the page gives
  itself, a description, the page's own address and what the preview of a shared link reads, in the
  convention's language on a convention's pages and in the default one elsewhere; an address
  nothing is at answers 404. A page that shows a stranger nothing asks search engines to leave it
  out there, and is named in the default language with no read of the API, under a convention's
  address too. `src/server` of the portal makes the head, in a process beside the portal
  that its web server asks for every address that is no built file. That process reads the API's
  public routes alone, with no session and no secret, so the head of an address is the same for
  every visitor, and it fails open: a page whose head cannot be made gets the plain one, and the
  web server answers the plain document when the process does not. A route added to the router is
  added to [routes.ts](../apps/portal/src/server/routes.ts), with the messages the page itself
  uses; `src/server/routes.router.test.ts` fails until it is. No module the browser runs imports
  `src/server`, which takes from the portal only modules that run without a browser;
  `src/server/boundary.test.ts` keeps both. The portal drops what the server wrote into the head
  once it shows another page
  ([0091](adr/0091-fill-the-head-of-the-portals-pages-on-a-server-beside-it.md)).
- Screens are built from shadcn/ui components on Base UI, which the CLI of each application adds to
  its `shared/ui` as it writes them, but for formatting, lint fixes and their own texts moved into
  Lingui macros; an application's own compositions of them sit beside them. They are styled only
  through the tokens of `src/styles.css`, which carry shadcn/ui's names and a published tweakcn
  theme until the designer's, departing from it where its text falls under 4.5:1; their fonts are
  packages served from the application's own origin
  ([0090](adr/0090-build-the-frontends-from-shadcn-ui-with-tweakcns-amber-minimal-theme-until-a-design-exists.md));
  `src/styles.test.ts` fails on a class Tailwind cannot build, a font family a token names that the
  stylesheet does not load with the Polish letters, and a text token under 4.5:1 against its surface
  in either theme. No AI-generated graphics
  ([PRODUCT.md](PRODUCT.md#8-design-and-public-image)).
- The portal is mobile-first: 360 px first, one column, no horizontal scrolling.
- A picture someone uploaded comes from the API's own address, in a variant its kind declares, and
  takes its width and height from the API, so that the page keeps its place before it loads. A
  deployed application's content security policy allows pictures from the API alone beside its own.
- The browser holds no session state: no token, no cookie read, the account from `GET /me`. A `401`
  brings one refresh shared by the tabs; only a refresh answered `401` signs out, `unavailable` never
  does, and `mfa-required` shows no account data. The one token a browser keeps is a scanner's, on
  the panel's `/scanner`: it is no session of an account, is sent with no cookie, and opens the
  scanner's routes alone.
- Nothing of one account outlives it: a sign-out or another account clears caches and permissions in
  every tab, each tenant has its own API client, and a page to return to belongs to the account that
  left it.
- The theme of a signed-in account is its own from `GET /me`, or the system's when it has none; the
  browser keeps only the one a visitor with no account signed in chose, and never an account's
  ([0025](adr/0025-keep-the-theme-on-the-account-and-a-visitors-in-the-browser.md)).
- The API stays the authority: the panel only hides and disables what a member cannot do, and the
  admin application shows an account the admin routes refuse one screen that says why.
- The admin application signs in by email, password and the code alone, and calls nothing the API
  refuses its origin. A call that finds the admin's sign-in too old, 30 minutes, or 5 for the two
  actions that cannot be undone, leads back to sign-in, and the screen opens again afterwards. The
  deletion of a convention is the one modal that asks for more than a press: the convention's
  address typed in ([0031](adr/0031-suspend-a-tenant-before-deleting-it.md)).
- A write tells its outcome in a notification: a success, a warning for a refusal the member can act
  on, an error for a failure of the service or the network, the last two kept until closed. The
  query client of each application notifies every mutation; beside a form stays only the
  validation of its fields. A plain `403` in the panel ends on the "no permissions" screen, and the
  sign-in flows show their outcome as their next screen
  ([0022](adr/0022-tell-the-outcome-of-every-write-in-a-notification.md)).
- The panel shows a suspended convention as suspended where it lists the member's conventions, and
  inside it only the message that it is suspended, asking the API nothing; a `403`
  `tenant.suspended` under an open page has the memberships read again, so the page gives way to
  that message.
- An action no screen can undo, such as a deletion, a removal from the team or turning two-factor
  authentication off, asks first in a modal that names what goes, says what goes with it and that
  it cannot be undone; only the modal's own button acts. A change the same screen reverses asks
  nothing ([0023](adr/0023-ask-in-a-modal-before-an-action-that-cannot-be-undone.md)).
- An entity, anything a list holds with an identity of its own, is added and changed on pages of
  its own: a new one at `new` under the address of its list, an existing one at its id there. The
  list holds the links to those pages and never a form; a page links back, and after adding or
  deleting leads to the entity's own page or to the list. What the list reverses by itself stays in
  the row: moving it, hiding it, ending a discount code. A part saved with its entity, such as a
  price tier, a variant or a speaker, stays in that entity's form; `src/app/pages.test.ts` of the
  panel refuses a mutation that creates an entity outside a page routed at `new` and an entity's
  form outside such a page and the entity's own, and that of the admin application the first
  ([0066](adr/0066-add-and-change-an-entity-on-a-page-of-its-own.md)).
- A list of entities is a table, a row an entity, and a row whose entity has a page of its own
  opens that page from anywhere in it: the row is the `LinkRow` of `shared/ui` and the entity's
  name in it a `RowLink`, which stays the way a keyboard and a screen reader reach the page. A
  control inside the row keeps its own press; `src/app/tables.test.ts` of the panel and of the
  admin application refuses a plain link in a table cell
  ([0067](adr/0067-list-entities-in-a-table-whose-row-opens-the-entitys-page.md)).
- A tracker, anything the portal does not strictly need (analytics, a pixel, an embed, a script,
  stylesheet or font from another origin, its cookies), is an entry of the consent feature's
  `TRACKERS`, started by that feature alone after the visitor allowed its category. Only it creates
  a script or an iframe; no `index.html` or stylesheet loads anything from another origin, and the
  panel and the admin application hold no tracker; `src/app/third-party.test.ts` of each
  application enforces it
  ([0026](adr/0026-run-a-tracker-only-with-consent-and-none-in-the-panel.md)).

## Localization

- Lingui, English source messages as their own identifiers; `en` and `pl`, `pl` the default, English
  the fallback; a new locale needs no migration
  ([0011](adr/0011-localize-with-lingui-and-return-codes-from-the-api.md)).
- The interface language is the signed-in account's, else the one the visitor chose in the
  browser, else `pl`; no frontend reads the browser's languages. Each frontend sends the language
  on screen to the API as `Accept-Language`
  ([0092](adr/0092-show-polish-until-a-language-is-chosen.md)).
- Every user-facing string sits in a macro, plurals in `plural`, its `pl` translation in the same
  commit; `pnpm i18n:check` fails on drift or a missing one.
- Every [glossary](PRODUCT.md#3-glossary) term has one rendering per locale:
  [glossary.ts](../packages/i18n/src/glossary.ts) declares it with the context `glossary`, the `pl`
  catalog of `packages/i18n` holds its Polish rendering, and every message reuses it. A new term
  enters glossary.ts before its first use in the interface.
- The API returns codes, never sentences, and renders emails in the recipient's language. The one
  sentence it passes on is a payment provider's own, as its module gives it in each language it
  has: the wording of the provider's consent, and where the money of a payment is. An email about
  a takedown quotes the admin's sentence for the account as it was written, marked as a quote.
- An account is named to everyone by `publicName` of [names.ts](../packages/i18n/src/names.ts)
  alone: it quotes the nickname as the reader's language does and names an account with no part
  of a name "Anon".
- Dates go through `Intl` with an explicit time zone: a tenant's dates, programme times included,
  in the tenant's `timezone`, never the browser's; a date with no tenant, such as an invitation's
  expiry, in the browser's. Numbers go through `Intl.NumberFormat`, money in minor units with its
  currency.
- Tenant content is single-language data outside Lingui.

## Environments

|             | Local                   | Dev                                       | Production                         |
| ----------- | ----------------------- | ----------------------------------------- | ---------------------------------- |
| `OPOS_ENV`  | `local`                 | `dev`                                     | `production`                       |
| Supabase    | the CLI's local stack   | a Free project of its own                 | the Pro project, `eu-central-1`    |
| Addresses   | `*.opos.localhost`      | `dev.opos.land`, in a DNS zone of its own | `opos.land`                        |
| Hosting     | the developer's machine | a shared Coolify server                   | not decided                        |
| Deployed by | the developer           | a push to `develop`                       | a push to `main`, after a reviewer |

- `OPOS_ENV` is the one switch between environments; a fake payment provider serves `local` and
  `dev`. Each environment has a bucket of its own, Dev's holding demo files, in a Scaleway project
  that holds it alone, so that the API's key opens it and nothing else, and its deployment runs
  imgproxy beside the API
  ([0069](adr/0069-keep-an-environments-uploaded-files-in-a-scaleway-project-of-their-own.md));
  the local stack and CI run Versity Gateway as the bucket and imgproxy in containers beside
  Supabase's, which
  `pnpm stack:init` and `pnpm stack:up` start ([compose.yaml](../infra/local/compose.yaml)). Mailpit takes the mail of `local` and `dev`, so neither sends to anyone; production sends
  through Scaleway's Transactional Email, from its own domain
  ([0036](adr/0036-keep-every-secret-in-scaleway-secret-manager-and-give-ci-only-the-values-it-uses.md)).
- Dev and production are not deployed yet. Dev runs in a project of its own on a shared Coolify
  server, made by the server's owner; the deployment makes only environments inside it. Production
  never shares a server with Dev
  ([0033](adr/0033-host-dev-on-the-teams-coolify-server-and-leave-productions-hosting-open.md)).
- Dev's addresses sit in a zone delegated from `opos.land`: no credential that changes Dev's
  records reaches production's
  ([0034](adr/0034-address-dev-under-dev-opos-land-in-a-dns-zone-of-its-own.md)).
- A working checkout never points at Dev or production: no `supabase link`, remote URL, project
  reference or token in a `.env` or `mise.local.toml`. The `db:*` scripts, the seed and the schema
  tests refuse a remote host unless `OPOS_ENV` names its environment
  ([migration-url.ts](../packages/db/src/migration-url.ts)).
- The infrastructure of Dev and production changes only through the `deploy:*` commands, which
  apply the OpenTofu units from an operator's machine, under their own identity; no workflow runs
  them, and an agent never runs one that applies, destroys, imports or sets a secret
  ([0035](adr/0035-describe-the-infrastructure-in-opentofu-units-run-by-terragrunt.md)).
- A release comes from CI: once the checks of a push to `develop` passed, Dev deploys the commit
  they passed, through a push to Coolify's webhook signed with a secret that can deploy and change
  nothing; CI never reaches Coolify's API
  ([0075](adr/0075-release-dev-from-ci-through-a-signed-webhook.md)). Started by hand, the
  `release-dev` workflow releases the head of `develop` the same way, once CI's checks of its push
  passed, and no other commit.
- Secrets belong to one environment each and are never committed. A deployed environment keeps each
  in the Secret Manager of its own Scaleway project. An operator signs in with a key of their own
  that expires the same day; CI never reaches Scaleway, and OpenTofu copies what it uses into
  GitHub, a value only some branches may use into an environment that admits those branches alone
  ([0036](adr/0036-keep-every-secret-in-scaleway-secret-manager-and-give-ci-only-the-values-it-uses.md)).
- The seed refuses production, and production data never leaves it
  ([PRODUCT.md](PRODUCT.md#10-personal-data-and-privacy)). Dev's deployment runs it on every
  release while its `env.yaml` says so, in the tools container after the verification and before
  the API starts, so Dev's demo data is the seed's again after each release.
- Supabase Auth settings live in [config.toml](../supabase/config.toml) for the local stack and in
  [infra/modules/supabase](../infra/modules/supabase) for a deployed project, never in a dashboard
  alone; [supabase-auth.test.mjs](../scripts/supabase-auth.test.mjs) keeps the two equal. A deployed
  project is made by hand; OpenTofu changes only what is inside it.

## Tooling and versions

- [mise.toml](../mise.toml) pins Node, the Supabase CLI, gitleaks, the linters and the tools of the
  deploy commands: OpenTofu, Terragrunt and the CLIs of Scaleway and GitHub. `packageManager` pins
  pnpm, `engines` repeats Node and pnpm, and a mismatch aborts the install.
- [mise.lock](../mise.lock) holds every tool's download and its checksum for each platform of
  `lockfile_platforms`, and changes in the same commit as a pin; an install checks the download
  against it, and CI installs from it alone, refusing a tool it does not hold
  ([0077](adr/0077-lock-the-tools-checksums-in-mise-lock.md)).
- A root script is the command, and it runs as `pnpm <name>` without mise. A mise task of the same
  name in [mise-tasks.toml](../mise-tasks.toml) runs it and says what it does, so `mise tasks` lists
  the commands; turbo stays the runner and mise caches nothing. The tasks stay out of `mise.toml`,
  which turbo hashes, and [mise-tasks.test.mjs](../scripts/mise-tasks.test.mjs) keeps both lists
  equal ([0024](adr/0024-list-the-root-commands-as-mise-tasks-that-run-the-pnpm-scripts.md)). A
  command's prefix names what it acts on, `stack` the local stack, `infra` the code in `infra/`
  without a sign-in and `deploy` a deployed environment, and the command has one name in its root
  script, its task, its script's file, its messages and the documents
  ([0079](adr/0079-name-the-root-commands-by-what-they-act-on.md)). Every task runs the root
  script of its name and nothing else, so `pnpm <name>` and `mise run <name>` do the same. A task's
  description fits one row of the list; who may run a command and what its flags do are its
  `--help`, which `mise run` hands on to a script that answers it. The
  deploy commands are one Node script tested like the others, driving tools that come from mise; no
  shell script runs on an operator's machine
  ([0070](adr/0070-run-the-deploy-commands-as-node-scripts.md)). `infra:graph` only reads the
  checkout, and `infra:check`, `infra:images` and `infra:lock` only run the tools from mise. A
  command that drives a tool from mise runs as `pnpm <name>` only where mise's tools are on the
  path.
- The infrastructure lives in [infra](../infra/README.md): an environment is one directory with
  one `env.yaml`, its plain settings and the names of its secrets, and nothing else configures it.
  Every provider is pinned to an exact version with its lock file committed, at least 7 days old
  like a dependency; `mise run infra:check` validates every unit without a sign-in.
- `minimumReleaseAge` refuses a version younger than 7 days; an urgent fix is a deliberate
  `minimumReleaseAgeExclude`, a transitive one a scoped `overrides` entry naming the advisory
  ([0015](adr/0015-run-a-pnpm-turborepo-monorepo-with-pinned-tools.md)).
- Every installed dependency, development ones too, comes under a licence of `ALLOWED` in
  [deps-licenses.mjs](../scripts/deps-licenses.mjs), so none asks more of OPOS than its own licence
  allows; a package naming no licence fails. `pnpm deps:licenses` checks it in the `check` job and
  in lefthook `pre-commit` when the lockfile is staged, and a licence enters the list only through a
  decision record ([0088](adr/0088-allow-dependencies-only-under-listed-licences.md)).
- Dependabot ([dependabot.yml](../.github/dependabot.yml)) proposes the updates of the npm
  dependencies, the actions, the compose images and the OpenTofu providers weekly to `develop`, each
  ecosystem waiting the same 7 days as `minimumReleaseAge`; a group gathers only packages that move
  together, never every dependency
  ([0087](adr/0087-propose-version-updates-through-dependabot-after-the-release-age.md)). The tools
  of `mise.toml` and the Dockerfile's base images are moved by hand; a pull request's `check` names
  the tools with a release past the same 7 days in one warning, which fails nothing.
- The shadcn/ui CLI and its agent skill run the version an application pins, as
  `pnpm --dir apps/<app> exec shadcn`, never `npx shadcn@latest` or `pnpm dlx`, which pass
  `minimumReleaseAge` by; the CLI's MCP server is not used
  ([0021](adr/0021-run-the-shadcn-skill-through-the-pinned-cli.md)).
- turbo ([turbo.json](../turbo.json)) declares only what a rule needs: catalogs compile before
  `local:start`, `build` and `test`; side effects such as `db:*` are never cached; runtime
  variables stay out of the hash; the schema and API suites never share the stack at once.
- No `.env` at the root: each application, `packages/db` and `supabase/` keep their own beside a
  committed `.env.example` naming every variable, secrets empty; `pnpm stack:init` fills them, and
  the API validates its own on start ([env.ts](../apps/api/src/config/env.ts)).
- The local stack publishes its ports on every interface: bind the container engine to `127.0.0.1`.

## Tests

Where a test sits is in [AGENTS.md](../AGENTS.md#tests-first), and why it comes first in
[0018](adr/0018-start-every-change-of-code-with-its-test.md). Integration tests run on the local
stack and mock neither the database nor Supabase Auth. They cover the permission matrix (every
contract route against every actor, an unlisted route failing the suite; every admin route against
every way of not being an admin); RLS on every covered
table, the covered tables equal to the catalog's, and each `db:verify` rule broken once; the
invariants under concurrency; anti-escalation and every write route judging its actor again under
the lock; sessions (refused tokens, cookies, `Origin`, the password after confirmation, `aal2` on
every route); the public routes, rate limits, CORS and catalogs. In e2e the main flows run through
the three frontends, the portal's on a mobile viewport, each scenario checking the BFF boundary.

The seed follows the schema and is idempotent: [seed.test.ts](../packages/db/test/seed.test.ts)
fails when a second run changes a row count. Tests share no data: an e2e scenario makes its own
tenant and accounts and only reads the seed.

## CI

[ci.yml](../.github/workflows/ci.yml) runs on every PR and every push to `develop` and `main`, in
four jobs: `check` (the dependencies' licences, format, typecheck, lint, the tests but the
frontends', the tests-first, migration, database and catalog checks, the BFF boundary over the built
bundles), `frontend` (the tests of the panel, the portal and the admin application, on a runner
without the stack, which leaves its cores to the API tests;
[0089](adr/0089-test-the-frontends-in-a-ci-job-of-their-own.md)), `e2e`, and `secrets` (gitleaks over the
whole history of the checked commit, a PR's merge or a push, and over no other branch; `pnpm audit`
on high advisories). lefthook `pre-commit` runs the same gitleaks over the staged changes, so a
secret is stopped before it enters a commit
([0078](adr/0078-scan-the-staged-changes-for-secrets-before-a-commit.md)).

- On a PR, `e2e` runs only when the change touches a path it reads; one confined to the documents,
  the deployment, the agents' configuration, the other workflows or the tooling scripts skips it,
  which passes its required check. What it does not read is listed in
  [e2e-scope.mjs](../scripts/e2e-scope.mjs), and any path the list does not name runs it; a push
  runs it always ([0086](adr/0086-skip-the-e2e-job-on-a-pull-request-it-cannot-fail.md)).
- PRs target `develop`, where CI blocks nothing. `main` changes only through a PR from `develop`
  with the four jobs green ([protect-main.json](../.github/rulesets/protect-main.json);
  [0017](adr/0017-integrate-on-develop-and-release-through-main.md)).
- A workflow reads the repository only, pins every action by a full commit hash, and passes
  `${{ github.* }}` to a `run` step only through `env`; the one job that reads more reads the
  repository's Actions runs, for `release-dev`
  ([ci-shape.test.mjs](../scripts/ci-shape.test.mjs)). No workflow signs in to a cloud: the
  secrets it reads are those OpenTofu writes into GitHub
  ([0036](adr/0036-keep-every-secret-in-scaleway-secret-manager-and-give-ci-only-the-values-it-uses.md)).
- turbo's remote cache is written only by a run on a push to `develop` or `main`; any other run of
  the repository reads it, and a run without its secrets, such as a fork's, works without it.
  GitHub admits only those two branches to the environment that holds the writing token, the
  artifacts are signed with a key the cache server never holds, and no failure of the cache fails
  a job
  ([0037](adr/0037-share-a-turborepo-remote-cache-that-only-develop-and-main-write.md)).

## Modules waiting for their domain owner

Reviews and attendee registrations get no code until their domain owner sets their rules in the
module's [spec](specs/README.md)
([PRODUCT.md](PRODUCT.md#7-modules), [0019](adr/0019-documents-hold-rules-the-code-holds-the-rest.md));
the lasting ones land here. The tickets module has its owner's rules and is built one spec at a
time, the [shop's setup](specs/0002-shop-setup.md), the [catalog](specs/0003-catalog.md),
[checkout and orders](specs/0004-checkout-and-orders.md),
[order management](specs/0006-order-management.md) and the [scanner](specs/0007-scanner.md) so
far: what no spec has built yet keeps the
rules below. Any shape keeps tenant tables under RLS, a read across tenants as a new
[cross-tenant query](#tenant-isolation), organizer routes behind the module's permission and the
steps of [adding a feature](#adding-a-feature).

| Module                 | Rules any shape keeps                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| reviews                | invariant 8; deleted with the item or the author's account; organizer routes need `program`     |
| tickets                | invariants 9, 10, 15 and 16; organizer routes need `tickets`, the provider configuration `shop` |
| scanner                | invariants 10 and 11                                                                            |
| attendee registrations | invariant 7                                                                                     |

- **Payments.** The money goes to the convention's own provider account
  ([0081](adr/0081-take-ticket-payments-into-the-conventions-account-and-review-one-that-does-not-match.md)). Of a payment OPOS
  keeps what the provider's module gives for the orgs, the amount, the time and the provider's
  number of the transaction, and nothing of a card or a bank account; provider credentials are
  sealed with a key of the API's environment for their tenant and provider, never returned,
  logged or read by a route outside the shop permission
  ([0044](adr/0044-seal-payment-provider-credentials-with-a-key-of-the-apis-environment.md)). A
  provider is asked through one port, [payments](../apps/api/src/modules/payments), outside every
  transaction. A notification names its attempt alone and counts once its signature holds: one
  whose signature does not hold answers as an unknown address. A confirmation is taken in three
  steps, a transaction that locks the order and decides, the module's call, a transaction that
  writes the outcome, and the order is paid only in the last
  ([0047](adr/0047-take-a-payment-in-three-steps-around-the-providers-call.md)); a repeat changes
  nothing, and another amount than the total never pays the order. Przelewy24 is the first real
  provider, loaded everywhere
  ([0054](adr/0054-take-the-first-payments-through-przelewy24.md)): its module holds no table,
  finds a transaction by the attempt's identifier, and logs nothing of a request or an answer.
  Only `local` and `dev` load a fake provider, and only there does a sandbox account connect.
- **The shop's setup.** What opening a shop asks of the convention, an edition-level route answers
  as a yes or a no alone: the provider account and the seller's details stay behind `shop`,
  until an edition's shop is open and shows its buyers the seller and names the provider. The
  conditions are read under the tenant's write lock, and every write that would take one away
  from an open shop is refused under the same lock. A published version of a legal document is a
  file for everyone, served by the version's own identifier and bound to the tenant its address
  names; it is not bound by its edition's publication, since a buyer reads what they accepted.
  The sentence of a consent an order accepted is refused any change, by a code of its own; the
  change locks the consent's row before it reads the orders, so an order that accepts the
  consent at that moment is counted
  ([0094](adr/0094-attest-in-an-order-each-consent-exactly-as-its-buyer-saw-it.md)).
- **The catalog.** What an edition sells lies in edition tables behind `tickets`. A list a row
  carries, such as a ticket type's price tiers or an item's option axes, travels with its row as
  a whole. A ticket type has one price at a moment or none: an exclusion constraint keeps its
  tiers apart, and the API refuses them first by a code of its own
  ([0046](adr/0046-keep-the-price-tiers-of-a-ticket-type-apart-with-an-exclusion-constraint.md)).
  A statement by identifier names the parent it acts within, whoever calls it. A change that
  writes several add-ons, a new place or a deletion, first locks the edition's add-ons by
  identifier, as an order locks those of its cart, and a deletion of a merchandise item first
  locks its variants (invariant 9). A picture or a size chart of a merchandise item, and the
  picture of an add-on, is a file for everyone once what it shows is not hidden and its edition
  is published, served under the convention's address by the identifier its row holds; before
  that the edition's orgs read it through a route of their own.
- **Checkout and orders.** A buyer needs no membership: a visitor's routes open the tenant from
  its address and answer an unpublished edition and a suspended tenant as an unknown address; an
  account's are tenant routes behind `@InTenant`, which answer an unpublished edition the same
  way and a suspended tenant as every tenant route does. The reads that decide which order a
  buyer opens filter on the tenant themselves. A cart is priced by one function of the
  contract, which the portal runs for the running total and the API for the order
  ([0050](adr/0050-price-a-cart-with-one-function-of-the-contract.md)); an order is placed at
  the total the buyer saw or not at all. Its request names each consent accepted with the
  version of the document shown beside it, and the API places no order with a version that is
  not the one in force, so that the order keeps what its buyer saw
  ([0094](adr/0094-attest-in-an-order-each-consent-exactly-as-its-buyer-saw-it.md)). The routes
  that open an order without a sign-in take its result token in a header, for 24 hours from its
  placing; the token and an order link are stored as hashes, the QR code of a paid order sealed
  for its own row
  ([0051](adr/0051-keep-an-orders-secrets-as-hashes-and-its-qr-code-sealed.md)). The bot check
  is verified before the order's transaction, by a stand-in on `local` and `dev` and by nothing
  that passes on production
  ([0052](adr/0052-stand-in-for-the-bot-check-until-the-portal-has-one.md)). An email of an order
  is queued in the transaction of its cause and sent by the outbox
  ([0049](adr/0049-send-the-emails-of-an-order-from-an-outbox-in-the-database.md)). A provider
  account stays as it is while a payment is under way, which is while an order awaits payment
  and for 24 hours from the end of the hold of an expired order that has a payment attempt
  nobody confirmed: it is not disconnected, and it gives way to new credentials only when they name the same
  account, as its provider's module tells, when the stored ones no longer open, or when the
  provider, asked before the route's transaction, refuses the stored ones
  ([0093](adr/0093-change-a-provider-account-under-a-payment-only-where-the-payment-loses-nothing.md)).
  An order being placed and a change of the account share one lock of the tenant's account. The
  expiry of orders asks the account the convention holds now, and expires an order whose attempt
  that account does not know. The orders awaiting
  payment of an email in an edition are counted under a lock of that email in the edition, which
  an order takes after the locks of invariant 9. `opos_app` never updates an order's number, its
  prices or what a line sells, but for a merchandise line's variant
  ([0058](adr/0058-let-the-api-change-the-variant-an-order-line-names.md)).
- **Order management.** Every change an org makes of an order runs under the tenant's write lock
  and locks the order's row first, then the rows that carry the limits its lines touch, in the
  order placing takes them (invariant 9): the order a payment's confirmation takes too. A manual
  order is priced by the contract's one function against the offer the shop would make at that
  moment were it open, and takes the same locks
  ([0055](adr/0055-record-a-sale-made-outside-the-shop-as-a-manual-order.md)). A cancellation and
  a decline change the order alone and ask no provider for anything
  ([0056](adr/0056-cancel-and-decline-an-order-without-returning-money.md)). A changed email
  gives the order a new QR code: the old one is marked replaced once no order carries it, and
  the links sent before are ended. A QR code is searched by its hash, which the panel makes, and
  never travels in an address
  ([0057](adr/0057-search-an-orders-qr-code-by-a-hash-the-panel-makes.md)). An email of an order
  is queued without a text: the outbox writes it from the order as it stands when it is sent,
  under the lock of the order's row, so each thing an org changes is a kind of email of its own,
  and an email that would hand the order over to an address the order has left since is
  withdrawn, never sent. So is an email that says the order is paid, with its QR code, once the
  order no longer is. What a sent email said is kept on its row, a subject and a text written
  apart from the email that goes out, as for an address with no account: in the convention's
  language and with no way to sign in. It holds neither the QR code nor the token of the order
  link: each is noted for leaving out where the outbox makes it, never by the kind of the email,
  and no read across tenants reaches the text
  ([0068](adr/0068-keep-what-a-sent-email-of-an-order-said-without-what-hands-the-order-over.md)).
  An order's page, the list of an edition's emails and what is kept of an email tell an org
  neither whether an email address has an account nor the addresses of the orgs an alert went
  to, and no search finds an alert by an address.
- **Discount codes.** A code's terms never leave the API. The offer names no code: the portal
  asks the quote for the price of the cart with the code a buyer entered, and the API prices it
  with the contract's one function. Every code that cannot be used answers the quote alike, and
  a quote that tries a code counts against a rate limit of its own for the client's address
  ([0062](adr/0062-keep-a-discount-codes-terms-in-the-api-and-refuse-every-unusable-code-alike.md));
  an order whose code cannot be used counts against the same limit, and an address that limit
  blocks places no order with a code. No more of an address's orders with a code are placed at
  once than it has tries left, so placing them, one by one or together, is no other way to try
  codes. An order that uses its code counts against nothing.
  A code is looked up within the edition the request names. An order names its code, and what
  the code took off is a line of the order below zero, the only one. A use is an order that
  holds: it is counted under the lock of the code's row, the last lock an order takes
  (invariant 9), when an order is placed, when a payment after the hold or an org settling a
  review takes it again, and when an org changes the limit. A change of a code takes the ticket
  types and the add-ons it names before the code's row, as an order does. A code an order names
  is never deleted: the order's foreign key refuses it.
- **Sales reports.** The dashboard of an edition and its lists are read from the orders as they
  are, by queries that lock nothing: a report never slows a sale. What is sold is what "Paid"
  and "Paid - manual" orders hold; what orders awaiting payment and needing review hold is
  counted apart, and no other order counts. A file an org exports is CSV in UTF-8 with a byte
  order mark, its texts quoted and its fields separated by semicolons, named after the edition
  and the list; the API exposes that name to the panel's origin. Its columns are in the language
  the panel shows and sends with its request, a moment in it is in the convention's time zone,
  and an amount is a number to the cent with the decimal mark of that language. A cell that
  begins like a formula is written with a leading apostrophe. A file holds names and email
  addresses: it is written for the org who asked, kept nowhere, and no log holds any of it; the
  lists share a rate limit an account.
- **The pre-edition reminder.** It goes out at 9:00 by the clock of the convention's time zone,
  so many days before the edition's first day in that zone, and on that day alone: a reminder
  missed on its day is not sent late. Its job queues one email a QR code that a paid order still
  carries and notes that the reminder went out in one transaction of the edition's tenant, so it
  is queued whole or not at all, once an edition. The email is written when it is sent, from the
  order as it then stands: it carries the QR code, so it is withdrawn like a confirmation when
  the order has left its address, and an order canceled since gets none. The reminder of its
  code then goes to the earliest order on the code still paid, if one was paid before the
  reminder went out. A "Buy more" order has no age band: the guardian rules a reminder tells are
  those of the order on its code that holds the ticket.
- **Links and devices.** A link opening an order or a ticket without a sign-in, and a scanner
  device's `Authorization: Bearer` token, carry at least 128 random bits, stored as a hash; their
  lookup returns only the ids that open the tenant context. A device's access ends no later than
  that of the org who enabled it.
- **Buyer self-service.** An order link's token travels after the `#` of the portal's address
  and in the body of a request, never in a path or a query; its routes name no tenant, so every
  read behind them filters on the tenant the link's hash answered
  ([0063](adr/0063-open-an-order-link-by-a-token-after-the-hash-found-across-tenants.md)).
  What a link opens carries no email address and nothing of the ticket holder. Asking for a
  fresh link answers alike for any token, and queues one at most once an hour for an order; the
  email that carries it hands the order over, and is withdrawn like a confirmation when the order
  has left its address. The routes of an account's own orders are tenant routes that ask for no
  membership: their reads filter on the tenant and on the session's account, and another
  account's order is not there. A "Buy more" order names the account's own paid order of the
  same edition, whose row is locked before any limit, when the order is placed and when a
  payment or an org makes it paid; it is priced by the contract's one function against what that
  order's ticket type offers and what was bought on its QR code, and
  once paid joins the QR code that order then carries, while the two are under one email: an
  order an org moved to another address is added to no longer, and shares its code with nothing
  its old address bought
  ([0064](adr/0064-add-to-a-paid-order-with-an-order-of-its-own-on-the-same-qr-code.md)).
- **The scanner.** A phone becomes a scanner by spending a pairing code, which travels in a
  request's body and after the `#` of a link, never in a path or a query; it is then known by its
  token alone ([0059](adr/0059-pair-a-scanner-with-a-code-and-know-it-by-a-token.md)). A guard
  names the scanner before anything of a request is read, and the device is judged at every
  request in its tenant's transaction: revoked, ended, or enabled by an org whose access has
  ended or who no longer writes the tickets of its edition, it opens nothing. It is judged there by the secret the phone sent, the token or the
  pairing code, which the scanner must still hold: a new pairing code replaces both, and the hash
  that found the scanner across tenants was read a moment before. An org gives a new pairing
  code only to a scanner that ends no later than its own access. A scan reads the orders of the scanner's own edition that the code
  carries, and no email address; a code of another edition is told as such, and nothing of its
  order is read. A hand-out is marked only under the code the scanner read, and names the
  scanner. The list of an edition's scanners tells who enabled each by an address only to a
  member who may read the team; another org is told its own address alone. QR codes are drawn and read in the browser, and a camera frame never leaves the phone
  ([0060](adr/0060-read-and-draw-qr-codes-in-the-panels-browser.md)).

## Adding a feature

A feature starts from its accepted [spec](specs/README.md), and a decision it makes gets a
[record](adr/README.md). Then the order of work for a tenant table, a route and a screen; skip what
a feature does not need. The `program` slice is the reference, from its
[privileges migration](../packages/db/drizzle/0017_program_items_privileges.sql) to its
[panel feature](../apps/panel/src/features/program). **Test first** is the test to change before
the code ([AGENTS.md](../AGENTS.md#tests-first)); **Enforced by** is what refuses a skipped step,
"nothing" meaning the author and the reviewer alone.

| Order | Step                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Test first                                                                                                           | Enforced by                                                                                                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Table in `packages/db/src/schema/<table>.ts` with the columns of `packages/db/src/schema/columns.ts`, exported from `packages/db/src/schema/index.ts`: its own `tenant_id`, a composite foreign key, an index starting with `tenant_id`                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `packages/db/test/rls.test.ts`: `covered`, `populated()`; a foreign parent in `packages/db/test/invariants.test.ts`  | `rls.test.ts` on a table missing from `covered` or its index; the foreign key: `tenant-isolation-reviewer`                                                                                                             |
| 2     | `pnpm db:generate --name=<table>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | step 1's                                                                                                             | `scripts/check-migrations.mjs` in `pre-push` and CI ([conflicts](#a-migration-applied-or-in-conflict))                                                                                                                 |
| 3     | `db:generate --custom --name=<table>_privileges`, written by hand before it is applied: forced RLS, `tenant_isolation`, revokes, narrowest grants, `<table>_set_updated_at`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | step 1's                                                                                                             | `pnpm db:verify` in CI; `.claude/hooks/migration-reminder.mjs` reminds; the trigger: nothing                                                                                                                           |
| 4     | New privileges in `appWrites`, `appUpdates` or `globalReads` of `packages/db/src/verify.ts`; `pnpm db:migrate`, `pnpm db:verify`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `rls.test.ts`: each write, `rejects an insert with another tenant id`                                                | `pnpm db:verify`; `rls.test.ts` for `globalReads`                                                                                                                                                                      |
| 5     | Route in `packages/contract/src/<module>.ts` from `packages/contract/src/common.ts`, exported in `packages/contract/src/index.ts`; an error code in `packages/contract/src/errors.ts`, its message in `packages/i18n/src/errors.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `apps/api/test/<module>.test.ts` (`apps/api/test/route-needs.ts` is no test); `packages/contract/src/errors.test.ts` | `packages/contract/src/errors.test.ts` on a code without a message; `apps/api/test/tenant-routes.test.ts`, `apps/api/test/route-requirements.test.ts` on a route not served                                            |
| 6     | The route's need in `tenantRequirements` of `apps/api/test/route-needs.ts` or `publicRoutes` of `route-requirements.test.ts`; a write route in `writes` of `apps/api/test/write-races.ts`, its table in `tenantState` of `apps/api/test/tenants.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                        | the lists are the test                                                                                               | `route-requirements.test.ts` until listed, then every actor; `write-race-demotion.test.ts` for `writes`; `tenantState`: nothing                                                                                        |
| 7     | Module in `apps/api/src/modules/<name>`, registered in `apps/api/src/app.module.ts`: an `@Implement` method per route with `@RequireTenant`, `@RequireEdition` or `@InTenant`, which bring `JwtAuthGuard` (`401` `session.invalid`, `session.mfa-required`) and at `write` the queue and lock; an account route `@UseGuards(JwtAuthGuard)`; a repository on `TenantContextService.tx()`, rows found inside the path's parent; a kind of file in `FILE_KINDS` of `apps/api/src/modules/files/kinds.ts`, with its variants for images, its pointing column in `globalReads` and granted to `opos_app_global` in the feature's migration, and its routes marked `@TakesFile` or `@ServesFile` | `apps/api/test/<module>.test.ts`, with another tenant's and edition's identifiers                                    | `tenant-routes.test.ts`, `route-requirements.test.ts`, `apps/api/test/mfa-guard.test.ts`; `apps/api/test/tenant-filters.test.ts` for a repository that decides access; a forgotten parent: `tenant-isolation-reviewer` |
| 8     | Rows in `packages/db/src/seed.ts`, then `pnpm db:seed` twice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | any test of `packages/db`                                                                                            | `packages/db/test/seed.test.ts`; a missing seed: nothing                                                                                                                                                               |
| 9     | Feature in `apps/panel/src/features` or `apps/portal/src/features` with `api/`, `pages/`, `index.ts`, routed in `apps/panel/src/app/router.tsx` or `apps/portal/src/app/router.tsx`; a panel page uses `useCurrentTenant()` and `NoPermissionView`; every page `usePageTitle`; a page needing a session inside `RequireSession`, which answers `mfa-required` and `unavailable`; a new top-level panel path joins `RESERVED_TENANT_SLUGS` of `packages/db/src/schema/tenants.ts`, a migration                                                                                                                                                                                              | `apps/panel/src/features/program/pages/program-page.test.tsx` shows the shape                                        | ESLint; `src/app/pages.test.ts`; `scripts/bff-boundary.mjs`; `RequireSession` and reserved paths: nothing                                                                                                              |
| 10    | Strings in Lingui macros, `pnpm i18n:extract`, `pl` in the application's `src/locales/pl.po` (`apps/panel`, `apps/portal`, `apps/admin`); a new term first in `packages/i18n/src/glossary.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | a `packages/i18n` test for the glossary; none for a catalog                                                          | `pnpm i18n:check`; a bare literal: `i18n-reviewer`                                                                                                                                                                     |
| 11    | A scenario in `e2e/specs` for a new flow, on its own rows through `e2e/fixtures/index.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | the scenario                                                                                                         | the `e2e` job; none written: nothing                                                                                                                                                                                   |
| 12    | The documents, through `docs-sync`, where a rule changed; a record in `docs/adr` for each decision the feature made; the spec marked `Implemented`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | none                                                                                                                 | `.claude/skills/docs-sync/scripts/check-doc-links.mjs`; `.claude/agent-docs.test.mjs` for the shape of records and specs; the truth of the text: nothing                                                               |
| 13    | `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:scripts`, `pnpm db:verify`, `pnpm i18n:check`, `pnpm format:check`; for the UI `pnpm test:e2e` and a click-through, the portal on a phone viewport; `tenant-isolation-reviewer` and `i18n-reviewer` where they apply                                                                                                                                                                                                                                                                                                                                                                                                                | none                                                                                                                 | the `check`, `frontend` and `e2e` jobs; the agents and the click-through: nothing                                                                                                                                      |

### A migration applied or in conflict

Drizzle applies a migration only when its journal timestamp is newer than the last applied and
compares no text: an edit of an applied migration, before it is merged, takes `pnpm stack:reset`,
`pnpm db:migrate` and `pnpm db:seed`. On a conflict in `packages/db/drizzle/meta/_journal.json`,
take `origin/develop`'s `packages/db/drizzle/meta`, generate yours again under the same names with
the hand-written SQL restored, and run `node scripts/check-migrations.mjs --base origin/develop`.
