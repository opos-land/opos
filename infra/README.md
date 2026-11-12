# Infrastructure

The deployed environments, described in OpenTofu units that Terragrunt runs. The rules are in
[ARCHITECTURE.md](../docs/ARCHITECTURE.md#environments); the reasons in the records it links.
`live/dev` is the Dev environment.

| Path                                      | Holds                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `root.hcl`                                | what every unit shares: the state, its encryption, the Scaleway provider                       |
| `coolify.hcl`                             | the Coolify provider, for the units that change Coolify                                        |
| `modules/`                                | the OpenTofu modules, each with its committed provider lock file                               |
| `units/`                                  | the catalog: one unit per module, configured by the values a stack hands it                    |
| `live/<environment>/env.yaml`             | the one place an environment is configured: plain settings and the names of its secrets        |
| `live/<environment>/terragrunt.stack.hcl` | the environment's units, generated into `.terragrunt-stack` on every run                       |
| `*.sh`                                    | the scripts the deploy tasks run                                                               |
| `docker/`                                 | the images of a deployment: the API, the database tools, the panel and the portal behind Caddy |

## Commands

mise installs every tool they need. Read the plan before every apply. An agent never runs a
command that changes anything: bootstrap, grant, revoke, apply, secret-set or destroy.

| Command                                                 | Does                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **On your machine, without signing in**                 |                                                                              |
| `mise run deploy:check`                                 | checks the format and validates every unit                                   |
| `mise run deploy:images`                                | builds the images as the server does and tries the API and the portal        |
| `mise run deploy:lock`                                  | rewrites the modules' provider lock files after a provider's version changed |
| **Signed in**                                           |                                                                              |
| `mise run deploy:login <environment>`                   | signs you in to Scaleway and GitHub, unless you are; the key lasts 12 hours  |
| `mise run deploy:plan <environment> [unit]`             | shows what an apply would change                                             |
| `mise run deploy:apply <environment> [unit]`            | applies, after asking                                                        |
| `mise run deploy:output <environment> [unit]`           | prints the units' outputs                                                    |
| `mise run deploy:secret-set <environment> <name>`       | reads a secret's value without echo and stores it                            |
| `mise run deploy:destroy <environment> <unit>`          | destroys one unit, after asking                                              |
| **As an administrator of the Scaleway organisation**    |                                                                              |
| `mise run deploy:bootstrap <environment>`               | makes the state's bucket and passphrase and registers the domain             |
| `mise run deploy:apply <environment> shared`            | makes the group of the people who run the commands, with its rights          |
| `mise run deploy:grant <environment> <email>...`        | puts people into that group                                                  |
| `mise run deploy:grant:revoke <environment> <email>...` | takes people out of it                                                       |

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

5. Make the secrets. The entered ones stay without a value until the next step.

   ```sh
   mise run deploy:apply dev secrets
   ```

6. Create Coolify's API token and enter it:
   1. In Coolify, under Settings, Advanced, set API access to Enabled.
   2. Under Keys & Tokens, API Tokens, select New token.
   3. Permissions: `read`, `read:sensitive`, `write`, `delete` and `deploy`, not `root`.
   4. Access: all resources in the team. Coolify limits a token only to projects that already
      exist, and the apply of step 8 creates Dev's project.
   5. Expiry: at most a year. Before it lapses, enter a new token the same way.
   6. Enter it:

      ```sh
      mise run deploy:secret-set dev coolify-api-token
      ```

7. Write the dashboard's address, the server's id (Servers, then the server's page) and its public
   addresses into the `coolify` block of `live/dev/env.yaml`.

8. Apply the rest. The `github` unit needs your GitHub account to administer the repository.

   ```sh
   mise run deploy:plan dev
   mise run deploy:apply dev
   ```

   The hosts' certificates follow on their own once their records resolve.

9. Check the remote cache, below.

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
secrets.

## Images

[docker/Dockerfile](docker/Dockerfile) builds every image from the repository root. Run
`mise run deploy:images` after a change to `docker/`, to the dependencies or to the packages of the
workspace. The Content-Security-Policy is checked in a browser, by the smoke test of a deployment.

## State

Each unit's state is `<unit>/tofu.tfstate` in the bucket `<project>-tofu-state`, encrypted with a
key derived from the secret `tofu-state-passphrase`.

- **Damaged state:** the bucket keeps every earlier version; restore the last good one.
- **Passphrase:** never delete it; losing it loses every state. Only an administrator of the
  organisation changes it.
- **New passphrase:** add a revision to the secret. In `root.hcl`, add a key provider for it and
  keep the old one as its `fallback`; apply every unit, then drop the old one
  ([0035](../docs/adr/0035-describe-the-infrastructure-in-opentofu-units-run-by-terragrunt.md)).
