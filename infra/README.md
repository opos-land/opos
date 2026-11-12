# Infrastructure

The deployed environments, described in OpenTofu units that Terragrunt runs. The rules are in
[ARCHITECTURE.md](../docs/ARCHITECTURE.md#environments); the reasons in the records it links.
`live/dev` is the Dev environment.

| Path                                      | Holds                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `root.hcl`                                | what every unit shares: the state, its encryption, the Scaleway provider                |
| `modules/`                                | the OpenTofu modules, each with its committed provider lock file                        |
| `units/`                                  | the catalog: one unit per module, configured by the values a stack hands it             |
| `live/<environment>/env.yaml`             | the one place an environment is configured: plain settings and the names of its secrets |
| `live/<environment>/terragrunt.stack.hcl` | the environment's units, generated into `.terragrunt-stack` on every run                |
| `*.sh`                                    | the scripts the deploy tasks run                                                        |

## Commands

mise installs every tool they need. Read the plan before every apply. An agent never runs a
command that changes anything: bootstrap, grant, revoke, apply, secret-set or destroy.

| Command                                                 | Does                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **On your machine, without signing in**                 |                                                                              |
| `mise run deploy:check`                                 | checks the format and validates every unit                                   |
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

5. Make the secrets, then apply the rest. The entered ones stay without a value until
   `mise run deploy:secret-set dev <name>`.

   ```sh
   mise run deploy:plan dev
   mise run deploy:apply dev
   ```

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


## State

Each unit's state is `<unit>/tofu.tfstate` in the bucket `<project>-tofu-state`, encrypted with a
key derived from the secret `tofu-state-passphrase`.

- **Damaged state:** the bucket keeps every earlier version; restore the last good one.
- **Passphrase:** never delete it; losing it loses every state. Only an administrator of the
  organisation changes it.
- **New passphrase:** add a revision to the secret. In `root.hcl`, add a key provider for it and
  keep the old one as its `fallback`; apply every unit, then drop the old one
  ([0035](../docs/adr/0035-describe-the-infrastructure-in-opentofu-units-run-by-terragrunt.md)).
