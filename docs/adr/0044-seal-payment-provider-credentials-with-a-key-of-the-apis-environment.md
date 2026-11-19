# 0044. Seal payment provider credentials with a key of the API's environment

- Status: Proposed
- Date: 2026-11-19

## Context

A convention is paid into its own payment provider account
([0010](0010-send-ticket-payments-to-the-conventions-own-account.md)), so OPOS stores each
convention's credentials for its provider and uses them to start and confirm payments.
[PRODUCT.md 7](../PRODUCT.md#7-modules) asks that they be stored encrypted and never shown again;
it does not say with what.

Whoever reads the database, or a backup of it, must not read the credentials: with them, payments
of a convention can be started and confirmed in its name. The API has to open them on every
payment, with no person present.

## Decision

- The API seals a convention's credentials before it stores them and opens them only to call the
  provider. Sealing is AES-256-GCM with a random nonce a value, under a key derived by HKDF-SHA256
  from one secret of the API's environment, `PAYMENT_CREDENTIALS_KEY`.
- The secret is validated when the API starts, differs from every other secret of the
  environment, and is given to the API's container alone. No runtime database role and no other
  application holds it.
- A value is sealed for the tenant and the provider it belongs to, which are authenticated with
  it and stored nowhere else: copied into the row of another convention, it opens nothing.
- A sealed value names its format, so that a later key or cipher can be told from the first.
- The database and its backups hold sealed values only. No route answers the credentials, sealed
  or open, and no log line holds them open: a provider's module that fails is logged by the name
  of its error alone.
- The seed seals the demo convention's credentials with the same secret, on `local` and `dev`,
  where the fake provider takes no money.

The functions are in [sealed.ts](../../packages/db/src/sealed.ts), the rules of the feature in the
[spec](../specs/0002-shop-setup.md).

## Alternatives

- **Supabase Vault or pgsodium**, with the key in the database's own keeping. A backup of the
  project, or a role that reads the vault, opens the credentials: the key and the values would
  lie in one place.
- **One secret a convention in the cloud's Secret Manager.** The provider's credentials would be
  outside the database altogether, but every convention that connects an account would need a
  secret created at run time, by an API holding the right to create and read secrets, on a second
  cloud in production's case. The local stack and CI have no such service.
- **A key a convention, wrapped by the environment's key.** It narrows what one leaked data key
  opens, and adds a table of keys and their rotation before any convention sells. The format
  mark leaves the way to it open.
- **Storing the credentials as they are, behind RLS.** RLS keeps conventions apart; it does not
  keep the credentials from a backup, a dump or the migration role.

## Consequences

- Losing the secret loses every stored account: each convention connects its account again. The
  secret is backed up with the environment's other secrets, not with the database. Until then the
  convention's settings show such an account as not ready; a route of an edition, which reads no
  credentials, still counts it as it was stored.
- Replacing the secret has the same effect today. Rotation without reconnecting, which opens with
  the old key and seals with the new, is not built; the format mark is there for it.
- A person with the environment's secrets and the database reads the credentials. That is the
  operators, as with every other secret of the deployment
  ([0036](0036-keep-every-secret-in-scaleway-secret-manager-and-give-ci-only-the-values-it-uses.md)).
- The call that checks credentials with a provider runs before the transaction that stores them,
  so a route that connects an account asks outside first and writes afterwards
  ([ARCHITECTURE.md, API conventions](../ARCHITECTURE.md#api-conventions)).

## Sources

- [The shop's setup](../specs/0002-shop-setup.md), rule P2.
