# Production hosting: Cloud Run against Kapsule

- Date: 2026-11-22
- Source: research toward the record that chooses production's hosting, reviewed once by an agent
  with no context of it
- Binds nothing: the record decides

## Frame

### Constraints

- **Serverless is the goal.** Scaleway's Serverless Containers were turned down: they cannot stand
  behind a load balancer with the certificates production needs.
- **No new provider to manage.** The places managed today are GitHub, Coolify, Supabase, Scaleway
  and GCP (the Google OAuth client of sign-in). Vercel was turned down as a sixth. Cloudflare is
  only a DNS pointer set by hand, so hosting there would be a sixth too.
- **Budget:** about €50–60 a month before VAT.

That leaves two candidates:

- **Cloud Run on GCP**
- **Kapsule on Scaleway**, with the shared control plane, which is free; the dedicated one is out of
  budget

### Records that do not bind production

- [ADR 0033 Host Dev on the team's Coolify server and leave production's hosting open](../adr/0033-host-dev-on-the-teams-coolify-server-and-leave-productions-hosting-open.md)
  and [spec 0015 Deployment](../specs/0015-deployment.md) describe Dev: Coolify, images built on
  the server. Production takes its own shape, with images built in CI and pushed to a registry on
  either candidate.
- [ADR 0036 Keep every secret in Scaleway Secret Manager and give CI only the values it uses](../adr/0036-keep-every-secret-in-scaleway-secret-manager-and-give-ci-only-the-values-it-uses.md)
  is superseded for production on either candidate. It holds that CI never reaches Scaleway, and a
  release of production from CI must reach the platform it runs on. The new record decides how CI
  signs in and how secrets reach the running containers.

### What holds either way

- Production releases from `main` behind a reviewer:
  [ADR 0017 Integrate on `develop` and release through `main`](../adr/0017-integrate-on-develop-and-release-through-main.md).
- A dump comes before every release:
  [ADR 0014 Back up production beyond Supabase's own backups](../adr/0014-back-up-production-beyond-supabase.md).
- Production runs in the EU, apart from Dev.
- The API reaches Postgres over the direct connection with verified TLS, never through Supavisor:
  [ADR 0039 Verify Postgres TLS against the Supabase CA that Node trusts](../adr/0039-verify-postgres-tls-against-the-supabase-ca-trusted-by-node.md).
- Uploaded files stay in Scaleway Object Storage:
  [ADR 0069 Keep an environment's uploaded files in a Scaleway project of their own](../adr/0069-keep-an-environments-uploaded-files-in-a-scaleway-project-of-their-own.md).

## What production needs on either host

Read from the code on 2026-11-22. None of it is built yet, and none of it depends on the choice.

### Direct connections

- **Today:** each API process opens two pools of 10 (`appDb` and `globalDb`, in
  `apps/api/src/common/database/database.module.ts`), and a third with `DATABASE_ADMIN_URL`, which
  the admin application needs: up to 30 connections per process.
- **Before production:** processes × 30, plus Supabase Auth, the tools and the backup, must fit the
  direct connection limit of the project's compute size (ADR 0039). Name the compute size, and
  shrink the pools through the options `packages/db` already takes.

### The visitor's address

- **Today:** the API trusts exactly one proxy (`trust proxy 1`, in `apps/api/src/app.ts`), and the
  rate limits per address read the address it gives.
- **Before production:** set and test the hop count of the chosen path: a load balancer and an
  ingress on Kapsule, a load balancer and Cloud Run's front end on Cloud Run. A wrong count gives
  every visitor one address, or lets a client choose its own.

### The rate limiter

- **Today:** its counters live in process memory (`apps/api/src/common/rate-limit/rate-limit.ts`),
  so with N processes each limit is N times higher.
- **Before production:** a shared store before a second process, on either candidate. On Cloud Run
  N grows exactly when ticket sales open.

### IPv4 or IPv6 to Postgres

- **Today:** the direct connection is IPv6 unless the project has the IPv4 add-on (ADR 0039).
- **Before production:** likely the IPv4 add-on on both. Cloud Run's outbound IPv6 to the internet
  is not established, and Kapsule pods are believed to be IPv4-only (unverified).

### Backups

- **Today:** ADR 0014 asks for an encrypted `pg_dump` every 6 hours into two repositories off the
  host, and a monthly restore drill. Nothing runs it yet.
- **Before production:** a scheduled job and its storage: a Cloud Run job with Cloud Scheduler, or a
  Kubernetes CronJob.

### Release from CI

- **Today:** Dev releases through a signed webhook to Coolify:
  [ADR 0071 Release Dev from CI through a signed webhook](../adr/0075-release-dev-from-ci-through-a-signed-webhook.md).
- **Before production:** CI signs in to the platform. On GCP through Workload Identity Federation,
  with no stored key; on Kapsule through a cluster credential stored in GitHub, or an agent in the
  cluster that pulls.

### Logs and alerts

- **Today:** none for a deployed environment.
- **Before production:** Cloud Logging and Monitoring on GCP; Scaleway Cockpit on Kapsule.

### The jobs between requests

- **Today:** four `setTimeout` loops in the process: the order emails' outbox every 15 s, order
  expiry every minute, pre-edition reminders every 5 minutes and the file sweep daily. Each is safe
  with several processes ([spec 0004 Checkout and orders](../specs/0004-checkout-and-orders.md), Jobs).
  The signing keys' reload is a timer too, but needs nothing: the key set is fetched again when a
  token names a key it does not hold.
- **Before production:** nothing on Kapsule; on Cloud Run, see [below](#the-jobs-on-cloud-run).

## Cloud Run

### Shape on Cloud Run

- Region `europe-west1` (Belgium, price tier 1). Frankfurt, `europe-west3`, is tier 2, at 1.4× the
  request-based price.
- One service for the API, with imgproxy as a sidecar on localhost
  ([ADR 0042 Keep a cleaned master of an image and make its variants in imgproxy](../adr/0042-keep-a-cleaned-master-of-an-image-and-make-its-variants-in-imgproxy.md),
  still Proposed). One service per frontend, serving its static build.
- A global external Application Load Balancer in front, with Google-managed certificates. Cloud
  Run's own domain mapping is still Preview, not production-ready by Google's docs, and missing in
  some regions.
- The migrations and the dump run as Cloud Run jobs.

### The jobs on Cloud Run

With request-based billing an instance has CPU only while it serves a request: between requests the
timers stall, and with no traffic the instance is gone. Two ways out:

- **A: as the code is.** Instance-based billing, so CPU stays on, with at least one instance always
  running. The loops run unchanged. One instance is replaced on failure after a cold start of a few
  seconds; two always on remove that gap at twice the price.
- **B: jobs called from outside.** Each job's run becomes an endpoint that Cloud Scheduler calls
  with an OIDC token the API checks, and the API goes request-based: it scales to zero, or keeps one
  idle instance against cold starts.
  - Cloud Scheduler runs at most once a minute, so an order's email can be up to a minute late,
    unless the order's request sends it after the commit.
  - The daily sweep needs a scheduler deadline long enough for its run.
  - No HA beyond what the platform restarts, and cold starts when a sale opens.

### What Cloud Run adds to manage

- A GCP project for production under a billing account.
- IAM, and Workload Identity Federation for CI.
- Artifact Registry.
- The load balancer's resources (address, certificate, URL map, backend services, serverless NEGs,
  forwarding rule) and the services, in OpenTofu under the `google` provider.
- Secrets, either copied into Google Secret Manager or set on the services from the operator's
  apply. ADR 0036's alternatives turned Google Cloud down once for secrets, as a second provider
  outside the EU.
- GCP today holds only the OAuth client: production makes it where the product runs.

### What Cloud Run takes away

- No cluster, no nodes, no ingress controller, no certificate manager to keep up.
- Revisions with rollback and traffic splitting.
- Frontends that cost nothing when idle.

## Kapsule

### Shape on Kapsule

- Two nodes (DEV1-M, 3 vCPU and 4 GB) of a Kapsule cluster with the shared control plane, in
  `fr-par`.
- A Scaleway load balancer in front; an ingress controller; certificates from Let's Encrypt through
  cert-manager or the load balancer.
- The API with two replicas, imgproxy and the frontends as pods.
- The migrations and the dump as Kubernetes jobs.
- The code runs as it is.

### What Kapsule adds to manage

- Kubernetes: the cluster's version upgrades, since Kapsule ends support of old minor versions.
- The ingress controller and cert-manager, and their upgrades.
- The manifests or charts.
- Scaleway Container Registry.
- A way for CI to reach the cluster.

All of it at the provider already holding the secrets, the bucket and the mail, under the OpenTofu
provider already in use.

### What Kapsule takes away

- One provider for everything production runs on.
- Rolling updates, and two replicas always warm.
- A fixed bill.
- No change to how the jobs run.

### Open, from earlier research

- Whether node public IPv4s are billed.
- Whether node system disks are billed Block Storage.
- Whether nodes can sit in different availability zones.
- IPv6 from the pods.

## Cost per month, before VAT

Assumed traffic: low, a few hundred thousand API requests a month and tens of GB served, with bursts
when ticket sales open. Cloud Run is billed in dollars, Scaleway in euros; the totals in euros take
roughly $1.15 a euro. Lines the same on both sides are left out: the Supabase plan and its compute,
the bucket, the mail.

| Line                 | Cloud Run A, one instance | Cloud Run A, two instances | Cloud Run B           | Kapsule             |
| -------------------- | ------------------------- | -------------------------- | --------------------- | ------------------- |
| API compute          | ~$50 (1 vCPU, 1 GiB)      | ~$100                      | ~$0–20 (see below)    | in the nodes        |
| imgproxy             | ~$10–20                   | ~$20–40                    | ~$0–5                 | in the nodes        |
| frontends            | ~$0–1                     | ~$0–1                      | ~$0–1                 | in the nodes        |
| nodes                | —                         | —                          | —                     | €29.48 (2 × DEV1-M) |
| load balancer        | ~$18.25 + $0.008/GiB      | ~$18.25 + $0.008/GiB       | ~$18.25 + $0.008/GiB  | €16.79 + €3.65 IP   |
| node IPv4s           | —                         | —                          | —                     | €0–7.30 (open)      |
| outbound traffic     | a few $                   | a few $                    | a few $               | €0 (to verify)      |
| Cloud Scheduler      | ~$0.10                    | ~$0.10                     | ~$0.20                | —                   |
| registry             | ~$0.30                    | ~$0.30                     | ~$0.30                | ~€0.10              |
| Supabase IPv4 add-on | $4                        | $4                         | $4                    | $4 (likely)         |
| **total**            | **~$85–100 (~€75–87)**    | **~$145–170 (~€125–150)**  | **~$25–55 (~€22–48)** | **~€53–61**         |

Notes on the lines:

- **API compute in B:** ~$0–5 scaled to zero; ~$7–20 with one idle instance.
- **imgproxy in A:** a sidecar's own CPU and memory are billed in the instance, always on with it.
- **Cloud Scheduler:** the backup in A; the backup and the jobs in B.
- **Outbound traffic:** Google bills egress; Scaleway is believed not to.

The HA comparable to Kapsule's two warm replicas is A with two instances. B is cheapest because it
gives up both warm replicas and the jobs' place in the process.

### Sources and confidence

- **Checked on 2026-11-22**, through secondary sources that agree with each other, not on Google's
  pricing page itself:
  - Cloud Run tier 1 request-based rates: $0.000024 per vCPU-second, $0.0000025 per GiB-second,
    $0.40 per million requests.
  - Cloud Run's free tier per billing account: 180,000 vCPU-seconds, 360,000 GiB-seconds and
    2 million requests a month.
  - Tier 2 at 1.4× the request-based price.
  - The load balancer's forwarding rule, $0.025 an hour for the first five, and data processing,
    $0.008 per GiB.
  - Artifact Registry, $0.10 per GiB-month past 0.5 GiB.
  - The Supabase IPv4 add-on, $4.
  - Scaleway Container Registry, €0.027 per GB-month private.
- **Not verified**, to check before the record:
  - The instance-based rates behind A (taken as $0.000018 per vCPU-second and $0.000002 per
    GiB-second) and their free tier.
  - The idle rate of a minimum instance behind B.
  - Google's egress rate, and Cloud Scheduler's price past its free jobs.
  - Whether Scaleway bills outbound traffic from Kapsule nodes or the load balancer.
  - The direct connection limit of each Supabase compute size.
- **Scaleway prices** come from the public catalog on 2026-11-19, `fr-par`.

## Reading

- **A costs more than Kapsule for the same shape.** An always-on instance is a server billed by the
  second, plus a load balancer; with two instances for the same HA it costs about twice Kapsule.
- **B is the serverless answer and the cheapest.** Its price is moving four jobs out of the process,
  cold starts and a single instance when sales open, and GCP becoming where production runs. The
  move serves Cloud Run alone: on Kapsule the jobs need nothing.
- **Kapsule needs no change to how the API runs but brings Kubernetes to keep up**, on a fixed bill
  inside the budget.
- **The needs on either host weigh more than the choice.** Connection limits, the visitor's address,
  the rate limiter's shared store, backups, the release from CI and logs are work on both.

## Questions for the record

1. Is a sixth place avoided if GCP grows from an OAuth client to production's host, or does that
   count as a new place in all but name?
2. Is B's trade accepted: the jobs called from outside, an order's email up to a minute late or sent
   by its request, a single instance with cold starts when a sale opens?
3. How does CI release production, and how do secrets reach the running containers, in the record
   that supersedes ADR 0036?
4. Which Supabase compute does production run on, and how many API processes does its direct
   connection limit allow?
5. Does Google, a US provider, hold production's personal data on the same terms as Supabase does
   today ([PRODUCT.md, 10. Personal data and privacy](../PRODUCT.md#10-personal-data-and-privacy))?
