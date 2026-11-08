# 0004. Make the API the only backend, with the session in HttpOnly cookies

- Status: Accepted
- Date: 2026-10-27

## Context

The panel and the portal signed in with `@supabase/auth-js` in the browser, called Supabase Auth
directly and kept the token in `localStorage`, where any script on the page can read it. Every
Supabase address and key a frontend needs ends up in its bundle, and a key in a bundle is a key for
everyone.

## Decision

- The API is the panel's and the portal's only backend (BFF). They load no Supabase SDK and name no
  Supabase address, key or `VITE_*` variable; the only Supabase address a browser sees is the
  redirect of Google sign-in, sent by the API.
- The API calls Supabase Auth with the secret key and keeps the session it issues in `HttpOnly`,
  `SameSite=Strict` cookies on its own host, a pair per application. No response carries a token.
- The boundary is enforced, not just agreed: the `react` ESLint preset and
  `scripts/bff-boundary.mjs` (a Claude Code hook, `pre-commit`, CI over the built bundles) refuse a
  breach, and every e2e scenario checks that no request leaves the API and the page's own origin.

The rules are in [ARCHITECTURE.md, Applications and packages](../ARCHITECTURE.md#applications-and-packages)
and [Sessions and sign-in](../ARCHITECTURE.md#sessions-and-sign-in).

## Alternatives

- **The Supabase SDK in the browser** (the state before). Less API code, but a token readable by
  any script, and Supabase keys and addresses in the bundles.
- **Tokens in the browser, sent to the API as `Authorization: Bearer`** (how the API read them
  before). One backend, but the token is still readable by any script on the page.

## Consequences

- Nothing in the browser can read a token; with `SameSite=Strict`, an `Origin` check and JSON-only
  bodies are the CSRF protection.
- Supabase is an implementation detail of the API: the API can change server or sign-in provider
  without the frontends noticing.
- The API implements every sign-in flow: sign-up, confirmation, password, Google with PKCE, refresh,
  two-factor authentication.
- The cookies are safe only while no subdomain serves content a tenant controls; the feature that
  first does moves them to `__Host-` names.
- The scanner, with no account signed in, keeps a device token in `Authorization: Bearer`.

## Sources

- PR #40, "host supabase on supabase.com behind the api as the only bff".
- PR #52, "move sign-in behind the API, add two-factor auth".
