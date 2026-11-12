# 0030. Guard admin access with a role of its own, its own application and session, and a required second factor

- Status: Proposed
- Date: 2026-11-12

## Context

The admin application ([0029](0029-ship-four-web-applications.md)) brings the API routes with power
over every tenant, which [0009](0009-ship-three-web-applications.md) called the most valuable
target in the API and kept out. About three accounts are to hold that power.

Until now it sat behind access to the server. The running API holds no database role that can
insert or delete a tenant, reads across tenants only what a session's own account or a proved
secret bounds ([ARCHITECTURE.md, Tenant isolation](../ARCHITECTURE.md#tenant-isolation)), keeps
each application's session in a cookie pair of its own, chosen by the request's `Origin`
([0004](0004-make-the-api-the-only-backend-with-the-session-in-cookies.md)), and leaves two-factor
authentication to each account's choice
([PRODUCT.md 10](../PRODUCT.md#10-personal-data-and-privacy)).

## Decision

- **The admin role is a row in the database, granted and taken away only by a script** run on the
  server as `postgres`. No route and no screen makes an admin, and no database role of the running
  API can write the role.
- **Two-factor authentication is required of an admin, and the role holds only with the second
  factor it was granted with.** The grant needs a confirmed account with two-factor authentication
  on. An account that turned it on again or replaced it after the grant is no admin until it is
  granted the role anew.
- **An admin route answers only the admin application.** The request carries the admin
  application's `Origin`, so only that application's cookie pair is read: the same account's session
  in the panel or the portal has no admin power. The session is at `aal2`.
- **The admin application's origin reaches only what the admin application needs**: the admin
  routes, sign-in, refresh, sign-out, the code of two-factor authentication, and the account's own
  name, language and theme. Sign-up, Google sign-in, a password reset, a recovery code and every
  change of the account's credentials are refused from it.
- **Deleting a tenant and resetting two-factor authentication need a sign-in younger than 5
  minutes**, as the account's own irreversible actions do.
- **The admin routes work on a database role of their own**, `opos_admin`, held by one service of
  the API on its own connection. It bypasses RLS, since no tenant context lists the tenants, and
  holds only the privileges the admin routes use. `opos_app` gains nothing, and `opos_app_global`
  only reads whether a tenant is suspended. An API process without that connection serves no admin
  route.
- **The API never resets the two-factor authentication of an admin**: that stays a script.
- **Every action of an admin leaves an entry in a log** the application can only add to: who, what,
  on which tenant or account, and when, as identifiers, with no email address. The entry commits
  with the action; the reset of two-factor authentication, which acts in Supabase Auth, commits its
  entry first.

## Alternatives

- **A claim in the session's token.** It is written through Supabase's admin API with the secret
  key the API holds, so the running API could make an admin, and a token already issued outlives
  the role taken away.
- **Granting the role in the admin application.** One stolen admin session would make more admins.
- **The panel's session for the admin routes.** A flaw in any screen of the panel or the portal
  would act with an admin's power.
- **Two-factor authentication left to the admin's choice**, as for every other account. A password
  alone would guard every tenant.
- **Any second factor of the account, not the one of the grant.** A script injected into the portal
  during an admin's fresh sign-in could replace the password and the factor there and then sign in
  to the admin application.
- **No new database role**: `opos_app` allowed to insert and delete tenants. Every route of the API
  would hold that power, and one injected query anywhere could delete every tenant.
- **`security definer` functions for the admin's writes.** No runtime role may execute one
  ([ARCHITECTURE.md, Tenant isolation](../ARCHITECTURE.md#tenant-isolation)).
- **A list of allowed network addresses alone.** It guards the door, not a stolen session behind
  it, and the admins work from changing addresses. The edge may still add one when the hosting is
  built ([0012](0012-host-each-environment-on-a-vps-with-compose-and-traefik.md)).
- **The application's logs instead of a log table.** They do not commit with the action, and
  nothing keeps or backs them up yet.

## Consequences

- Not built yet.
- PRODUCT.md 10 changes with the code: two-factor authentication is required of one role, the
  admin.
- An admin signs in with a password, so an account that signs in with Google alone cannot use the
  admin application.
- An admin who replaces their phone, uses a recovery code or has their two-factor authentication
  reset asks a person with access to the server for a new grant.
- The rules of tenant isolation change with the code: a third runtime role, tables beside
  `accounts` outside RLS, an admin route as a new bound of a cross-tenant query, and `tenants` rows
  written by `opos_admin` as well as by the scripts.
- Every admin route is tested against each actor: no session, the origin of another application, an
  account that is no admin, an admin whose second factor is off or newer than the grant, a session
  below `aal2`, and a stale sign-in where a fresh one is needed.
- A flaw in the admin application acts as the signed-in admin while its page is open, but can
  neither change that account's credentials nor grant the role.
- A taken-over API process holds the privileges of `opos_admin` beside the secret key it already
  holds; it can still neither make an admin nor change the log. Taking that role's login away turns
  the admin routes off.
- How long the log is kept is open: log retention is beyond the MVP
  ([PRODUCT.md 11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp)).
