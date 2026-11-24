# 0087. Propose version updates through Dependabot after the release age

- Status: Accepted
- Date: 2026-11-24

## Context

[0015](0015-run-a-pnpm-turborepo-monorepo-with-pinned-tools.md) pins every dependency and tool, and
`minimumReleaseAge` refuses a version younger than 7 days. The workflows pin each action by a
commit hash, the images carry a digest, and every OpenTofu provider is pinned to an exact version
with its lock file. A pin keeps a version still until someone moves it, and nothing proposed a move:
a fix released upstream reached the repository only when someone noticed it, and `pnpm audit` in
the `secrets` job reports only advisories already published.

The repository is on GitHub, whose Dependabot reads the npm, GitHub Actions, Docker Compose and
OpenTofu manifests, updates a hash or a digest together with the tag beside it, and opens a pull
request with no service or token to add. It does not read `minimumReleaseAge`: its own `cooldown`
does that job for the versions it proposes. A group that takes every dependency opens its pull
request once one member is past its cooldown, carrying along members that are not.

## Decision

- [.github/dependabot.yml](../../.github/dependabot.yml) proposes version updates of the npm
  dependencies, the actions, the images of the compose files and the OpenTofu providers, once a
  week, as pull requests to `develop`.
- Every ecosystem's `cooldown` equals `minimumReleaseAge`, so Dependabot proposes no version pnpm
  would refuse.
- Groups gather only packages released together or which require each other at one version; no
  group takes every dependency.
- A commit message takes a type and a scope `commitlint.config.mjs` accepts.
- `scripts/dependabot.test.mjs` keeps the four rules above.

The rules are in [ARCHITECTURE.md, Tooling and versions](../ARCHITECTURE.md#tooling-and-versions).

## Alternatives

- **Renovate.** It reads `mise.toml` and the `ARG` of a Dockerfile, which Dependabot does not, but it
  is a GitHub App to install and configure outside the repository, and a further provider.
- **Moving the pins by hand.** What runs today, and nothing tells when a pin falls behind.
- **One group for every dependency.** One pull request a week, but the cooldown stops holding for
  the members of the group.

## Consequences

- An update enters like any other change: a pull request to `develop` with CI. CI runs
  `pnpm install --frozen-lockfile` under `minimumReleaseAge`, so a lockfile that resolves a
  transitive dependency younger than 7 days fails until that version ages; the pull request is then
  rebased with `@dependabot rebase`, never passed by `minimumReleaseAgeExclude`.
- CI holds no OpenTofu: a provider update is checked with `mise run infra:check` before it is
  merged, and its lock files are rewritten with `pnpm infra:lock` when they lack a platform.
- The tools of `mise.toml`, Node with them, and the base images of `infra/docker/Dockerfile`, named
  through an `ARG`, stay outside Dependabot's sight and are moved by hand.
- Security updates are a setting of the repository, off today; the cooldown does not hold for
  them, and they target the default branch, `develop`.

## Sources

- [0015](0015-run-a-pnpm-turborepo-monorepo-with-pinned-tools.md), which pins the dependencies and
  sets the release age.
- [0017](0017-integrate-on-develop-and-release-through-main.md), which sends every change through
  `develop`.
