# 0037. Share a Turborepo remote cache that only `develop` and `main` write

- Status: Accepted
- Date: 2026-11-13

## Context

CI keeps turbo's results in the cache of GitHub Actions, one entry per commit, restored by prefix.
A remote cache shares the results by the hash of each task instead, and the team's Coolify server
can run one ([0033](0033-host-dev-on-the-teams-coolify-server-and-leave-productions-hosting-open.md)).
A shared cache is also a way in: whoever can write to it can hand every later run a forged result.

## Decision

- A Turborepo remote cache runs on the Coolify server as two instances over one volume, one that
  reads and writes and one that only reads, each with its own host and token.
- A run on a push to `develop` or `main` reads and writes. A run on a pull request only reads. A run
  that gets no secret, such as one from a fork or Dependabot, works without the remote cache.
- GitHub enforces the difference, not the workflow's text: the writing token sits in an environment
  that admits a run of the two branches alone, and a pull request's ref is never a branch's
  ([0036](0036-keep-every-secret-in-scaleway-secret-manager-and-give-ci-only-the-values-it-uses.md)).
- Artifacts are signed. The signing key never reaches the server, so the server or its volume alone
  cannot forge one.
- Only CI uses the remote cache. The cache of GitHub Actions stays beside it, and the image builds
  on the server use neither.

## Alternatives

- **The hosted remote cache of turbo's vendor.** Nothing to run, but the build output and an
  account at a third party.
- **One instance and one token.** Half the parts, but any pull request could write.
- **The cache server's own token checks by JWT.** One instance, but it needs a key set to verify
  against, and GitHub's identity token lives for minutes.
- **The cache of GitHub Actions alone.** What CI has: nothing to run, and nothing shared between
  the tasks of different commits beyond a whole restored directory.

## Consequences

- The `check` job runs in one of two GitHub environments, without a deployment record. An outage of
  the cache must not fail it: turbo goes on with the local cache.
- A run on a pull request can read the signing key, to verify, and has nowhere to write.
- A new signing key empties the cache.
- The server does not evict: the volume grows until something prunes it.
- Not built yet.
