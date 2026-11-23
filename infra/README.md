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
| `docker/`                                 | the images and the compose file of a deployment: the API, the database tools, and the panel, the portal and the admin application behind Caddy |

## Commands

The deploy commands run [scripts/deploy.mjs](../scripts/deploy.mjs) and `infra:graph`
[scripts/infra-graph.mjs](../scripts/infra-graph.mjs); each also runs as `pnpm <name>` where mise's
tools are on the path, and mise installs every tool they drive
([0070](../docs/adr/0070-run-the-deploy-commands-as-node-scripts.md)). Read the plan before every
apply. An agent never runs a
command that changes anything, bootstrap, grant, revoke, apply, secret-set or destroy, nor
secret-get, which prints a secret.

| Command                                                      | Does                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **On your machine, without signing in**                      |                                                                                                                                                                                                                                                                                                                                                                         |
| `mise run infra:check`                                       | checks the format and validates every unit                                                                                                                                                                                                                                                                                                                              |
| `mise run infra:images`                                      | builds the images as the server does and tries the API and the frontends; CI's `images` job runs it on every run                                                                                                                                                                                                                                                        |
| `mise run infra:lock`                                        | rewrites the modules' provider lock files after a provider's version changed                                                                                                                                                                                                                                                                                            |
| `mise run infra:graph <environment> [--open]`                | writes `infra/live/<environment>/.terragrunt-graph.html`, a page to open in a browser with two views read from the code: the deployment, its containers, hosts, DNS records, secrets and what each reaches; and the stack, its units in apply order, what passes between them, their modules and the wiring mistakes it finds; `--open` opens it in the default browser |
| **Signed in**                                                |                                                                                                                                                                                                                                                                                                                                                                         |
| `mise run deploy:login <environment>`                        | signs you in to Scaleway and GitHub, unless you are; the key lasts 12 hours                                                                                                                                                                                                                                                                                             |
| `mise run deploy:plan <environment> [unit]`                  | shows what an apply would change; `--save` plans as an apply does and keeps the plans                                                                                                                                                                                                                                                                                   |
| `mise run deploy:apply <environment> [unit]`                 | plans, asks and applies those plans, in rounds while some units wait for others to be applied; `--saved` applies the plans `deploy:plan --save` kept; `--no-plan` asks once and applies with no plan shown; `--ref <ref>` deploys that branch or tag instead of env.yaml's, and CI's releases fail until an apply without it                                            |
| `mise run deploy:output <environment> [unit]`                | prints the units' outputs                                                                                                                                                                                                                                                                                                                                               |
| `mise run deploy:secret-set <environment> <name>`            | reads a secret's value without echo and stores it                                                                                                                                                                                                                                                                                                                       |
| `mise run deploy:secret-get <environment> <name>`            | prints a secret's current value, and only it, for a password manager or the clipboard                                                                                                                                                                                                                                                                                   |
| `mise run deploy:destroy <environment> <unit>`               | destroys one unit, after showing its plan and asking                                                                                                                                                                                                                                                                                                                    |
| `mise run deploy:import <environment> <unit> <address> <id>` | hidden; takes an object that exists but no state holds into a unit's state, as a variable Coolify made from the compose file's default before the unit wrote it, which the apply then fails to create with a 409                                                                                                                                                        |
| **As an administrator of the Scaleway organisation**         |                                                                                                                                                                                                                                                                                                                                                                         |
| `mise run deploy:bootstrap <environment>`                    | makes the state's bucket and passphrase and the project of the bucket of uploaded files, and registers the domain                                                                                                                                                                                                                                                       |
| `mise run deploy:apply <environment> shared`                 | makes the group of the people who run the commands, with its rights                                                                                                                                                                                                                                                                                                     |
| `mise run deploy:grant <environment> <email>...`             | puts people into that group                                                                                                                                                                                                                                                                                                                                             |
| `mise run deploy:grant:revoke <environment> <email>...`      | takes people out of it                                                                                                                                                                                                                                                                                                                                                  |

Without a unit, plan and apply run every unit but `shared`, which needs the organisation's
administrator rights.

## Set up an environment

The steps for Dev; another environment follows them with its own names.

1. Create the Scaleway project `opos-land-dev` and invite the people who will run the commands to
   the organisation. Write the project's name, id and region into the `scaleway` block of
   `live/dev/env.yaml`.

2. Make the state's bucket and passphrase and the project `dev-opos-land-files`, which holds the
   bucket of uploaded files alone, and register the domain:

   ```sh
   mise run deploy:bootstrap dev
   ```

   It writes the files project's id into `files.project_id` of `live/dev/env.yaml`, to commit, and
   prints the TXT record of the next step; run it again to print the record again
   ([0069](../docs/adr/0069-keep-an-environments-uploaded-files-in-a-scaleway-project-of-their-own.md)).

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
   `smtp-password`, and the API's key of the bucket of uploaded files, which may use its objects and
   nothing else, straight into the secret `files-secret-key`; it gives the operators' group Object
   Storage in the files project too.

5. Make the secrets. The entered ones stay without a value until they are entered below.

   ```sh
   mise run deploy:apply dev secrets
   ```

6. Set up Dev's Supabase project: [SUPABASE.md](SUPABASE.md).

7. Set up Dev's project on the Coolify server: [COOLIFY.md](COOLIFY.md).

8. Apply the rest. The `github` unit needs your GitHub account to administer the repository. The
   `mail` unit waits until Scaleway has validated the domain's records, up to an hour.

   An apply plans the units, asks and applies exactly those plans. A plan for an apply takes no
   mocked outputs, so a unit plans only once the units it reads are applied: without a unit named,
   the apply goes in rounds, each planning the units still waiting, asking once and applying those
   that planned, until every unit is applied. With no plan shown (`--no-plan`), one answer covers
   every unit, each planned and applied after the units it reads. The first time, the owner of the
   Coolify server runs the apply, with their own token
   ([COOLIFY.md](COOLIFY.md#the-tokens)): Coolify lets nobody else create its services.

   ```sh
   COOLIFY_TOKEN=<the owner's token> mise run deploy:apply dev --no-plan
   ```

   The `files` and `deployment` units stop if an administrator has not applied `shared` since
   step 4, which writes `smtp-password` and `files-secret-key` and lets the operators keep the
   bucket: a round then plans nothing, and the apply stops there.
   `deploy:plan` alone mocks what is not applied yet, to preview the whole stack.

   The `deployment` unit deploys once and waits for it: Coolify reads the compose file, the tools
   run the database steps, the API starts. Coolify takes the host of a service only once a
   deployment has read it, so list the services in `deployment.loaded_services` of
   `live/dev/env.yaml` and apply again; a service added to the compose file later is listed after
   the deployment that brings it. The hosts' certificates follow on their own once their records
   resolve.

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
| mail    | `https://mail.dev.opos.land`  |

- **Files.** The API keeps uploaded files in the bucket of the `files` unit, `files.bucket` in
  `env.yaml`, in a project of its own; its key may read, write and delete objects there and
  nothing else. The bucket is private, encrypted at rest, and keeps a removed or replaced object's
  earlier version for `files.noncurrent_days`, which an operator restores with an S3 client under
  their own key. Images go through the deployment's own imgproxy, which no host routes to.
- **Mail.** Dev's mail never leaves the server: the API sends it to Mailpit, the `mail` service
  (`deployment.catch_mail` in `env.yaml`), whose inbox is at its address. The `mail` unit still
  keeps the domain's records for a deployment that sends.
- **Basic auth.** Every service but the API asks for the user `opos` and the value of the secret
  `basic-auth-password`: `mise run deploy:secret-get dev basic-auth-password`. Rotate it by raising its number in `env.yaml` and applying.
- **A release.** Once the checks of a push to `develop` passed, the `release` job of CI sends
  Coolify's webhook of the application a push of its commit, signed with the secret
  `release-webhook-secret`, and Coolify deploys that commit
  ([0075](../docs/adr/0075-release-dev-from-ci-through-a-signed-webhook.md)). The job ends once
  Coolify has queued the deployment; how the deployment ends is in Coolify. A rollback is a revert
  on `develop`.
- **A release by hand.** When Dev missed the head of `develop`, as after a failed build in Coolify
  or an apply with `--ref` and one without it, run the `release-dev` workflow on `develop`
  (`gh workflow run release-dev.yml --ref develop`, or Actions, "Run workflow"). It releases the
  head once CI's checks of its push passed, and refuses it otherwise.
- **A change of configuration**, such as a variable or a rotated secret, is applied and deploys the
  head of `develop` again with it.
- **A change of Supabase Auth's settings:** [SUPABASE.md](SUPABASE.md#changes).
- **Demo data.** While `deployment.seed` in `env.yaml` is `true`, every deployment runs the seed
  after the verification and before the API starts: each release writes the demo rows and the demo
  accounts' passwords back as the seed has them, and a failed seed fails the deployment. A release
  cannot choose otherwise, as Coolify's webhook takes a commit and nothing else: set it to `false`
  and apply to leave Dev's data alone, and seed once by hand with `pnpm db:seed` in the tools
  container.
- **Admins.** `pnpm db:admin:grant` and `pnpm db:admin:revoke` run in the tools container, from
  Coolify's terminal.

| Check, after the first deployment               | Expect                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| the tools container's log                       | the roles, the migrations, the verification and the seed passed  |
| `https://api.dev.opos.land/health`              | `200`, without basic auth                                        |
| the portal, the panel and the admin application | basic auth, then the application                                 |
| a sign-up on the portal                         | the confirmation mail in `https://mail.dev.opos.land`            |
| the imgproxy container in Coolify               | healthy                                                          |
| the `release` job of a push to `develop`        | "Coolify queued deployment", then the commit finished in Coolify |

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
secrets. The SMTP key and the bucket's key are made by the shared unit: raise
`mail.smtp_key_version` or `files.key_version` and have an administrator apply `shared`, then
apply the rest. The API's Supabase key is made by the
`supabase` unit ([SUPABASE.md](SUPABASE.md#changes)).

## Images

[docker/Dockerfile](docker/Dockerfile) builds every image from the repository root, and
[docker/compose.yaml](docker/compose.yaml) puts them together into a deployment. Run
`mise run infra:images` after a change to `docker/`, to the dependencies or to the packages of the
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
