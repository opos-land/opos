# 0012. Host each environment on a VPS with Docker Compose behind Traefik

- Status: Accepted
- Date: 2026-10-27
- Rationale: reconstructed, to confirm

## Context

The database and sign-in run on hosted Supabase
([0003](0003-use-hosted-supabase-for-postgres-and-auth-only.md)); the API and the two SPAs need a
home of their own, in Dev and in production. The platform is free and run by a small team, so the
running cost and the number of moving parts matter more than elastic scale. Each frontend bakes the
API's address and its CSP in at build time. Dev must never be able to touch production's DNS
records or data.

## Decision

| Part             | Decision                                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hosting          | a VPS per environment, Docker Compose behind Traefik v3 with wildcard TLS through DNS-01; the apex serves the portal, `panel.` the panel, `api.` the API, nothing else; Dev behind basic auth but for the API |
| Dev domain       | a registrable domain of its own, never under `opos.land`, with its own DNS zone and token                                                                                                                     |
| images           | built on their VPS from a `turbo prune`, with exact tags; only the tools and backup containers hold the `postgres` URL; the frontends served with a strict CSP and HSTS                                       |
| Supabase project | no automatic RLS, an ES256 key with the legacy keys revoked, IP address forwarding, a `[remotes.<environment>]` block pushed only by the deploy workflow                                                      |
| deploy workflow  | after `check`, `e2e` and `secrets`, production behind a reviewer: build, a dump first in production, `db:roles`, `db:migrate`, `db:verify`, the Supabase configuration, start                                 |
| smoke test       | by hand after a deployment that changes sign-in: what e2e cannot reach, such as real TLS, Google, mail, a phone and the hosted project                                                                        |

## Alternatives

- **A platform as a service** for the API and the SPAs. Less to run, but a cost per service and per
  environment, and less control over the headers, the routing and where the containers run.
- **Images built in CI and pushed to a registry.** One build for every environment, but the API's
  address and the CSP are baked into the frontends, so each environment needs its own build anyway.
- **Dev under a subdomain of `opos.land`.** One zone, but a DNS token that can touch Dev can touch
  production.

## Consequences

- Not built yet: the Dockerfiles, the compose file, Traefik's configuration, the deploy workflow and
  both VPS are still to come; a spec covers them when the work starts.
- The team runs the VPS: operating system updates, disk and monitoring.
- Production deploys only from `main`, behind a reviewer and the CI gates
  ([0017](0017-integrate-on-develop-and-release-through-main.md)).
- The database connection and the backups are decided in
  [0013](0013-connect-to-postgres-directly-with-verified-tls.md) and
  [0014](0014-back-up-production-beyond-supabase.md).

## Sources

- PR #40, "host supabase on supabase.com behind the api as the only bff".
- The table "Still to be built" of ARCHITECTURE.md, which this record replaces.
