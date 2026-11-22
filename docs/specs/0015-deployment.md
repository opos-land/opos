# Deployment

- Status: Draft
- Domain owner: the team: the deployment is part of the platform, not of a module
- Decisions: [0033](../adr/0033-host-dev-on-the-teams-coolify-server-and-leave-productions-hosting-open.md),
  [0034](../adr/0034-address-dev-under-dev-opos-land-in-a-dns-zone-of-its-own.md),
  [0035](../adr/0035-describe-the-infrastructure-in-opentofu-units-run-by-terragrunt.md),
  [0036](../adr/0036-keep-every-secret-in-scaleway-secret-manager-and-give-ci-only-the-values-it-uses.md),
  [0037](../adr/0037-share-a-turborepo-remote-cache-that-only-develop-and-main-write.md),
  [0038](../adr/0038-release-dev-from-ci-and-change-its-infrastructure-from-an-operators-machine.md),
  [0069](../adr/0069-keep-an-environments-uploaded-files-in-a-scaleway-project-of-their-own.md),
  [0070](../adr/0070-run-the-deploy-commands-as-node-scripts.md),
  [0071](../adr/0071-release-dev-from-ci-through-a-signed-webhook.md)

## Goal

A deployed environment runs what the local stack runs: the API, the panel, the portal and the admin
application, their database in Supabase, the bucket of uploaded files and imgproxy
([file storage](0012-file-storage.md), [image variants](0013-image-variants.md)), and its mail. Dev
is the first; production takes the same shape once its hosting is decided. The infrastructure is code an operator applies, and a release is CI's.

## Business rules

Every rule is the team's.

### Environments

| #   | Rule                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Each environment is a Scaleway project of its own, in the EU, holding its DNS zone, its state and its secrets; its bucket of uploaded files lies in a second project that holds it alone.             |
| E2  | One file of the environment, its `env.yaml`, holds every plain setting and the name of every secret; no value of a secret enters the repository.                                                      |
| E3  | Dev runs on the team's Coolify server, at `dev.opos.land` and the hosts under it, behind basic auth but for the API, and its mail never leaves the server. Production never shares a server with Dev. |
| E4  | A working checkout never points at a deployed environment.                                                                                                                                            |

### Who changes what

| #   | Rule                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | The infrastructure changes only through the deploy commands, from a person's machine, under their own Scaleway identity. No workflow applies, and an agent never runs a command that applies, destroys or sets a secret.                                                          |
| C2  | An administrator of the Scaleway organisation makes what an environment needs from the organisation: the projects but the environment's own, the operators' group and its members, and the keys the API holds.                                                                    |
| C3  | An operator, a member of the group, applies everything else, with rights in the environment's two projects alone, through a key of their own that expires the same day.                                                                                                           |
| C4  | Every apply shows its plans and asks before it applies them; what it applies is exactly what it showed. Without a unit named, it goes in rounds: each plans the units still waiting, asks once and applies those that planned, until every unit is applied or a round plans none. |
| C5  | A release is CI's: once the checks of a push to `develop` passed, Dev runs the commit they passed. OpenTofu owns the configuration of a deployment and never which commit it runs.                                                                                                |

### Secrets

| #   | Rule                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1  | Every secret value is one secret in the Secret Manager of the environment's project.                                                                                     |
| S2  | A value a third party issues is entered by a person, read without echo; a value nobody needs to know is generated, never reaches the state, and is rotated by a number.  |
| S3  | A key of Scaleway the API holds is made with its rights and written straight into its secret, never into the state.                                                      |
| S4  | No secret is ever an argument of a command, a file on the disk or a line of a shell's history.                                                                           |
| S5  | Each value reaches the one container, or the one GitHub environment, that uses it; only the tools container holds the `postgres` URL, and only the API the bucket's key. |

### Files and images

| #   | Rule                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | The bucket is private, encrypted at rest, and keeps a removed or replaced object's earlier version for three months ([file storage](0012-file-storage.md), X3, W1–W2). |
| F2  | The API's key reads, writes and deletes the bucket's objects and does nothing else, in the bucket's project alone.                                                     |
| F3  | imgproxy runs beside the API with the local stack's image and settings, reached by the API alone, with no host and no key of the bucket.                               |

### The deploy commands

| #   | Rule                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Every deploy command is a root script that runs a Node script, with a mise task of the same name; the tools it drives, OpenTofu, Terragrunt, scw and gh, come from mise.                                                                                             |
| K2  | A command that changes something prints the change before it runs it, and stops at the first failure, a failed listing included. A plan or an apply that reaches the `supabase` unit first tries its access token, and stops before planning if Supabase refuses it. |
| K3  | The bootstrap, the grant and the sign-in are safe to run again.                                                                                                                                                                                                      |
| K4  | No shell script runs on an operator's machine; the scripts inside an image stay where their image has no Node.                                                                                                                                                       |

## Shape

### Units

| Unit         | Applied by    | Makes                                                                                                                   |
| ------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `shared`     | administrator | the operators' group and its rights; the API's SMTP key and its key of the bucket, each with its application and policy |
| `secrets`    | operator      | a secret per name of `env.yaml`, and the generated values                                                               |
| `files`      | operator      | the bucket, in the files project: versioning, its lifecycle, the private ACL, encryption at rest                        |
| `mail`       | operator      | Transactional Email for the zone and its records                                                                        |
| `supabase`   | operator      | Supabase Auth's settings in the environment's project and the API's secret key                                          |
| `cache`      | operator      | CI's Turborepo remote cache on the Coolify server                                                                       |
| `deployment` | operator      | the Coolify application of `infra/docker/compose.yaml`, its variables, its hosts and their records, and a deployment    |
| `github`     | operator      | the GitHub environments and secrets CI uses                                                                             |

Before the units, the bootstrap makes, with the administrator's own profile of scw: the state's
bucket and passphrase, the files project, whose id it writes into `env.yaml`, and the environment's
domain.

### The deployment's services

| Service    | Host     | Holds                                                                                |
| ---------- | -------- | ------------------------------------------------------------------------------------ |
| `tools`    | none     | runs `db:roles`, `db:migrate` and `db:verify`, then stays for the admin's scripts    |
| `api`      | `api.`   | the API, started once the tools passed; the bucket's key and imgproxy's key and salt |
| `imgproxy` | none     | imgproxy, reading the bucket through addresses the API signs                         |
| `portal`   | the zone | the portal, behind basic auth                                                        |
| `panel`    | `panel.` | the panel, behind basic auth                                                         |
| `admin`    | `admin.` | the admin application, behind basic auth                                             |
| `mail`     | `mail.`  | Mailpit's inbox, behind basic auth, while the environment catches its mail           |

### Commands

Each runs as `mise run deploy:<name>` or `pnpm deploy:<name>`, through `scripts/deploy.mjs`.

| Command      | Who           | Does                                                                                                    |
| ------------ | ------------- | ------------------------------------------------------------------------------------------------------- |
| `bootstrap`  | administrator | the state's bucket and passphrase, the files project, the domain                                        |
| `grant`      | administrator | puts people into the operators' group, or `--revoke` takes them out                                     |
| `login`      | operator      | signs in to Scaleway, with a key of the environment's project for 12 hours, and to GitHub               |
| `plan`       | operator      | plans every unit but `shared`, or one; `--save` keeps exact plans                                       |
| `apply`      | operator      | plans, asks, applies those plans, in rounds; `--saved`, `--no-plan`; `--ref` runs another branch or tag |
| `destroy`    | operator      | destroys one unit after showing its plan                                                                |
| `output`     | operator      | prints the units' outputs                                                                               |
| `secret-set` | operator      | stores an entered value, read without echo, and disables the version before it                          |
| `secret-get` | operator      | prints a secret's value alone                                                                           |

The same script is OpenTofu's external key provider: it hands over the state's passphrase for the
length of a run. Every command but the bootstrap and the grant runs under the operator's own key, in
a profile of scw kept outside the person's own configuration.

## Tenant isolation and permissions

- No tenant is a part of the deployment: tenant isolation is the database's and the API's. The
  deployment keeps it by handing the API only the runtime roles' URLs (S5), never `postgres`.
- The operators' rights are Secret Manager, DNS, Object Storage and Transactional Email in the
  environment's project, and Object Storage in the files project; nothing of the organisation.
- The API's Scaleway keys: one may send mail in the environment's project, the other read, write
  and delete objects in the files project; neither changes a setting.
- CI holds the secret of the application's webhook, which deploys a commit of the repository and
  changes nothing, and the cache's tokens; it never reaches Coolify's API or Scaleway.

## Tests

On every run, without signing in:

- `scripts/deploy.test.mjs`, against fakes of scw, Terragrunt, gh and the APIs of Secret Manager
  and Supabase: each command's arguments and order; the bootstrap and the grant run twice change
  nothing the second time; a secret only ever in a request's body, never in a command's arguments
  or input; a failed listing stops a command; a refused Supabase token stops a plan before it
  starts; an apply applies only after a yes, and only the plans it showed, a round at a time while
  units wait for others; the key provider speaks OpenTofu's protocol and hands no decryption key
  when only encrypting.
- `scripts/compose.test.mjs`: the services and their ports; the `postgres` URL to the tools alone;
  the bucket's key to the API alone; imgproxy's key to the API and imgproxy alone; imgproxy's image
  and settings those of the local stack.
- `mise run deploy:check`: the format and every unit valid against its module's lock file.
- `mise run deploy:images` in CI's `images` job: the images build, the API resolves its imports,
  the frontends answer behind basic auth.

After a deployment, by hand: the checks of [infra/README.md](../../infra/README.md#the-deployment).

## Out of scope

- Production's hosting and its first deployment: a record of its own
  ([0033](../adr/0033-host-dev-on-the-teams-coolify-server-and-leave-productions-hosting-open.md)).
- The backups of [0014](../adr/0014-back-up-production-beyond-supabase.md), and copying the bucket
  into them.
- A CDN in front of the API.
- The scripts inside the images, `infra/docker/*.sh`.

## Open questions

- **Production's projects:** the same two, named after production, once its hosting is decided.
- **Who administers the organisation:** the role named in [CONTRIBUTORS.md](../../CONTRIBUTORS.md),
  or a new one.
