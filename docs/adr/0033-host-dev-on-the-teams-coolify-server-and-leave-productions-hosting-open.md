# 0033. Host Dev on the team's Coolify server and leave production's hosting open

- Status: Accepted
- Date: 2026-11-12

## Context

[0012](0012-host-each-environment-on-a-vps-with-compose-and-traefik.md) put each environment on a
VPS of its own, with Docker Compose behind a Traefik the team configures, and turned a platform
down. None of it was built. The team now runs a Coolify server: a self-hosted platform that deploys
compose files behind its own Traefik and issues the certificates, on a machine the team controls.
It gives Dev the parts 0012 chose without the proxy configuration and the deploy mechanics written
by hand. Production will likely run on a managed container platform, but nothing has run anywhere
yet, and choosing its hosting before Dev has taught anything would be a guess.

## Decision

| Part             | Decision                                                                                                                                                                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hosting of Dev   | the team's Coolify server: the containers of a compose file behind Coolify's Traefik, a certificate per host through Let's Encrypt's HTTP challenge; no DNS credential on the server                                                                                                                                                   |
| hosts            | a Dev deployment serves the portal on its own host, `panel.` the panel and `api.` the API under it, nothing else of the product; Dev behind basic auth but for the API; the DNS records point straight at the server, since the API trusts exactly one proxy                                                                           |
| images           | built on the server from the repository at the deployed commit, from a `turbo prune`; only the tools container holds the `postgres` URL; the frontends served with a strict CSP and HSTS                                                                                                                                               |
| Supabase project | no automatic RLS, an ES256 key with the legacy keys revoked, IP address forwarding, a `[remotes.<environment>]` block pushed only by the deployment                                                                                                                                                                                    |
| deploy order     | the Supabase configuration, build, `db:roles`, `db:migrate`, `db:verify`, start; the API starts only after the three database steps passed                                                                                                                                                                                             |
| smoke test       | by hand after a deployment that changes sign-in: what e2e cannot reach, such as real TLS, Google, mail, a phone and the hosted project                                                                                                                                                                                                 |
| production       | its hosting is not decided and gets a record of its own before the first deployment; wherever it runs, it deploys only from `main` behind a reviewer ([0017](0017-integrate-on-develop-and-release-through-main.md)), after a dump ([0014](0014-back-up-production-beyond-supabase.md)), in the EU, and never shares a server with Dev |

## Alternatives

- **A VPS per environment with Compose and Traefik written by hand** (0012). The same parts, but the
  team writes and keeps the proxy configuration, the certificates and the deploy mechanics that
  Coolify already provides on a server the team already runs.
- **A managed container platform for Dev now.** Dev would match what production may become, but it
  decides production's hosting by the back door, and costs per service before anything has run.
- **A wildcard certificate through the DNS challenge** (0012). One certificate, but a DNS credential
  on the server, and a deployment has three hosts.
- **Images built in CI and pushed to a registry.** One build for every environment, but the API's
  address and the CSP are baked into the frontends, so each environment needs its own build anyway,
  and the server would hold a registry credential.

## Consequences

- Not built yet: the Dockerfiles, the compose file and the description of the deployment
  ([0035](0035-describe-the-infrastructure-in-opentofu-units-run-by-terragrunt.md)).
- The team runs the Coolify server: operating system and Coolify updates, disk and monitoring. A
  Coolify API token that can deploy is as good as root on that server.
- The Supabase configuration is pushed before the build, not between `db:verify` and the start as
  in 0012: the build, the database steps and the start are one deployment of one compose file.
- A Free project's direct connection is IPv6
  ([0013](0013-connect-to-postgres-directly-with-verified-tls.md)): the server's container networks
  need an IPv6 route.
- Records 0013 and 0014 say "the VPS": they mean the server an environment runs on.
