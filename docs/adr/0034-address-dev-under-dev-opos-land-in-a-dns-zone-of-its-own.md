# 0034. Address Dev under `dev.opos.land`, in a DNS zone of its own

- Status: Accepted
- Date: 2026-11-13

## Context

[0012](0012-host-each-environment-on-a-vps-with-compose-and-traefik.md) gave Dev a registrable
domain of its own, so that a DNS credential able to change Dev's records could never change
production's. What that rule protects is the reach of the credential, not the name: a second domain
is one more registration to pay, renew and keep, and a zone delegated from `opos.land` separates
the credentials the same way. The DNS host of `opos.land` offers a subdomain as a zone of its own
only on its highest plan, and its API tokens reach a whole zone, never a part of one.

## Decision

- `dev.opos.land` is a DNS zone of its own at Scaleway: Dev's Scaleway project
  ([0036](0036-keep-every-secret-in-scaleway-secret-manager-and-give-ci-only-the-values-it-uses.md))
  holds `dev.opos.land` itself as an external domain and serves its zone. `NS` records in the
  `opos.land` zone delegate `dev`, and a `TXT` record there proves the domain to Scaleway; they are
  set once, by hand, and nothing automated holds a credential for the `opos.land` zone.
- Dev's deployment lives at `dev.opos.land` itself: the portal there, the panel at
  `panel.dev.opos.land`, the API at `api.dev.opos.land`, the admin application at
  `admin.dev.opos.land`. What Dev runs beside it, such as the build cache, has a host of its own
  directly under `dev.opos.land`.
- The records are address records pointing at the server, described with the rest of the
  infrastructure
  ([0035](0035-describe-the-infrastructure-in-opentofu-units-run-by-terragrunt.md)).
- `dev` is a word the platform uses itself: no tenant gets it as an address
  ([PRODUCT.md, Addresses and domains](../PRODUCT.md#6-addresses-and-domains)).

## Alternatives

- **A registrable domain of its own** (0012). The same separation of credentials, at the price of a
  second domain. It also keeps Dev a different site from production, which this decision gives up.
- **Records in the `opos.land` zone.** No delegation, but the token that changes Dev's records can
  change production's.
- **A subdomain zone at the DNS host of `opos.land`.** One provider, but only on its enterprise
  plan.
- **`opos.land` as the external domain, with `dev` a zone under it.** The same zone, but Scaleway
  removes an external domain that does not point at its name servers, and `opos.land` never will.
- **The zone at Google Cloud DNS.** The same delegation, from a provider the platform would use for
  nothing else.

## Consequences

- Dev is the same site as production. `SameSite=Strict` no longer keeps a request that starts on a
  Dev page away from production's API; the `Origin` check and CORS still refuse it. A Dev host can
  also set a cookie for `opos.land`, which production's API would receive: the session cookies move
  to `__Host-` names before production is deployed
  ([ARCHITECTURE.md, Sessions and sign-in](../ARCHITECTURE.md#sessions-and-sign-in)).
- Not built yet: `dev` among the reserved tenant slugs.
- Dev's DNS depends on Dev's Scaleway project. Scaleway's rights over DNS reach every zone of a
  project, so Dev's project never holds a zone of production.
- Scaleway removes an external domain that stops pointing at its name servers for 14 days, and its
  zone with it: the `NS` records of `dev` in the `opos.land` zone keep Dev's addresses alive.
