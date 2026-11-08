# 0014. Back up production beyond Supabase's own backups

- Status: Accepted
- Date: 2026-10-27
- Rationale: reconstructed, to confirm

## Context

Production holds attendees' accounts, orders and the conventions' work. Supabase's Pro plan keeps
daily backups for 7 days, restored from its dashboard, inside the same vendor and account as the
data. A dump of `public` alone leaves accounts nobody can sign in to, so a backup includes Supabase
Auth's schema, with password hashes and the secrets of TOTP factors. Our own copies are kept up to
three months ([PRODUCT.md 10](../PRODUCT.md#10-personal-data-and-privacy)). Dev holds nothing that
cannot be seeded again.

## Decision

- Production only: Supabase's daily backups, and every 6 hours an encrypted `pg_dump` of `public`,
  `auth` and `drizzle`, kept in a repository on the VPS and in one off it, each with its own key,
  for up to three months.
- A monthly restore drill on a throwaway server, never on a developer's machine, ending with
  `pnpm db:verify` and a sign-in with a restored account.
- `pnpm db:roles` follows every restore.

## Alternatives

- **Supabase's backups alone.** Seven days, one vendor, one account: a deletion noticed late, a
  locked account or a lost project takes the backups with it.
- **Backups on the VPS alone.** A lost server takes them along.

## Consequences

- Not built yet: the backup service and its schedule come with the deployment
  ([0012](0012-host-each-environment-on-a-vps-with-compose-and-traefik.md)).
- The dumps hold personal data and secrets, so both repositories are encrypted and their keys are
  production secrets.
- The backup container is one of only two that hold the `postgres` URL.
- A backup nobody restored is not trusted: the monthly drill is the proof that one works.
