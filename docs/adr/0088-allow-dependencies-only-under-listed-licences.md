# 0088. Allow dependencies only under listed licences

- Status: Accepted
- Date: 2026-11-24

## Context

[0016](0016-license-the-code-as-polyform-internal-use.md) licenses the code under PolyForm
Internal Use 1.0.0. That holds only while no dependency asks for more: a package under a strong
copyleft licence (GPL, LGPL, AGPL) bundled into a frontend or run by the API could require OPOS to
publish its code under that licence, and a licence that forbids commercial use or a hosted service
(such as CC-BY-NC, SSPL or BUSL) could forbid running the platform at all. On the day of this record
every installed package, development ones included, came under a permissive licence, MPL-2.0, OFL-1.1
or CC-BY-4.0, but nothing kept it so: a dependency, or a transitive one, entered through any
lockfile change unread.

## Decision

- Every installed dependency, development ones too, comes under a licence of `ALLOWED` in
  [scripts/deps-licenses.mjs](../../scripts/deps-licenses.mjs): permissive licences, CC-BY-4.0 for
  data, OFL-1.1 for fonts and MPL-2.0, whose copyleft covers only the package's own files, which
  OPOS does not modify.
- `pnpm deps:licenses` reads the licences through `pnpm licenses list` and judges each SPDX
  expression: a choice when one side is allowed, a conjunction when every side is, a licence with an
  exception as the licence itself. A package with no licence, or one that does not parse, fails.
- The check runs in the `check` job of CI and in lefthook `pre-commit` when `pnpm-lock.yaml` is
  staged.
- A licence enters the list only through a decision record that says why it lets OPOS keep its own
  licence.

The rule is in [ARCHITECTURE.md, Tooling and versions](../ARCHITECTURE.md#tooling-and-versions).

## Alternatives

- **A list of refused licences.** It passes any licence nobody thought of, and a misspelt or
  missing `license` field with it.
- **Checking the production dependencies only.** A development tool never reaches a user, but a
  package moves between the two lists in one line of a manifest, and one rule is simpler to keep.
- **An external service or GitHub's dependency review.** A further provider and a setting outside
  the repository, while `pnpm licenses list` already holds the data.
- **No check.** What ran before, with the licence read only when someone thought to.

## Consequences

- A dependency under a licence outside the list fails CI until the dependency is replaced or a
  decision record adds its licence.
- The check trusts the `license` field of each package's manifest; a package that misstates its
  licence passes or fails by what it states.
- The notices that MIT, BSD, ISC and Apache-2.0 ask to keep with a copy of the code are a separate
  matter: the frontends' bundles carry those libraries to the browser, and this check does not
  cover them.

## Sources

- [0016](0016-license-the-code-as-polyform-internal-use.md), the licence of the code.
- [pnpm licenses](https://pnpm.io/cli/licenses).
- [SPDX license expressions](https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/).
