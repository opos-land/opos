# 0041. Keep uploaded files in an S3 bucket behind the API

- Status: Accepted
- Date: 2026-11-18

## Context

Features need files people upload. The first are the tickets module's: the PDF of a legal
document, whose exact version an order keeps, and the pictures and size charts of merchandise
([shop setup](../specs/0002-shop-setup.md), [catalog](../specs/0003-catalog.md)). Others follow:
an account's picture, an edition's photographs, a picture in a comment. PRODUCT.md 11 left file
uploads beyond the MVP, and OPOS has nowhere to keep a file: hosted Supabase serves Postgres and
sign-in alone, its Storage off
([0003](0003-use-hosted-supabase-for-postgres-and-auth-only.md)).

The frontends talk to the API alone, and the portal loads nothing from another origin
([0004](0004-make-the-api-the-only-backend-with-the-session-in-cookies.md),
[0026](0026-run-a-tracker-only-with-consent-and-none-in-the-panel.md)). A write with a session
cookie has a JSON body. Outbound I/O never runs inside a transaction. A tenant route carries one
fixed requirement. The API's session cookies live on the API's own host.

## Decision

- Uploaded files are kept in an S3 bucket, one an environment, private, in the EU and encrypted
  at rest. The provider is Scaleway Object Storage, in the project and region of the environment.
- No browser reaches the bucket. The API takes every upload and serves every file from its own
  origin; only the API holds the bucket's key, which opens that bucket and nothing else.
- The storage is a service of the core with no route of its own. A feature declares the kinds of
  file it takes, and its own routes take and serve them, under the feature's requirement.
- A file has one owner: an account, a convention or an edition. A row stands for each file, in a
  tenant table under RLS for a convention's or an edition's and in a global table for an
  account's, and an object's key starts with the kind and the identifier of its owner.
- An upload is a JSON body carrying the file, up to 15 MB a file, on a route with a body limit of
  its own. The bytes are stored outside every transaction.
- The API keeps only inert types, each checked against its content, and serves them under headers
  that let a browser neither run nor guess at them.
- A file goes with what it was kept for, and a daily sweep removes what belongs to nothing. The
  bucket keeps earlier versions of an object for three months, as long as a backup is kept.
- The local stack and CI run Versity Gateway, an S3-compatible server over a directory, so the
  tests speak the same protocol as production.

What is kept of an image is decided in
[0042](0042-keep-a-cleaned-master-of-an-image-and-make-its-variants-in-imgproxy.md). The rules are
in [the spec of file storage](../specs/0012-file-storage.md) until the feature is built.

## Alternatives

- **Supabase Storage.** Already in the vendor's project, but 0003 turned it down: a client would
  reach files around the API, its permissions and its tenant context.
- **The database.** A `bytea` column is under RLS and in every backup with no new part, but it
  grows the hosted database and its dumps with bytes that never change, and every read of a
  picture takes a pooled connection.
- **The server's disk.** Nothing to rent, but a lost server takes the files, and a second API
  process on another server cannot read them.
- **Uploads straight to the bucket by a signed address.** The API handles no bytes, but the
  browser talks to another origin, against the BFF boundary and the portal's rule on other
  origins, and the API checks a file's content only after it is kept.
- **An origin of its own for files.** The usual guard for content a tenant controls, but another
  origin for the frontends to load from, against the same two rules. The API's origin serves them
  instead, limited to inert types and guarded by headers.
- **One upload route for every feature.** A single place to send a file, but a tenant route
  carries one fixed requirement, and the permission to send a file depends on what it is for.
- **One table for every owner.** One place for every file, but an account belongs to no tenant,
  and a row without a tenant has no place in a table under tenant isolation.
- **A form upload in parts.** The browser's own way, but a form's body is the one a foreign page
  can send without asking, which the JSON rule exists to refuse.
- **MinIO for the local stack.** Its community edition is retired and its images withdrawn.
- **SeaweedFS for the local stack.** A distributed store with a format of its own: more parts
  than a local stack needs, where the gateway is one process that writes plain files.
- **A stand-in on disk for the local stack.** No server to run, but the tests would never speak
  S3.

## Consequences

- A second place holds data beside the database: the bucket joins what PRODUCT.md 10 describes
  and the backups of [0014](0014-back-up-production-beyond-supabase.md), which copy it off the
  vendor once the deployment builds them.
- The API depends on the AWS SDK for S3 and on the bucket being reachable for uploads and reads;
  nothing else of the API waits for it.
- A file costs a third more in transit as a JSON body, and the API holds it whole in memory while
  it reads and checks it: 15 MB is the limit until uploads in parts are worth their cost.
- Every picture a person sees is read through the API. A file never changes, so it is cached for
  good; a CDN in front of the API is the next step if that load is felt.
- The portal's content security policy names the API's origin for images.
- The sweep is the API's first job.
- A feature that starts to take files adds a kind and a column of its own; the storage does not
  change with it.
- The owners are a list of the storage. A further one, such as the platform itself, is a table of
  its files and a name for its keys; no kept file moves, and no feature changes.
- The local gateway keeps an object's metadata in extended attributes of its file system, or in a
  directory beside the data where there are none. Its makers test it against the AWS SDK for Go;
  the adapter's own tests are the proof that the SDK for JavaScript and the gateway agree.
- Not built yet: the bucket and its key in each environment come with the deployment
  ([0012](0012-host-each-environment-on-a-vps-with-compose-and-traefik.md)).

## Sources

- The OWASP File Upload Cheat Sheet, for the checks on a file's type, name and size.
- Scaleway's documentation of Object Storage: its S3 API, versioning, lifecycle rules and
  encryption at rest.
- Versity Gateway's documentation: its container image and its POSIX backend.
