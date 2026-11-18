# 0038. Release Dev from CI and change its infrastructure from an operator's machine

- Status: Accepted
- Date: 2026-11-13

## Context

Dev is deployed by a push to `develop`
([ARCHITECTURE.md, Environments](../ARCHITECTURE.md#environments);
[0017](0017-integrate-on-develop-and-release-through-main.md)). Two kinds of change reach it. A
release puts a new commit on a deployment: Coolify builds it on the server from the repository,
migrates and starts it
([0033](0033-host-dev-on-the-teams-coolify-server-and-leave-productions-hosting-open.md)). A change
of the infrastructure, such as DNS, secrets, Coolify's configuration or what CI reads, applies the
units ([0035](0035-describe-the-infrastructure-in-opentofu-units-run-by-terragrunt.md)), which needs
the state, its key and every secret of the project. Scaleway gives a workflow no sign-in without a
stored key ([0036](0036-keep-every-secret-in-scaleway-secret-manager-and-give-ci-only-the-values-it-uses.md)),
and a Coolify token that can change a resource can change its compose file, which is as good as
root on the server.

## Decision

- CI releases. On a push to `develop`, once the checks passed, a job asks Coolify to deploy the
  deployment's application and follows the deployment to its end.
- The job holds one Coolify token that can only deploy and read, in Dev's project alone and with an
  expiry, in a GitHub environment that admits `develop` alone. A person issues it and enters it into
  Secret Manager like any value a third party issues; OpenTofu copies it there.
- A release never names a commit: Coolify deploys the head of the branch the application follows.
  A run releases only while its commit is still that head; a newer push releases itself. A rollback
  is a revert on `develop`.
- OpenTofu owns a deployment's configuration and never which commit it runs.
- The infrastructure changes only from an operator's machine, through the `deploy:*` commands; no
  workflow applies a unit.

## Alternatives

- **CI applies the units too.** One path for every change, but GitHub would hold a key that
  reaches every secret of the project, and with it the state's passphrase.
- **Coolify deploys on a push by itself.** Nothing in CI, but it deploys before the checks pass.
- **A token that pins the commit.** The release would deploy exactly the commit checked, but pinning
  needs a token that can change the compose file: as good as root on the server, kept in GitHub.
- **An operator releases by hand.** Nothing stored in GitHub, but Dev lags behind `develop`.
- **A token scoped to the application.** Narrower, but a new token whenever the application is made
  again; Dev's project holds nothing else the token could deploy but the build cache.

## Consequences

- A leaked release token can only deploy again what Dev's project holds, at the heads of the branches
  its resources follow, and change none of them.
- Between a push and its release, a later push may already run on Dev; each release still waits
  for its own checks.
- Production's releases are decided with its hosting.
- The Supabase settings are infrastructure too: an operator applies them, with a token that reaches
  every project of the Supabase organisation and never enters GitHub.
