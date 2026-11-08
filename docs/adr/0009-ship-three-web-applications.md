# 0009. Ship three web applications: no native app, convention site, scanner app or admin app

- Status: Accepted
- Date: 2026-10-22
- Rationale: reconstructed, to confirm

## Context

The first plans held more applications: a native mobile app, a separate Astro site per convention
for its public programme, and an admin API. Attendees use phones at the venue; organizers work at a
desk; tickets are checked at the gate; the admin creates a few conventions a season. The team is
small, and the MVP has to reach a convention's first edition.

## Decision

- Three applications: the API, the panel for organizers and the portal for attendees.
- **No native app.** The portal is mobile-first and runs in a phone's browser.
- **No convention site in the MVP.** A convention's public page, with its programme, is part of the
  portal at `opos.land/conventions/<convention>`; the CMS with its own website comes after the MVP.
- **No scanner app.** The scanner is the `/scanner` route of the panel, on a phone's camera.
- **No admin app.** The admin creates a tenant, changes its slug and resets two-factor
  authentication with scripts run on the server as `postgres`; there is no endpoint or screen.

## Alternatives

- **A native mobile app.** Store releases, a second UI stack and its own e2e runner, for what a
  mobile-first web page already does.
- **A site per convention from the start.** A second frontend stack and per-tenant hosting before
  the core works; the public programme fits the portal.
- **A scanner app of its own.** Another build and deployment for one screen that needs a camera and
  the panel's session.
- **An admin endpoint or panel.** A route with power over every tenant is the most valuable target
  in the API, for a task done a few times a season.

## Consequences

- One frontend stack and two SPAs to build and test; the portal's design starts at 360 px.
- A convention's public page shares the portal's domain, so no tenant controls content on a
  subdomain, which keeps the session cookies safe
  ([0004](0004-make-the-api-the-only-backend-with-the-session-in-cookies.md)).
- The scanner and the panel share one origin; the scanner's device token stays in
  `Authorization: Bearer`, beside the panel's cookies.
- Admin work needs server access; the platform admin panel is beyond the MVP
  ([PRODUCT.md 11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp)).

## Sources

- The team meeting that dropped the mobile app, applied in commit c8a7e3b.
- PR #1, "architecture decisions — tickets, reviews, likes, programme in portal".
