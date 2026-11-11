# 0035. Describe the infrastructure in OpenTofu units run by Terragrunt

- Status: Accepted
- Date: 2026-11-13

## Context

A deployment of Dev ([0033](0033-host-dev-on-the-teams-coolify-server-and-leave-productions-hosting-open.md))
needs DNS records, secrets, what CI reads, a Coolify project, the build cache and the application
stack. Set up by hand in three consoles, none of it can be reviewed, repeated for a second
deployment or rebuilt after a loss. The documents said Dev and production change only through the
deploy workflow; no workflow exists, and a first deployment has to be run and watched by a person.

## Decision

- OpenTofu describes the infrastructure and Terragrunt runs it as units, kept as a catalog in
  `infra/units`, one per module. An environment is one directory under `infra/live`: its
  `env.yaml` holds its plain settings and the names of its secrets, the only place it is
  configured, and its `terragrunt.stack.hcl` makes the units it runs once from the catalog with
  those settings. A deployment of the environment is a stack inside it.
- mise pins OpenTofu and Terragrunt; every provider is pinned to an exact version, with the lock
  file of each module committed. A version younger than 7 days is not taken, as with the dependencies
  ([0015](0015-run-a-pnpm-turborepo-monorepo-with-pinned-tools.md)).
- The state lives in a versioned Object Storage bucket of the environment's Scaleway project.
  OpenTofu itself encrypts the state and every plan, and refuses to run unencrypted: values the
  containers and CI need pass through the state. The key derives from a passphrase in the project's
  Secret Manager, read for the length of a run: whoever can read the secrets can read the state,
  which holds nothing more, and whoever can only read the bucket reads nothing.
- The infrastructure of Dev and production changes only through the `deploy:*` commands, which plan
  and apply the units from an operator's machine, under their own Scaleway identity
  ([0036](0036-keep-every-secret-in-scaleway-secret-manager-and-give-ci-only-the-values-it-uses.md));
  no workflow runs them, and an agent never runs one that applies, destroys or sets a secret. A
  release of a new commit is not such a change
  ([0038](0038-release-dev-from-ci-and-change-its-infrastructure-from-an-operators-machine.md)).
  They are mise tasks without a root script: without mise there is no OpenTofu to run.
- The `.env` files of the applications and `mise.local.toml` still never point at Dev or production.

## Alternatives

- **The consoles, by hand.** Nothing to learn, and nothing to review, repeat or rebuild.
- **A directory per unit in each environment.** Nothing is generated, but every environment
  repeats the file of each unit, and every deployment of Dev would repeat its whole set.
- **OpenTofu alone, with a workspace or a variables file per environment.** One tool less, but the
  backend and the providers are written once per unit and drift, and the order between units is
  kept by hand.
- **Terraform.** The same language, under a licence that restricts its use, and with no encryption
  of the state of its own.
- **The state encrypted only by the bucket.** Simpler, but whoever can read the bucket reads every
  secret in it.
- **A key of Scaleway's Key Manager for the state.** Rotated by Scaleway, but OpenTofu has no key
  provider for it, and the program that would wrap one would be the repository's own cryptography.
- **A workflow that applies the units.** No operator's machine in the path, but CI would hold a key
  that reaches every secret of the project
  ([0038](0038-release-dev-from-ci-and-change-its-infrastructure-from-an-operators-machine.md)).
- **Root scripts for the deploy commands**, as for the other commands
  ([0024](0024-list-the-root-commands-as-mise-tasks-that-run-the-pnpm-scripts.md)). The same name
  in two places, for a command that cannot run without mise.

## Consequences

- Not built yet: the units and the commands.
- An environment's units are generated on every run and never committed; a unit's state is keyed
  by its place in the environment.
- The project, the bucket and the passphrase are made once, by an administrator of the
  organisation, before the first plan: the state of a unit that made them would need them. So is
  the environment's domain, for which no resource exists. The rest is a unit, the operators' group
  and its rights too: a unit only an administrator of the organisation applies, left out of a run
  unless it is named. Who is in the group stays out of the repository.
- Losing the passphrase loses every state. It is protected against deletion, and only an
  administrator changes it, by a new revision with the old one as a fallback.
- The Coolify provider is a community provider below 1.0 with one maintainer: it is pinned, and
  Coolify's own API is the fallback for what it lacks.
- CI installs none of the tools of the deploy commands.
