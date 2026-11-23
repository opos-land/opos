# 0077. Lock the tools' checksums in mise.lock and install gitleaks through mise

- Status: Accepted
- Date: 2026-11-23

## Context

[0015](0015-run-a-pnpm-turborepo-monorepo-with-pinned-tools.md) has mise pin the tools by version.
A version names a release, not its bytes: mise's aqua backend checks a download against the
checksums file published beside it, and against a signature or provenance where the release carries
one. A replaced release whose checksums file is replaced with it passes that check, and gitleaks
publishes no signature or provenance.

CI installed gitleaks apart from mise: `curl` fetched a release whose sha256 the workflow wrote out.
That check held the bytes, but no developer had the same gitleaks, so a finding was first seen in
the `secrets` job after a push, and the version lived in a second place.

mise writes a lockfile only for the whole configuration: in its default mode an install rebuilds
`mise.lock` from every tool of `mise.toml`, so a lockfile that holds one tool does not stay so.

## Decision

- `mise.toml` pins gitleaks beside the other tools, and CI installs it through mise.
- `mise.lock` is committed and records each tool's download and its sha256 for `linux-x64`,
  `macos-arm64` and `windows-x64`; an install checks the download against it.
- CI installs in mise's locked mode: a download that differs from its checksum, or a tool missing
  from the lockfile, fails the job.

The rules are in [ARCHITECTURE.md, Tooling and versions](../ARCHITECTURE.md#tooling-and-versions).

## Alternatives

- **gitleaks through mise without a lockfile.** The check falls to the checksums file of the
  release itself, weaker than the sha256 the workflow wrote out.
- **Keep the `curl` install and read its version from `mise.toml`.** One version, but every other
  tool stays unchecked beyond its own release, and the checksum lives in the workflow alone.
- **Lock gitleaks alone.** mise rebuilds the lockfile from every tool on the next install.

## Consequences

- A changed pin in `mise.toml` comes with its entries in `mise.lock`, which `mise install` or
  `mise lock` writes; CI refuses a tool the lockfile does not hold.
- A re-uploaded release fails the install until its new checksum is taken into `mise.lock` on
  purpose.
- A contributor on another platform adds it to `lockfile_platforms` and locks it.
- Every developer has the gitleaks of CI.

## Sources

- [0015](0015-run-a-pnpm-turborepo-monorepo-with-pinned-tools.md), which pins the tools by version.
