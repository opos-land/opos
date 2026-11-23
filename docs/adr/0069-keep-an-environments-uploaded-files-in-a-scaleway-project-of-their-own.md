# 0069. Keep an environment's uploaded files in a Scaleway project of their own

- Status: Accepted
- Date: 2026-11-20

## Context

Each environment has one private bucket of uploaded files, and only the API holds its key, which
opens that bucket and nothing else
([0041](0041-keep-uploaded-files-in-an-s3-bucket-behind-the-api.md),
[the spec of file storage](../specs/0012-file-storage.md), W2). 0041 put the bucket in the
environment's own Scaleway project.

Scaleway grants Object Storage rights to a project as a whole: a key that may use one bucket uses
every bucket of its project. Dev's project already holds a bucket, the one with the OpenTofu state
of every unit, whose values include the passwords of the database roles. A bucket policy narrows
what IAM granted, but it names users and applications, never a group, and once it exists everyone
it leaves out loses the bucket. The operators are a group whose members an administrator changes
outside the repository ([infra/README.md](../../infra/README.md#set-up-an-environment)).

## Decision

- Each environment's bucket of uploaded files lies in a Scaleway project that holds it alone,
  beside the environment's own project, in the same region of the EU.
- The bootstrap, which an administrator of the organisation runs once per environment with the
  Scaleway CLI, makes that project and writes its id into the environment's `env.yaml`, as the
  environment's own project is made outside the units and named there.
- The `shared` unit, applied by an administrator, makes an IAM application for the API that may
  read, write and delete objects in that project and nothing else, and its key. The secret key
  goes straight into the environment's Secret Manager, never into the state. The key's default
  project is the bucket's.
- The operators' group gets full Object Storage rights in that project, to keep the bucket's
  settings and restore a removed file.
- The `files` unit, applied by the operators, makes the bucket: private, encrypted at rest under
  keys Scaleway manages, versioned, with an earlier version kept for three months.
- No bucket policy: the project keeps every other key away from the bucket, and the API's key
  away from every other bucket.

## Alternatives

- **The bucket in the environment's project, with a policy on every other bucket.** One project
  fewer, but the state's bucket would need a policy naming each operator, changed on every grant
  and revoke, and every bucket added later would be open to the API's key until it got one.
- **A bucket policy on the bucket of files alone.** It narrows who reaches the files, but not
  what the API's key reaches: the state's bucket stays open to it. It would also have to name each
  operator by user, for the same reason as above.
- **A key whose IAM rule is narrowed to one bucket.** Scaleway's IAM scopes Object Storage to a
  project; it has no rule for one bucket.
- **The project made by the `shared` unit.** One tool for everything the administrator makes, but
  a project that holds the files would sit one destroy away in a unit's state, and the units would
  read its id from that state, while the operators may not list the organisation's projects.
- **The state in a project of its own instead.** The same isolation, but it moves every unit's
  state and the passphrase's secret, which the bootstrap and every run assume, for the sake of a
  bucket that is new.

## Consequences

- An environment is two Scaleway projects. Making one takes the bootstrap and an administrator's
  apply of `shared` before the operators apply `files`, and the deployment reads the key only after
  both.
- The API's key cannot change the bucket's settings, versions or policy; a removed file comes back
  only through an operator.
- Rotating the key is raising its version in `env.yaml`, an administrator's apply of `shared`,
  then an apply of the rest, as for the SMTP key.
- Production follows the same shape with its own two projects, once its hosting is decided.
