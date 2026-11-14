# Infrastructure

The deployed environments, described in OpenTofu units that Terragrunt runs. The rules are in
[ARCHITECTURE.md](../docs/ARCHITECTURE.md#environments); the reasons in the records it links.
`live/dev` is the Dev environment.

| Path                                      | Holds                                                                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE.md`                             | setting up a Supabase project by hand, and its access token                                                                                    |
| `COOLIFY.md`                              | setting up a project on the Coolify server, its tokens and Docker's IPv6                                                                       |
| `root.hcl`                                | what every unit shares: the state, its encryption, the Scaleway provider                                                                       |
| `coolify.hcl`                             | the Coolify provider, for the units that change Coolify                                                                                        |
| `supabase.hcl`                            | the Supabase provider, for the units that change what is inside a Supabase project                                                             |
| `modules/`                                | the OpenTofu modules, each with its committed provider lock file                                                                               |
| `units/`                                  | the catalog: one unit per module, configured by the values a stack hands it                                                                    |
| `live/<environment>/env.yaml`             | the one place an environment is configured: plain settings and the names of its secrets                                                        |
| `live/<environment>/terragrunt.stack.hcl` | the environment's units, generated into `.terragrunt-stack` on every run                                                                       |
| `*.sh`                                    | the scripts the deploy tasks run                                                                                                               |
| `docker/`                                 | the images and the compose file of a deployment: the API, the database tools, and the panel, the portal and the admin application behind Caddy |

## Commands

mise installs every tool they need. Read the plan before every apply. An agent never runs a
command that changes anything: bootstrap, grant, revoke, apply, secret-set or destroy.

| Command                                                 | Does                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **On your machine, without signing in**                 |                                                                                                                                                                                                                                                                           |
| `mise run deploy:check`                                 | checks the format and validates every unit                                                                                                                                                                                                                                |
| `mise run deploy:images`                                | builds the images as the server does and tries the API and the frontends; CI's `images` job runs it on every run                                                                                                                                                          |
| `mise run deploy:lock`                                  | rewrites the modules' provider lock files after a provider's version changed                                                                                                                                                                                              |
| **Signed in**                                           |                                                                                                                                                                                                                                                                           |
| `mise run deploy:login <environment>`                   | signs you in to Scaleway and GitHub, unless you are; the key lasts 12 hours                                                                                                                                                                                               |
| `mise run deploy:plan <environment> [unit]`             | shows what an apply would change; `--save` plans as an apply does and keeps the plans                                                                                                                                                                                     |
| `mise run deploy:apply <environment> [unit]`            | plans, asks once and applies those plans; `--saved` applies the plans `deploy:plan --save` kept; `--no-plan` asks once and applies with no plan shown; `--ref <ref>` deploys that branch or tag instead of env.yaml's, and CI releases nothing, until an apply without it |
| `mise run deploy:output <environment> [unit]`           | prints the units' outputs                                                                                                                                                                                                                                                 |
| `mise run deploy:secret-set <environment> <name>`       | reads a secret's value without echo and stores it                                                                                                                                                                                                                         |
| `mise run deploy:destroy <environment> <unit>`          | destroys one unit, after showing its plan and asking                                                                                                                                                                                                                      |
| **As an administrator of the Scaleway organisation**    |                                                                                                                                                                                                                                                                           |
| `mise run deploy:bootstrap <environment>`               | makes the state's bucket and passphrase and registers the domain                                                                                                                                                                                                          |
| `mise run deploy:apply <environment> shared`            | makes the group of the people who run the commands, with its rights                                                                                                                                                                                                       |
| `mise run deploy:grant <environment> <email>...`        | puts people into that group                                                                                                                                                                                                                                               |
| `mise run deploy:grant:revoke <environment> <email>...` | takes people out of it                                                                                                                                                                                                                                                    |

Without a unit, plan and apply run every unit but `shared`, which needs the organisation's
administrator rights.

## Set up an environment

The steps for Dev; another environment follows them with its own names.

1. Create the Scaleway project `opos-land-dev` and invite the people who will run the commands to
   the organisation. Write the project's name, id and region into the `scaleway` block of
   `live/dev/env.yaml`.

2. Make the state's bucket and passphrase and register the domain:

   ```sh
   mise run deploy:bootstrap dev
   ```

   It prints the TXT record of the next step; run it again to print the record again.

3. In the `opos.land` zone at Cloudflare, add the TXT record within 48 hours of the first bootstrap:

   ```text
   _scaleway-challenge.dev  TXT  <the token the bootstrap printed>
   ```

   Once Scaleway has validated the domain, and within 14 days of the first bootstrap, add the
   delegation, DNS only, and remove the TXT record. Never before the validation: the delegation
   hides the TXT record.

   ```text
   dev  NS  ns0.dom.scw.cloud
   dev  NS  ns1.dom.scw.cloud
   ```

   Check that `dig +short NS dev.opos.land` prints those two. `opos.land` has no `CAA` record, so
   Let's Encrypt may issue its certificates. If one is ever added, add this one beside it:

   ```text
   opos.land  CAA  0 issue "letsencrypt.org"
   ```

4. Make the group of the people who run the commands and put them into it:

   ```sh
   mise run deploy:login dev
   mise run deploy:plan dev shared
   mise run deploy:apply dev shared
   mise run deploy:grant dev <email>...
   ```

   Run the grant again to add someone, and `mise run deploy:grant:revoke dev <email>...` to take
   someone out.

   The shared unit also makes the key the API sends mail with, straight into the secret
   `smtp-password`.

5. Make the secrets. The entered ones stay without a value until they are entered below.

   ```sh
   mise run deploy:apply dev secrets
   ```

6. Set up Dev's Supabase project: [SUPABASE.md](SUPABASE.md).

7. Set up Dev's project on the Coolify server: [COOLIFY.md](COOLIFY.md).

8. Apply the rest. The `github` unit needs your GitHub account to administer the repository. The
   `mail` unit waits until Scaleway has validated the domain's records, up to an hour.

   An apply plans the units, asks once and applies exactly those plans. A plan for an apply takes
   no mocked outputs, so a unit plans only once the units it reads are applied. The first time,
   apply with no plan shown: one answer, then each unit plans and applies after the units it reads.
   The owner of the Coolify server runs it, with their own token
   ([COOLIFY.md](COOLIFY.md#the-tokens)): Coolify lets nobody else create its services.

   ```sh
   COOLIFY_TOKEN=<the owner's token> mise run deploy:apply dev --no-plan
   ```

   The `deployment` unit stops if an administrator has not applied `shared` since step 4, which
   writes `smtp-password`. From then on one `mise run deploy:apply dev` applies every unit.
   `deploy:plan` alone mocks what is not applied yet, to preview the whole stack.

   The `deployment` unit deploys once and waits for it: Coolify reads the compose file, the tools
   run the database steps, the API starts. Coolify takes the hosts of the services only after that
   first deployment, so set `deployment.compose_loaded` in `live/dev/env.yaml` to `true` and apply
   again. The hosts' certificates follow on their own once their records resolve.

9. Check the remote cache and the deployment, below.

## The remote cache

The `cache` and `github` units run CI's Turborepo cache and give CI its tokens
([0037](../docs/adr/0037-share-a-turborepo-remote-cache-that-only-develop-and-main-write.md)).
Until they are applied, CI runs without it.

| Check                                                                                          | Expect                                                |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| the cache's service in Coolify, after the first apply                                          | running                                               |
| a `PUT` to `https://cache-ro.dev.opos.land/v8/artifacts/<id>?slug=opos` with the reading token | `403`                                                 |
| the `check` job of a push to `develop`                                                         | "Remote caching enabled", and artifacts on the volume |
| the `check` job of a pull request after it                                                     | cache hits it did not compute itself                  |
| the `check` job of a pull request from a fork                                                  | green, without the remote cache                       |

- To empty the cache, delete the contents of the `artifacts` directory on the service's volume.
  The server never evicts on its own.
- To invalidate everything in it, raise the number of `turbo-signature-key` in `env.yaml` and apply.

## The deployment

The `deployment` unit runs [docker/compose.yaml](docker/compose.yaml) as one application in
Coolify, built on the server from the head of `develop`
([0033](../docs/adr/0033-host-dev-on-the-teams-coolify-server-and-leave-productions-hosting-open.md)).

| Service | Address                       |
| ------- | ----------------------------- |
| portal  | `https://dev.opos.land`       |
| panel   | `https://panel.dev.opos.land` |
| api     | `https://api.dev.opos.land`   |
| admin   | `https://admin.dev.opos.land` |

- **Basic auth.** Every service but the API asks for the user `opos` and the value of the secret
  `basic-auth-password`:
  `scw secret version access-by-path secret-path=/ secret-name=basic-auth-password revision=latest_enabled`,
  under `infra/run.sh dev`. Rotate it by raising its number in `env.yaml` and applying.
- **A release.** Once the checks of a push to `develop` passed, the `release` job of CI asks Coolify
  to deploy and follows it
  ([0038](../docs/adr/0038-release-dev-from-ci-and-change-its-infrastructure-from-an-operators-machine.md)).
  A rollback is a revert on `develop`.
- **A change of configuration**, such as a variable or a rotated secret, is applied and deploys the
  head of `develop` again with it.
- **A change of Supabase Auth's settings:** [SUPABASE.md](SUPABASE.md#changes).
- **Admins.** `pnpm db:admin:grant` and `pnpm db:admin:revoke` run in the tools container, from
  Coolify's terminal.

| Check, after the first deployment               | Expect                                                |
| ----------------------------------------------- | ----------------------------------------------------- |
| the tools container's log                       | the roles, the migrations and the verification passed |
| `https://api.dev.opos.land/health`              | `200`, without basic auth                             |
| the portal, the panel and the admin application | basic auth, then the application                      |
| a sign-up on the portal                         | the confirmation mail, from `no-reply@dev.opos.land`  |
| the `release` job of a push to `develop`        | "Released", and the commit running in Coolify         |

The API reaches the project over its direct connection, which on a Free project is IPv6 alone
([0039](../docs/adr/0039-verify-postgres-tls-against-the-supabase-ca-trusted-by-node.md)). If the
tools container cannot connect, the deployment's network was made without IPv6:
[COOLIFY.md](COOLIFY.md#ipv6).

## Secrets

Every value is one secret in the project's Secret Manager. `env.yaml` names them:

```yaml
secrets:
  # Issued by a third party; you enter the value
  entered:
    - coolify-api-token
  # Generated by OpenTofu, never in the state; raising the number replaces the value
  generated:
    turbo-signature-key: 1
```

- **Add a secret:** add its name, then `mise run deploy:apply dev secrets`. Enter the value of an
  entered one with `mise run deploy:secret-set dev <name>`.
- **Rotate an entered secret:** issue a new value where it comes from, enter it with
  `mise run deploy:secret-set dev <name>`, apply, then revoke the old value.
- **Rotate a generated secret:** raise its number, then apply.

An apply carries a new value to every place it is copied to: Coolify's variables and GitHub's
secrets. The SMTP key is made by the shared unit: raise `mail.smtp_key_version` and have an
administrator apply `shared`, then apply the rest. The API's Supabase key is made by the
`supabase` unit ([SUPABASE.md](SUPABASE.md#changes)).

## Images

[docker/Dockerfile](docker/Dockerfile) builds every image from the repository root, and
[docker/compose.yaml](docker/compose.yaml) puts them together into a deployment. Run
`mise run deploy:images` after a change to `docker/`, to the dependencies or to the packages of the
workspace. `docker/supabase-ca.crt` is Supabase's root CA, which every database connection verifies
against; it expires in April 2031. The Content-Security-Policy is checked in a browser, by the smoke test of a deployment.

## State

Each unit's state is `<unit>/tofu.tfstate` in the bucket `<project>-tofu-state`, encrypted with a
key derived from the secret `tofu-state-passphrase`.

- **Damaged state:** the bucket keeps every earlier version; restore the last good one.
- **Passphrase:** never delete it; losing it loses every state. Only an administrator of the
  organisation changes it.
- **New passphrase:** add a revision to the secret. In `root.hcl`, add a key provider for it and
  keep the old one as its `fallback`; apply every unit, then drop the old one
  ([0035](../docs/adr/0035-describe-the-infrastructure-in-opentofu-units-run-by-terragrunt.md)).
