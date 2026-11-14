# 0039. Verify Postgres TLS against the Supabase CA that Node trusts

- Status: Accepted
- Date: 2026-11-14

## Context

[0013](0013-connect-to-postgres-directly-with-verified-tls.md) has a deployed environment reach its
project's Postgres over the direct connection, with TLS verified against the project's CA, named by
a `DATABASE_CA_PATH` that every client would read. None of it was built. Four clients connect: the
API's pools, the `db:*` scripts, drizzle-kit's migrations and the seed. drizzle-kit takes a URL and
no certificate, and the others would each need the file passed through their own options. The CA is
Supabase's own root, the same for every project, and not in Node's store.

## Decision

- The API, the tools and the backup reach the project's Postgres over its direct connection, not
  through Supavisor.
- Every database URL of a deployed environment asks for `sslmode=verify-full`. The images ship
  Supabase's root CA and name it in `NODE_EXTRA_CA_CERTS`, so Node verifies the server against it in
  every client alike.
- On Dev and production, `env.ts` and the URL of the `db:*` scripts refuse a URL without
  `sslmode=verify-full`, a pooler host or port in any place of a host list, and a missing
  `NODE_EXTRA_CA_CERTS` ([migration-url.ts](../../packages/db/src/migration-url.ts)); a URL whose
  every host is on the loopback interface never leaves the machine and passes. `env.ts`
  also refuses a pool's URL naming a role other than its own runtime role, so the API never holds
  `postgres`; the compose file hands `postgres`'s URL to the tools container alone.

## Alternatives

- **`DATABASE_CA_PATH` read by each client** (0013). The CA would reach Postgres connections alone,
  but each client needs it passed through its own options, and drizzle-kit's URL form has none.
- **Supavisor.** It reaches the project over IPv4, but adds a hop between the API and Postgres, and
  its transaction mode forbids the prepared statements postgres-js uses by default.
- **TLS without verification**, or against the system's store. Encrypted, but open to an impostor
  between the server and the database, and Supabase's CA is not in the store.

## Consequences

- Node trusts Supabase's CA for every TLS connection of the API and the tools, not Postgres alone.
  Supabase already holds the database.
- The certificate expires in April 2031; a new one comes in the images before then.
- The direct connection of a Free project is IPv6: the server's container networks need an IPv6
  route; production on a host without one uses the IPv4 add-on.
- The API's pools, Supabase Auth, the tools and the backup share the direct connection limit of the
  project's compute size.
