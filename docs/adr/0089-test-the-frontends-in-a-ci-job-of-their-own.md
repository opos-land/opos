# 0089. Test the frontends in a CI job of their own

- Status: Accepted
- Date: 2026-11-24

## Context

The `check` job of CI hosts the local stack (Postgres, Supabase Auth, the bucket and imgproxy) and
runs every package's tests in one turbo step. On a standard GitHub runner of four cores, a pull
request that touched every application spent about seven and a half of `check`'s eleven minutes in
that step. The API tests set its length: they run against the stack, with deadlines that count on
the runner's cores, and up to three workers of their own.

The tests of the panel, the portal and the admin application run in jsdom and need no stack, yet
they ran in the same step, beside the API tests, and took the same cores: about ten minutes of
worker time between them, most of it in setting up jsdom and importing modules.

The ruleset of `main` requires `check`, `e2e` and `secrets`
([0017](0017-integrate-on-develop-and-release-through-main.md)), and `release` on a push to
`develop` waits on the jobs of CI ([0075](0075-release-dev-from-ci-through-a-signed-webhook.md)).

## Decision

A `frontend` job runs the tests of `@opos/admin`, `@opos/panel` and `@opos/portal` on a runner of
its own, without the stack, with the same remote cache and the same `--affected` on a pull request
as `check`. The test step of `check` leaves those three out. The type check and the lint of every
package stay in `check`.

The ruleset of `main` requires `frontend` too, and `release` and `release-dev` wait on it.

The rule is in [ARCHITECTURE.md, CI](../ARCHITECTURE.md#ci).

## Alternatives

- **A larger runner.** GitHub bills runners beyond the standard one even on a public repository,
  and the frontends would still take cores the API tests count on.
- **More API test workers.** Each worker runs a whole API with pools of its own against the local
  database's connections, and more workers on the same four cores would take them from the stack.
- **Leaving `frontend` out of the ruleset.** A pull request into `main` could then merge with a
  failing frontend test.
- **One job per frontend.** Three more runners each installing the dependencies, for tests that
  take two to five minutes of a runner together.

## Consequences

- `check` gives the stack and the API tests the runner's cores; the frontends' tests run beside it.
- A new frontend application is tested in `check` until it joins the filters of both jobs;
  `scripts/ci-shape.test.mjs` holds the filters equal to the applications under `apps/` other than
  the API.
- The ruleset in `.github/rulesets/protect-main.json` takes effect once an operator applies it to the
  repository in GitHub.
