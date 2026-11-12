# 0029. Ship four web applications: an admin application, and no native app, convention site or scanner app

- Status: Proposed
- Date: 2026-11-12

## Context

[0009](0009-ship-three-web-applications.md) kept the product to three applications, the API, the
panel and the portal, and gave the admin scripts run on the server as `postgres` instead of an
application: a route with power over every tenant is the most valuable target in the API, and the
admin created a few conventions a season.

That no longer holds for the admin:

- About three people hold the role, and not each of them is to have access to the server and the
  `postgres` connection the scripts need.
- The scripts take their arguments by hand, on production, and show nothing: no list of the tenants
  and no state of one.
- More conventions are expected than the few a season 0009 counted on.
- The admin is to do more than the scripts do: suspend a tenant and delete one.

The other three decisions of 0009 stand, for the reasons it gave, now confirmed:
attendees use phones at the venue, organizers work at a desk, tickets are checked at the gate, the
team is small and the MVP has to reach a convention's first edition.

## Decision

- Four applications: the API, the panel for organizers, the portal for attendees and the admin
  application for the admins.
- **The admin application** is `apps/admin`, at `admin.opos.land`, and part of the MVP. In it an
  admin lists the tenants, creates a tenant with its first head, changes a tenant's address,
  suspends, restores and deletes a tenant, resets an account's two-factor authentication and reads
  the log of the admins' actions.
- **The scripts stay**: they are the way to work when the admin application cannot be used, and the
  only way to grant the admin role or take it away
  ([0030](0030-guard-admin-access-with-its-own-role-application-and-second-factor.md)).
- **No native app.** The portal is mobile-first and runs in a phone's browser.
- **No convention site in the MVP.** A convention's public page, with its programme, is part of the
  portal at `opos.land/conventions/<convention>`; the CMS with its own website comes after the MVP.
- **No scanner app.** The scanner is the `/scanner` route of the panel, on a phone's camera.

## Alternatives

- **The scripts alone**, as 0009 decided. Every admin needs the server, a mistyped argument acts on
  production, and suspending and deleting a tenant would add more of them.
- **An admin area inside the panel.** The routes with power over every tenant would share an origin,
  a session and a bundle with every organizer's work, so a flaw in any screen of the panel would
  reach them.
- **The database's own dashboard.** It passes by the invariants and the checks the API makes, leaves
  no log of who did what, and needs the access the scripts need.
- **A native mobile app.** Store releases, a second UI stack and its own e2e runner, for what a
  mobile-first web page already does.
- **A site per convention from the start.** A second frontend stack and per-tenant hosting before
  the core works; the public programme fits the portal.
- **A scanner app of its own.** Another build and deployment for one screen that needs a camera and
  the panel's session.

## Consequences

- The admin application is not built yet; until it is, the admin works through the scripts.
- A route with power over every tenant exists, which 0009 avoided; how it is guarded is a decision
  of its own
  ([0030](0030-guard-admin-access-with-its-own-role-application-and-second-factor.md)).
- One frontend stack and three SPAs to build and test; the portal's design starts at 360 px. The
  admin application holds its own `shared/`, as the other two do
  ([0020](0020-build-the-frontends-from-shadcn-ui-with-its-default-look.md)), keeps the rules the
  frontends share ([0022](0022-tell-the-outcome-of-every-write-in-a-notification.md),
  [0023](0023-ask-in-a-modal-before-an-action-that-cannot-be-undone.md),
  [0025](0025-keep-the-theme-on-the-account-and-a-visitors-in-the-browser.md)) and, like the panel,
  runs no tracker ([0026](0026-run-a-tracker-only-with-consent-and-none-in-the-panel.md)).
- Whatever names the applications names three of them: the commit scopes, the areas of the
  tests-first rule, the BFF boundary, the shadcn/ui skill and the e2e runner.
- `admin.` joins the hosts of
  [0012](0012-host-each-environment-on-a-vps-with-compose-and-traefik.md); whether the edge limits
  who reaches it is decided with the hosting.
- A convention's public page shares the portal's domain, so no tenant controls content on a
  subdomain, which keeps the session cookies safe
  ([0004](0004-make-the-api-the-only-backend-with-the-session-in-cookies.md)).
- The scanner and the panel share one origin; the scanner's device token stays in
  `Authorization: Bearer`, beside the panel's cookies.

## Sources

- [0009](0009-ship-three-web-applications.md), which this record supersedes.
