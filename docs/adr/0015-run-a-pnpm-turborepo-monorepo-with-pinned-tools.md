# 0015. Run a pnpm and turborepo monorepo with pinned tools and aged dependencies

- Status: Accepted
- Date: 2026-10-22
- Rationale: reconstructed, to confirm

## Context

Three applications and the packages they share — the contract, the database, localization, the
lint and TypeScript configuration — change together: a route touches the contract, the API and a
frontend in one commit. Every developer and CI must run the same Node, pnpm and Supabase CLI.
Packages published to npm are sometimes compromised and pulled within days.

## Decision

- One repository with pnpm workspaces and a `catalog:` for versions shared by several packages.
- The shared packages have no build step: the applications consume their TypeScript source; only
  the translation catalogs compile.
- turborepo runs the tasks and declares only what a rule needs: what must run before what, what is
  never cached, what stays out of the hash.
- mise pins Node and the Supabase CLI; `packageManager` pins pnpm through corepack; `engines`
  repeats both, and a mismatch aborts the install.
- `minimumReleaseAge` refuses a version younger than 7 days; an urgent fix is a deliberate
  exclusion, a transitive one a scoped `overrides` entry naming its advisory.

The rules are in [ARCHITECTURE.md, Tooling and versions](../ARCHITECTURE.md#tooling-and-versions).

## Alternatives

- **A repository per application.** The contract would be published and versioned, and a change
  across the API and a frontend would span several PRs.
- **Built packages.** A build before every consumer runs, and stale output to chase; the frontends'
  bundlers and the API's bundler read TypeScript anyway.
- **nvm and a loose pnpm.** Versions drift between machines and CI.
- **Taking every release at once.** A compromised version reaches the lockfile before it is pulled.

## Consequences

- A change of the contract and its consumers is one atomic commit, and the typecheck sees both
  sides.
- turborepo with `--affected` keeps CI to what a PR touches.
- A fix released today waits a week unless it is excluded on purpose; a rejection by
  `minimumReleaseAge` is policy, not a failure.

## Sources

- PR #2, "manage tool versions with mise", and PR #3, "add turborepo".
