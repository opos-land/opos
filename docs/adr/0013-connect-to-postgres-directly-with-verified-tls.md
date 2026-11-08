# 0013. Connect to Postgres directly, with TLS verified against the project's CA

- Status: Accepted
- Date: 2026-10-27
- Rationale: reconstructed, to confirm

## Context

A hosted Supabase project offers its Postgres through Supavisor, a connection pooler, and through a
direct connection. Pooling serves many short-lived clients; the API is one long-lived process with
small pools of its own, one per database role, and the tools and the backup connect now and then.
Every connection carries attendees' personal data between the VPS and the project.

## Decision

- The API, the tools and the backup reach the project's Postgres over its direct connection, not
  through Supavisor.
- TLS is verified against the project's CA certificate, shipped in the images and named by
  `DATABASE_CA_PATH`.
- On Dev and production, `env.ts` refuses a pooler host or port, and a missing `DATABASE_CA_PATH`.

## Alternatives

- **Supavisor.** It reaches the project over IPv4 and multiplexes many clients, but adds a hop and
  a component between the API and Postgres, transaction mode forbids the prepared statements
  postgres-js uses by default, and the API's own pools need no multiplexing.
- **TLS without verification**, or against the system's CA store. Encrypted, but open to an
  impostor between the VPS and the database, and the project's certificate is not in Node's store.

## Consequences

- Not built yet: `connectionOptions`, `DATABASE_CA_PATH` and the refusals of `env.ts` come with the
  deployment ([0012](0012-host-each-environment-on-a-vps-with-compose-and-traefik.md)).
- The direct connection is IPv6: the Dev VPS needs an IPv6 route for its containers, since a Free
  project has no IPv4 add-on; a production VPS without one uses the add-on.
- The API's pools, Supabase Auth, the tools and the backup share the direct connection limit of the
  project's compute size.
