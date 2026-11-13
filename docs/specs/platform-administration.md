# Platform administration

- Status: Implemented
- Domain owner: admin
- Decisions: [0029](../adr/0029-ship-four-web-applications.md),
  [0030](../adr/0030-guard-admin-access-with-its-own-role-application-and-second-factor.md),
  [0031](../adr/0031-suspend-a-tenant-before-deleting-it.md)

## Goal

The admin application, `apps/admin` at `admin.opos.land`: the admins run the platform in it, with
no access to the server. It serves step 1 of the MVP flow
([PRODUCT.md 2](../PRODUCT.md#2-mvp-goal-and-end-to-end-flow)), the admin creating a convention and
its first head, and gives the admin what the scripts never did: a list of the tenants, their
suspension and their deletion.

## Business rules

### Access

| # | Rule |
|---|---|
| A1 | Only an account holding the admin role reaches an admin route. Any other account is refused and sees nothing of any tenant. |
| A2 | The role is granted and taken away only by a script run on the server. No route and no screen grants it, and the grant needs a confirmed account with a password and two-factor authentication on. |
| A3 | An admin has two-factor authentication on, and an admin route passes only a session that gave its code. An admin who turned it off is told to turn it on in the portal. |
| A4 | The role holds only with the second factor the account had when it was granted. With a factor turned on again or replaced since, the account is refused and told to ask for a new grant. |
| A5 | An admin route answers only the admin application: the same account's session in the panel or the portal has no admin power, and the admin application's session opens neither of them. |
| A6 | The admin application signs in by email, password and the code. It offers no sign-up, no Google sign-in, no password reset, no recovery code and no account screen. |
| A7 | Every admin route needs a sign-in younger than 30 minutes; deleting a tenant and resetting two-factor authentication need one younger than 5 minutes. |

### Tenants

| # | Rule |
|---|---|
| T1 | The list shows every tenant: its name, its address, whether it is suspended and when it was created. A tenant's page also shows its heads, by name and email address, so that the admin can reach them. |
| T2 | A tenant is created with its name, address, language, time zone and the email address of its first head. The first head is an account with a confirmed email address; with any other address nothing is created and nothing is sent. |
| T3 | An address keeps the rules of [PRODUCT.md 6](../PRODUCT.md#6-addresses-and-domains): a taken address, a word the platform uses itself and the address of a deleted tenant are refused, at creation and at a change. |
| T4 | A changed address answers at once, and the old one is not found. |
| T5 | A suspended tenant is off for everyone but the admin: its page is not found in the portal, a user's personal schedule leaves its programme items out, an invitation to it is refused, and every tenant route answers its organizers only that the convention is suspended. A membership stays and shows the convention as suspended. |
| T6 | Restoring a suspended tenant brings everything back as it was. Suspending a suspended tenant and restoring one that is not change nothing. |
| T7 | Only a suspended tenant can be deleted. The deletion is immediate and permanent and takes everything the tenant owns: its team, editions, programme and likes. The accounts stay, and its former head still signs in. Its address is never given to another tenant. |
| T8 | The deletion asks in a modal that names the convention, says what goes and that it cannot be undone, and acts only once the tenant's address is typed in. |
| T9 | No email goes to the heads when their tenant is suspended, restored or deleted. |
| T10 | The last head of a suspended tenant cannot hand the role over, and so cannot delete their account: they ask the admin. |

### Accounts

| # | Rule |
|---|---|
| C1 | The admin resets the two-factor authentication of the account with a given confirmed email address: its factors and unused recovery codes go, and the account gets the email that says so. The reset ends none of the account's sessions. |
| C2 | An unknown or unconfirmed address, and an account without two-factor authentication, are refused and change nothing. |
| C3 | The two-factor authentication of an admin is never reset in the admin application. An admin who lost both device and codes has the role taken away by the script, is reset as any account is, and is granted the role anew. |

### Log

| # | Rule |
|---|---|
| L1 | Every action of an admin that changes anything leaves an entry: who, what, on which tenant or account, and when. Granting the role and taking it away leave one too, with no admin named. |
| L2 | The application only adds entries; none is changed or removed. An entry holds identifiers and the tenant's address, never an email address. |
| L3 | An entry exists whenever its action happened: it commits with the action, and before the reset of two-factor authentication acts. |
| L4 | The log's screen lists the entries, newest first, to every admin. |

## Shape

### Tables

The three new tables are platform level, outside RLS: none is a tenant or an edition table.

| Table | Holds |
|---|---|
| `tenants` | one more column, `suspended_at`, empty while the tenant is not suspended |
| `admins` | `account_id`, the primary key, going with its account; `granted_at`; `mfa_enabled_at`, the account's own as the grant found it: the role holds while the two are equal |
| `admin_actions` | `action`, `admin_account_id` (empty for a script), `subject_tenant_id`, `tenant_slug` as the action left it, `subject_account_id`, `created_at`; no foreign key, so an entry outlives its tenant and its accounts |
| `retired_tenant_slugs` | `slug`, the primary key: the address of every deleted tenant; `retired_at` |

`admin_actions.action` is one of `tenant.create`, `tenant.rename`, `tenant.suspend`,
`tenant.restore`, `tenant.delete`, `account.reset-2fa`, `admin.grant` and `admin.revoke`.

### Database role

`opos_admin`: a third runtime role, with `BYPASSRLS` and these privileges only.

| On | May |
|---|---|
| `tenants` | read; insert; delete; update `slug` and `suspended_at` |
| `tenant_memberships` | read the heads; insert the first head |
| `accounts` | read the identifier, name, email address, language, and whether the address is confirmed and two-factor authentication is on |
| `account_recovery_codes` | delete the unused ones |
| `admins` | read |
| `admin_actions` | read; insert, but for an entry's identifier and time, which the database gives |

`opos_app` gains nothing, and `opos_app_global` gains the read of `tenants.suspended_at`. Triggers
of `tenants` retire the address of a deleted tenant and refuse a retired one, so no runtime role
holds anything on `retired_tenant_slugs`.

### Functions and scripts of `packages/db`

| Function | Does |
|---|---|
| `createTenant`, `renameTenant` | as today, also in the caller's transaction; `renameTenant` finds the tenant by its identifier |
| `suspendTenant`, `restoreTenant` | set and clear `suspended_at`; say whether anything changed |
| `deleteTenant` | deletes in one statement that matches only a suspended tenant, so a tenant restored meanwhile is refused |
| `grantAdmin`, `revokeAdmin` | write `admins` and the log entry; behind the scripts `db:admin:grant` and `db:admin:revoke` alone. The grant refuses an account without a confirmed address, a password or two-factor authentication, and one with more than one verified factor |
| `recordAdminAction` | adds a log entry in the caller's transaction |

The scripts `db:tenant:create`, `db:tenant:rename` and `db:account:reset-2fa` go with the routes
that replace them.

### Routes

Every admin route starts from `adminRoute` and lives under `/admin`.

| Route | Needs | Refuses with |
|---|---|---|
| `GET /admin/tenants` | admin | |
| `GET /admin/tenants/{tenantId}` | admin | `request.not-found` |
| `POST /admin/tenants` | admin | `tenant.slug-taken`, `tenant.slug-reserved`, `tenant.slug-retired`, `account.not-found`, `account.unconfirmed` |
| `PUT /admin/tenants/{tenantId}/slug` | admin | `request.not-found`, `tenant.slug-taken`, `tenant.slug-reserved`, `tenant.slug-retired` |
| `POST /admin/tenants/{tenantId}/suspend` | admin | `request.not-found` |
| `POST /admin/tenants/{tenantId}/restore` | admin | `request.not-found` |
| `DELETE /admin/tenants/{tenantId}` | admin, fresh sign-in | `request.not-found`, `tenant.not-suspended` |
| `POST /admin/accounts/reset-2fa` | admin, fresh sign-in | `account.not-found`, `account.unconfirmed`, `mfa.not-enabled`, `account.is-admin` |
| `GET /admin/actions` | admin; a page of at most 100 entries, older than a given one | |

An account that is no admin gets `403` `permission.denied`; an admin with two-factor authentication
off `403` `admin.mfa-not-enabled`; an admin whose factor is newer than the grant `403`
`admin.grant-outdated`; an admin whose sign-in is older than the route allows `401`
`session.reauthentication-required`. The admin writes share a rate limit per account.

Changed outside `/admin`:

| Route | Change |
|---|---|
| every tenant route | `403` `tenant.suspended` for a suspended tenant, before the membership is read |
| `GET /public/tenants/{slug}` and the routes under it | `404`, as for an unknown address |
| the preview and the acceptance of an invitation | `403` `tenant.suspended` |
| `GET /me/memberships` | each tenant says whether it is suspended; a suspended one lists no editions |
| `GET /me/schedule` | leaves the programme items of a suspended tenant out |

From the admin application's origin the API serves `/admin`, sign-in, refresh, sign-out, the code of
two-factor authentication, `GET /me` and `PATCH /me`; anything else is `403`
`request.origin-denied`. The API registers the admin routes only when it holds the connection of
`opos_admin`.

### Screens

The admin application:

| Screen | Holds |
|---|---|
| sign-in | email and password; then the code |
| conventions | the list of T1; the way to a new convention |
| new convention | the form of T2 |
| a convention | its data and heads; the change of its address; suspending and restoring; the deletion of T8, offered only while suspended |
| two-factor reset | an email address and the action of C1, asked in a modal |
| log | the list of L4 |

An account that is no admin, an admin without two-factor authentication and an admin whose grant is
outdated each see one screen that says so, with a sign-out. A stale sign-in asks for the password
and the code again, then returns to the screen it came from.

The panel shows a suspended convention as suspended where it lists the account's conventions, and
shows only that message inside one. The portal shows a suspended convention's page as not found.

### Seed

A suspended tenant with a head of its own; and, on the local stack alone, an admin account with
two-factor authentication on. The demo password and recovery codes are public, so on Dev a
person's own account is granted the role by the script.

## Tenant isolation and permissions

- `admins`, `admin_actions` and `retired_tenant_slugs` are global tables, like `accounts`: no
  `tenant_id`, no RLS, limited by privileges. No runtime role writes `admins`; only `opos_admin`
  reads it and reads or adds to `admin_actions`; no runtime role reaches `retired_tenant_slugs`.
- `opos_admin` is used by one service of the API, as `opos_app_global` is by `GlobalDbService`, and
  never opens a tenant transaction. `verify.ts` lists its reads, writes and updates and refuses
  anything beyond them.
- The cross-tenant queries of the admin routes are bound by the admin role of the session's
  account, a bound of its own beside the three of
  [ARCHITECTURE.md, Tenant isolation](../ARCHITECTURE.md#tenant-isolation).
- No tenant transaction opens on a suspended tenant, whether the tenant comes from the request's
  header, a token or a lookup: the check sits where the transaction opens.
- Invariant 2 holds: a tenant is created with its head in one transaction, and a deletion takes the
  tenant with its memberships. Two invariants are new: a tenant is deleted only while suspended,
  enforced by the statement that deletes it; and the address of a deleted tenant is never a
  tenant's again, enforced by triggers of `tenants`.
- A head's power ends at the tenant: suspension, deletion and the address stay the admin's alone.

These sentences of ARCHITECTURE.md change with the code: the applications and the BFF boundary
naming two frontends; the roles of the database; the global tables; the bounds of a cross-tenant
query; who writes `tenants` rows; the origins CORS names; the routes that need a fresh sign-in; the
kinds of route a contract starts from.

## Tests

Integration, in `packages/db/test`:

- `opos_admin` reaches exactly its privileges on every table and column; `opos_app` can neither set
  `suspended_at` nor touch `admins` or `admin_actions`; `setTenantContext` refuses `opos_admin`.
- `verify` fails on each new rule broken once.
- `deleteTenant` refuses a tenant that is not suspended, also against a restore held open; the
  deletion takes everything of the tenant and leaves the accounts; a log entry rolls back with its
  action.
- The address of a deleted tenant is refused at creation and at a change, also against a deletion
  held open; an address left by a change is free.
- `grantAdmin` refuses an account that is unconfirmed, has no password or has two-factor
  authentication off; a new grant follows a changed factor; both scripts leave their log entry.
- The seed, run twice, changes no row count.

Integration, in `apps/api/test`:

- Every admin route against each actor: no session; an admin's session with the panel's and the
  portal's origin; an account that is no admin; an admin with two-factor authentication off; an
  admin whose factor is newer than the grant; a session that gave no code; a sign-in older than 30
  minutes; a stale sign-in on a route that needs a fresh one; an admin, who passes.
- A route under `/admin` is an admin route and the reverse; no route writes `admins`.
- Each admin route: what it changes, what it refuses, its log entry, the rate limit.
- A suspended tenant: every tenant route `403` with nothing changed, every public route `404`, the
  invitation refused, the memberships and the schedule as the rules say; restored, all of it back.
- The admin application's origin: its cookie pair, CORS, and the refusal of every route outside the
  allowed ones.

e2e, each scenario making its own tenants and accounts and checking the BFF boundary:

1. An admin signs in with password and code and sees the conventions; a wrong code is refused.
2. An account that is no admin sees that it is none, and no convention.
3. An admin who turned two-factor authentication off is told to turn it on; having done so in the
   portal, is told to ask for a new grant, and gets in once granted.
4. The admin creates a convention with a confirmed account as its first head; that head opens it in
   the panel.
5. An unknown or unconfirmed email address, a taken or reserved address and the address of a
   deleted convention create nothing.
6. A changed address: the convention's page answers at the new one, and the old one is not found.
7. Suspended: the page is not found in the portal, and the head sees the message where the
   conventions are listed, inside the convention and on the next action of an open page.
8. Restored: the page and the panel work again, with the data as it was.
9. The deletion is offered only while suspended and asks for the address typed in; then the
   convention is gone and its head still signs in. A stale sign-in cannot be made in a scenario:
   the API's tests refuse one on the two routes, and the admin application's own tests lead such
   a refusal back to sign-in.
10. Two-factor reset: that account next signs in to the portal without a code; an unknown address
    is refused.
11. The log lists these actions with their admin, action and target.
12. An admin session is no panel session, and signing out of one leaves the other.

## Out of scope

- Granting the admin role in the admin application: scripts alone
  ([0030](../adr/0030-guard-admin-access-with-its-own-role-application-and-second-factor.md)).
- An invitation for a first head who has no account yet.
- Reading or changing what is inside a tenant, its team, editions or programme, and acting as one
  of its organizers.
- Changing a convention's name, language or time zone: its organizers do that in the panel.
- Custom domains and domain ownership verification
  ([PRODUCT.md 11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp)).
- Emails to the heads about a suspension, a restoration or a deletion.
- Suspending or deleting an account.
- How long the log is kept: log retention is beyond the MVP
  ([PRODUCT.md 11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp)).
- What a deletion does to a tenant's orders and tickets: the spec of the tickets module sets it;
  until then a deletion takes everything.
- Limiting at the edge who reaches `/admin` and `admin.opos.land`: decided with the hosting
  ([0012](../adr/0012-host-each-environment-on-a-vps-with-compose-and-traefik.md)).
- Saying in the interface that a deleted tenant stays in the backups:
  [PRODUCT.md 10](../PRODUCT.md#10-personal-data-and-privacy) states how long they are kept.
