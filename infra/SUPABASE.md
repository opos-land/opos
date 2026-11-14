# Supabase

An environment's Supabase project is made by hand. OpenTofu's `supabase` unit then changes what is
inside it: Auth's settings, TLS enforcement and the API's secret key
([0033](../docs/adr/0033-host-dev-on-the-teams-coolify-server-and-leave-productions-hosting-open.md)).
What the Management API's provider cannot reach is set once in the dashboard, below. The steps are
for Dev; another environment follows them with its own names. They are step 6 of
[setting up an environment](README.md#set-up-an-environment).

## The project

1. Make Dev's project, Free, in the EU, and enter the database password it is made with:

   ```sh
   mise run deploy:secret-set dev supabase-db-password
   ```

2. Database, Settings: turn off the automatic RLS of new tables (the migrations set RLS).
3. JWT Keys: make an ES256 signing key the current one, then revoke the legacy secret.
4. API Keys: turn off the legacy keys.
5. Write the project's reference into `supabase.ref` of `live/dev/env.yaml`.

## The access token

The `supabase` unit reaches the Management API with a personal access token, read from Secret
Manager on an operator's machine for the length of a run. Nothing deployed uses it: when it expires,
Dev keeps running, and only the unit's plan and apply fail until a new one is entered.

Under your account, Access Tokens, make a token scoped to Dev's project alone, with an expiry, and
with these permissions and no others:

| Permission                | Access     | For                                                     |
| ------------------------- | ---------- | ------------------------------------------------------- |
| `auth_config`             | read-write | Auth's settings                                         |
| `project_admin`           | write      | Auth's settings: the API asks for it beside the above   |
| `database_ssl_config`     | read-write | TLS enforcement                                         |
| `api_gateway_keys`        | read-write | the API's secret key: make, read, replace and delete it |
| `api_gateway_keys_secret` | read       | the API's secret key: read its value                    |

The names are those of the Management API's reference, which lists the permission each endpoint
needs. Enter the token, and enter a new one the same way before it lapses:

```sh
mise run deploy:secret-set dev supabase-access-token
```

## Google

Google sign-in uses the team's Google Cloud project, which every environment shares. It is set up
by hand: Google has no API that makes an OAuth client for signing in with Google, so no unit
manages it.

1. Once for every environment, in Google Auth Platform:
   - Branding: the app name `OPOS`, a support address and the authorized domain `opos.land`.
   - Audience: External, as anyone with a Google account signs in. While the app is in testing,
     only its listed test users can; publish it before production offers Google sign-in.
   - Data access: no scope beyond `openid`, `email` and `profile`, which need no verification.

2. Clients: make Dev's own client, of the type Web application, named `opos-dev`, with one
   authorized redirect URI, the callback of Dev's Supabase project:
   `https://<supabase.ref>.supabase.co/auth/v1/callback`. Google returns the visitor to Supabase
   Auth, which sends them on to the API's `/auth/google/callback`. The client needs no JavaScript
   origin. Copy its secret as it is made: Google shows it only then.

3. Enter the client:

   ```sh
   mise run deploy:secret-set dev google-client-id
   mise run deploy:secret-set dev google-client-secret
   ```

To replace the secret, add a new one to the client, enter it, apply the `supabase` unit, and only
then disable the old one.

## Changes

- **Auth's settings** go into `supabase/config.toml` and `modules/supabase/auth.json` together,
  which `scripts/supabase-auth.test.mjs` checks, and reach Dev's project with an apply, before the
  release that needs it.
- **The API's secret key** is made by the unit into the secret `supabase-secret-key`: raise
  `supabase.secret_key_version` in `env.yaml` and apply to replace it.
