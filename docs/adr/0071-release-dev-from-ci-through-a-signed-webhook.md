# 0071. Release Dev from CI through a signed webhook

- Status: Accepted
- Date: 2026-11-21

## Context

[0038](0038-release-dev-from-ci-and-change-its-infrastructure-from-an-operators-machine.md) had CI
release Dev through Coolify's API, with a token that could deploy and read in Dev's project. The
team's Coolify server answers its API only from the addresses its allowlist names. GitHub's hosted
runners come from cloud ranges that are wide and change, so the allowlist leaves them out, and every
release since the first was refused while the job still passed.

Coolify takes a push from GitHub at its manual webhook, outside that allowlist. It matches the
applications that follow the pushed branch of the pushed repository, checks the body's HMAC-SHA256
against each one's own webhook secret, and queues a deployment of the commit the push names on each
application it verified, while that application's auto deploy is on. Its reply names each queued
deployment, or says that no application matched or the signature was wrong, the same for both.

## Decision

- CI releases. On a push to `develop`, once the checks passed, a job sends Coolify a push of its
  commit, signed with the deployment's application's webhook secret, and fails unless Coolify
  queued a deployment.
- OpenTofu generates the secret, sets it on the application and copies it into the GitHub
  environment `dev`, which admits `develop` alone. The application's auto deploy is on, and the
  repository sends Coolify nothing: only a signed push deploys.
- A release names the commit its checks passed. A run releases only while its commit is still the
  head; a newer push releases itself. A rollback is a revert on `develop`.
- OpenTofu owns a deployment's configuration and never which commit it runs.
- The infrastructure changes only from an operator's machine, through the `deploy:*` commands; no
  workflow applies a unit.

## Alternatives

- **The API, with GitHub's runner ranges on the allowlist.** The job of 0038 unchanged, but the
  server's API opened to every machine of those clouds.
- **A private network from the runner.** The job joins a tailnet and calls the API at the server's
  address there, so it can follow the deployment; but a further service and account, and a node on
  the server for them.
- **A poller on the server.** It reads GitHub for a passed run of the head and deploys through the
  API on the server itself: nothing comes in, but one more service to run, a delay, and a token to
  report back to GitHub.
- **Coolify deploys on a push by itself.** Nothing in CI, but it deploys before the checks pass.

## Consequences

- A leaked secret can deploy any commit of the repository's branches on Dev's application, an older
  one among them, and change nothing of it: weaker than 0038's token, which deployed only a head,
  and still far from root on the server.
- The job sees the deployment queued, not how it ends: whether the build, the database steps and
  the start succeed shows in Coolify alone, as nothing outside the allowlist may read the API.
- While an operator runs another ref on Dev (`deploy:apply --ref`), no application follows
  `develop`, and each release fails until an apply without it; a wrong secret fails it alike.
- Between a push and its release, a later push may already run on Dev; each release still waits
  for its own checks.
- Production's releases are decided with its hosting.

## Sources

- Coolify v4.7.6, `app/Http/Controllers/Webhook/Github.php` and its concerns
  `MatchesManualWebhookApplications` and `ReadsWebhookPushPayload`.
