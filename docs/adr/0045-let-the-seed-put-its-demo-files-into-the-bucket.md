# 0045. Let the seed put its demo files into the bucket

- Status: Proposed
- Date: 2026-11-19

## Context

Uploaded files lie in one private bucket an environment, behind the API, which alone holds the
bucket's key ([0041](0041-keep-uploaded-files-in-an-s3-bucket-behind-the-api.md)). The spec of
[file storage](../specs/0012-file-storage.md) left open how a feature's seed reaches the bucket,
since no seeded feature kept a file.

The [shop's setup](../specs/0002-shop-setup.md) is the first: a version of a legal document is a
PDF, and its seed asks for a demo edition with documents and an open shop. A seeded version whose
row points at no object answers its link with an error, on the one page of the demo a buyer is
sent to read.

The seed is a `db:*` script of `packages/db`. It runs as `postgres`, with the Supabase secret
key, on `local` and `dev` alone, where the API need not be running: CI seeds before it starts
anything.

## Decision

- The seed puts the files of its demo rows into the bucket itself, after the transaction that
  wrote the rows, under the keys the API's storage reads. A file already there is put again, so a
  bucket that lost one gets it back.
- For that the seed holds the bucket's address and key, on `local` and `dev`. `pnpm infra:init`
  gives `packages/db` the key it gave the API. Production, which the seed refuses, keeps the key
  with the API alone.
- A demo file is made by code from text, the same bytes on every run. No file enters the
  repository.
- An API test reads a seeded file through its public route, so the seed's keys and the storage's
  cannot drift apart unseen.

## Alternatives

- **Rows without objects.** The demo shop would link documents that answer `503`.
- **The seed uploads through the API**, signed in as the demo head. The API would have to run
  wherever the seed does, and CI and a new checkout seed before it starts.
- **The API puts demo files on start**, on `local` and `dev`. Demo data would get a path through
  the code of production.
- **The storage moved into a shared package**, for the seed to call. The storage is the API's:
  its limits, its check of a file's bytes and its images go through services the seed does not
  run. One line that names a key does not justify the move.

## Consequences

- 0041's "the API alone holds the key" holds on production, and for every browser and
  application everywhere. On `local` and `dev` a second holder exists, one that already holds the
  database's most powerful role.
- The layout of a key is written twice, in the storage and in the seed, with the test above
  between them.
- A seeded file skips the storage's checks of type, size and limit. The seed writes only files it
  makes itself, as inert PDFs.
- Seeding Dev needs the bucket's variables beside the database's. Dev's bucket is not built yet
  ([ARCHITECTURE.md](../ARCHITECTURE.md#applications-and-packages)).

## Sources

- [File storage](../specs/0012-file-storage.md), its open question on a feature's seed.
