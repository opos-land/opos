# File storage

- Status: Draft
- Domain owner: the team: the file storage is part of the core
- Decisions: [0041](../adr/0041-keep-uploaded-files-in-an-s3-bucket-behind-the-api.md),
  [0069](../adr/0069-keep-an-environments-uploaded-files-in-a-scaleway-project-of-their-own.md)

## Goal

The core keeps the files people upload through a feature. It knows who a file belongs to and
nothing of what it is for: a feature declares the kinds of file it takes and decides who sends and
who reads them; the storage checks the bytes, keeps them and serves them safely. It is built
before the first features that take files, [shop setup](0002-shop-setup.md) and the
[catalog](0003-catalog.md), and brings file uploads into the MVP as far as a feature's spec asks
for them.

## Business rules

Every rule is the team's; none comes from a brief.

### Owners and kinds

| #   | Rule                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | A file has one owner, of a short list the core holds: today an account, a convention, or one of a convention's editions. Whatever a file is shown on belongs to one of them. A further owner is added to the core, never by a feature.                                                                                                                                          |
| D2  | A feature that takes files declares each kind of file in its own spec: its name, its owner, the types it takes among those the storage keeps (K1), a limit on its size below the storage's own if it needs one (K2), and the column of the feature's own table that points at the file. A kind of images also declares its variants ([image variants](0013-image-variants.md)). |
| D3  | The feature owns the routes: the one that takes a file, with the requirement it sets, and the one that serves it, with the feature's own rule of who reads. The storage has no route of its own and decides nobody's access.                                                                                                                                                    |
| D4  | A file is kept for one thing: the row that points at it.                                                                                                                                                                                                                                                                                                                        |

### What the storage keeps

| #   | Rule                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | The storage keeps inert types alone: PDF, JPEG, PNG and WebP. A kind narrows them and never widens them: no HTML, no SVG and no archive is kept for any feature.                                              |
| K2  | A file is at most 15 MB, unless its kind sets a smaller limit.                                                                                                                                                |
| K3  | The storage checks a file against its kind and its content against its declared type before it keeps anything: a file whose bytes are not what its type says is refused.                                      |
| K4  | An image is kept as its master and not as it came ([image variants](0013-image-variants.md)). Any other file is kept byte for byte.                                                                           |
| K5  | A file never changes once it is kept: another content is another file.                                                                                                                                        |
| K6  | A file keeps the name it was uploaded under as a label alone, shown where the feature shows it and offered as the name of a download. Where it lies in the bucket is named by the storage, never by a person. |
| K7  | A convention holds up to 5 GB of files, and an account up to 50 MB.                                                                                                                                           |

### Removing

| #   | Rule                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| X1  | A file goes when what it was kept for goes: with that row, with its edition, with its convention, with its account.                                                      |
| X2  | Bytes of an upload that did not end in a kept file, and a file nothing points at, belong to nothing and are removed within two days, however that came about.            |
| X3  | A removed file stays recoverable by the operators for three months and is gone after that, as a backup is ([PRODUCT.md 10](../PRODUCT.md#10-personal-data-and-privacy)). |

### Serving

| #   | Rule                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | No browser reaches the bucket: every file is uploaded and read through the API.                                                                             |
| S2  | A file is served under the type it is kept as, and as nothing a browser could run or guess at: an image to be shown, a PDF to be downloaded.                |
| S3  | A feature says whether a file it serves is for everyone. One for everyone may be cached for good, since it never changes (K5); any other is cached nowhere. |

### Where the files are

| #   | Rule                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | Each environment has one private bucket of its own. Production's files never leave production; Dev holds demo files; the local stack and CI run an S3-compatible server of their own. |
| W2  | The bucket is in the EU and encrypted at rest. Only the API holds its key, and that key opens that bucket and nothing else.                                                           |
| W3  | With the storage out of reach a route that takes a file says so and keeps nothing, and one that serves a file answers as unavailable. Nothing else of the API stops.                  |

## Shape

### Tables

| Table            | Level  | Holds                                                                                                                                                             |
| ---------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uploaded_files` | tenant | a convention's or an edition's file: `edition_id`, set for an edition's; `kind`, `content_type`, `size`, `sha256`, `name`; `width` and `height`, set for an image |
| `account_files`  | global | an account's file: `account_id`, and the same columns but `edition_id`; it goes with its account                                                                  |

A feature's tenant table points at its file by a composite foreign key to
`uploaded_files (id, tenant_id)`; a table that points at an account's file does so by
`account_files (id)`. For an image the row describes the master.

An object's key in the bucket names the kind of its owner, `tenants` or `accounts`, then the
owner's identifier, then the file's, then the object's name. A file that is no image is one
object; an image is its master and its variants.

### The module

`apps/api/src/modules/files` holds a port, `FileStorage`, with one adapter for S3, the registry of
the kinds the features declared, and the service the features call:

| Operation | Does                                                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `receive` | outside every transaction: checks an upload against its kind (K1–K3), stores its bytes under a new identifier, an image as its master, and answers what it stored |
| `keep`    | in the caller's transaction: writes the row of a file just received, within its owner's limit (K7)                                                                |
| `release` | in the caller's transaction: removes a file's row; its objects go after the commit                                                                                |
| `open`    | answers a kept file's bytes, for an image those of a named variant, with their type, size, name and checksum, inside the owner's context                          |
| `answer`  | turns an opened file into a response with the headers of S2 and the caching of S3                                                                                 |

The adapter speaks S3 through the AWS SDK, with the bucket's address, region, name and key from
the API's environment, validated on start.

A feature that starts to take files, for whatever it shows them on, adds a kind to the registry
and a column to a table of its own. The storage's tables, its service and the sweep stay as they
are.

The owners are one list in this module, and everything that differs between them hangs on it: the
table of an owner's files, the name its keys start with, its limit, and the context its files are
read and written in. A further owner, one that is neither an account nor inside a convention, is
one more entry of that list with a table shaped as the two above. No kept file moves for it, and
no feature and no kind changes.

### A route that takes a file

A feature's route that takes a file is marked as one, and the storage gives it the same shape
whatever the feature:

- The file travels in a JSON body, so the rule that a write with a session cookie has a JSON body
  stays whole ([ARCHITECTURE.md, Sessions and sign-in](../ARCHITECTURE.md#sessions-and-sign-in)).
  Such a route takes a body of up to 21 MB, which a file of 15 MB needs once it is written as
  text; every other route keeps its limit.
- The route's own requirement is judged first: a permission in a convention, or for an account's
  file the session of that account. Then the bytes are received, outside every transaction
  ([ARCHITECTURE.md, API conventions](../ARCHITECTURE.md#api-conventions)). Then the route's one
  transaction keeps the file and writes the row that points at it.
- When that transaction does not commit, the bytes belong to nothing and the sweep removes them
  (X2).
- It refuses with `file.type-refused`, `file.too-large`, `file.limit-reached` and
  `storage.unavailable`, beside its feature's own refusals.
- The routes that take a file share one rate limit an account.

### A route that serves a file

A feature's route that serves a file decides who reads, opens the file and answers it through the
storage. The answer has the stored type, `X-Content-Type-Options: nosniff`, a content security
policy that allows nothing and sandboxes the answer, a resource policy that keeps other sites from
embedding it, and for a PDF a disposition that downloads it under its name.

### The sweep

Once a day the API removes two things, each once it is older than 24 hours. A file's row that the
column its kind names does not point at: the row it was kept for went with something else, such as
its author's account. And an object in the bucket whose file has no row: the bytes of an upload
that did not end in a kept file, and those of a removed file, a deleted edition, a deleted tenant
or a deleted account whose own removal after the commit did not happen. It is the API's first job;
a lock keeps it to one of several API processes.

### Screens

None of its own. The panel and the portal each gain one shared control for choosing a file and
sending it with a form, which says why a file was refused; the screens that use it are the
features'.

### Environment and the local stack

The API's environment holds the bucket's address, region, name and key, named in its
`.env.example` and filled locally by `pnpm stack:init`.

The local S3-compatible server is Versity Gateway: one container, its image pinned by its digest,
that serves a directory of the local stack as the bucket. `pnpm stack:up` starts it beside
Supabase's stack, `pnpm stack:reset` empties its directory, and the `check` and `e2e` jobs of CI
start it the same way.

### Seed

None of its own: a feature's seed keeps its demo files through the same storage.

## Tenant isolation and permissions

- `uploaded_files` is a tenant table under RLS with its own `tenant_id`, a composite foreign key
  to `editions (id, tenant_id)` where a file is an edition's, and an index starting with
  `tenant_id` ([ARCHITECTURE.md, Tenant isolation](../ARCHITECTURE.md#tenant-isolation)).
- `account_files` is a global table, as `accounts` is: no RLS, limited by privileges, and gone with
  its account. The API writes and removes there only a file of the account its session names, and
  the sweep, the API's own job, one nothing points at; it reads another account's file only where
  a feature shows that account, through a tenant row that points at the file.
- An object's key starts with its owner, by kind and identifier: the tenant of the transaction
  context, or the account of the session, never a request's input. A file of another tenant is
  not found by its row, before the bucket is asked.
- A feature's row and its file stay in one tenant by the composite foreign key.
- The storage decides nobody's access: a route that takes or serves a file carries its feature's
  own requirement, as every route carries one
  ([ARCHITECTURE.md, Permissions](../ARCHITECTURE.md#permissions)).
- The sweep reads across tenants through a cross-tenant query of its own, bound as the API's own
  job and returning identifiers alone.
- The bucket's key is a secret of the API's environment. No frontend holds an address or a key of
  the bucket, in its sources or its bundle.
- The API serves bytes a tenant or an account controls from its own origin, where its session
  cookies live. It does so only for the inert types of K1 and under the headers above, which a
  test keeps on every route marked as serving a file.

These sentences of the documents change with the code: in ARCHITECTURE.md, the parts of the
system, which gain the bucket; the API conventions, which gain the body limit of a route that
takes a file and the first job; the global tables and the cross-tenant queries; the environments;
the sessions' note on content a tenant controls; the checklist for adding a feature, which gains
the kind of file. In PRODUCT.md, section 10, which says where files are kept and for how long a
removed one can come back, and section 11, which no longer leaves file uploads beyond the MVP.

## Tests

Integration, in `packages/db/test`:

- RLS on `uploaded_files`, in `covered`; a foreign edition refused by the composite foreign key;
  `account_files` reached by `opos_app` within its listed privileges alone, and gone with its
  account; `verify` fails on each new privilege and on the new cross-tenant read broken once.

Integration, in `apps/api/test`, against the local S3-compatible server, through the service and
kinds declared for the tests, one for each owner:

- A file received and kept: the object lies under its owner's key with the bytes sent, and the
  row holds their size and checksum.
- Each refusal: a type outside the kind, a type outside K1 whatever the kind, an HTML file and an
  SVG declared as an image, a PDF whose content is not one, a file over the limit, the
  convention's limit and the account's reached.
- The storage out of reach: receiving answers `storage.unavailable` and keeps nothing; opening
  answers as unavailable.
- A file of another tenant is not found, and the bucket is not asked. An account's file is kept
  and released for the session's own account alone.
- Releasing: the row gone with the transaction, the object gone after the commit; a transaction
  rolled back keeps both.
- The sweep: an object without a row, 23 and 25 hours old; an object with a row; a row nothing
  points at, and one something does; the objects of a deleted edition, a deleted tenant and a
  deleted account; two processes at the same moment.
- An answer: the headers of an image and of a PDF, the caching of a file for everyone and of any
  other.
- No contract route is marked as taking or serving a file without its feature's requirement, and
  every route marked as serving one answers with the headers.

e2e: none of its own; the scenarios of the features that take files cover it.

## Out of scope

- What a file is for, who sends it and who reads it: the feature's spec.
- What is kept of an image and in what sizes it is shown: [image variants](0013-image-variants.md).
- A browser uploading to the bucket or reading from it directly; a CDN; an origin of its own for
  files.
- Files over 15 MB and uploads in parts.
- Scanning a file for malware.
- Making the bucket and its key in each environment: the deployment does
  ([0012](../adr/0012-host-each-environment-on-a-vps-with-compose-and-traefik.md)).
- Copying the bucket into the backups of
  [0014](../adr/0014-back-up-production-beyond-supabase.md): with the deployment.

## Open questions

- **The provider and the key of a deployed bucket:** Scaleway Object Storage, in a project of its
  own beside each environment's, so that the API's key opens the bucket and nothing else
  ([0069](../adr/0069-keep-an-environments-uploaded-files-in-a-scaleway-project-of-their-own.md));
  Dev's is described in [infra](../../infra/README.md). To confirm with the record.
- **The domain owner:** the team, as written, or a named owner of the core.
- **Proposed values to confirm:** 15 MB a file (K2), 5 GB a convention and 50 MB an account (K7),
  three months recoverable (X3).
- **A feature's seed:** how the seed reaches the bucket, which it does not today.
