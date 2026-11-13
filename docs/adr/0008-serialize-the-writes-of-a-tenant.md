# 0008. Serialize the writes of a tenant: check, queue, lock, check again

- Status: Accepted
- Date: 2026-10-25

## Context

A write checked the actor's membership and then ran. A demotion or an expiry that committed while
the write waited did not stop it: `PATCH /tenants/current` and every edition write went through,
and two lock orders could deadlock. Taking a lock fixed that, but a write then waited for its
tenant's lock without limit while holding a pool connection, so one busy tenant could take the whole
pool from every other tenant. An org whose access ended while its request waited for a row lock
still passed the check on the locked row.

## Decision

A route at `write` goes through three steps:

| Step  | What happens                                                                                                                                          |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| check | a short transaction reads the membership and checks it; a refused write ends here and never waits                                                     |
| queue | the write waits in its tenant's queue inside the API process, in arrival order and without a database connection; `503` `request.busy` past the bound |
| lock  | its transaction takes the tenant's advisory write lock, reads the membership again and checks it, then runs the handler; `503` past the lock timeout  |

- Every route that lowers a member's access is a write route, so it waits for and stops the writes
  behind it; reads neither queue nor lock.
- Expiry is measured when the read runs (`statement_timestamp()`), and a read that decides access
  after waiting for a row lock runs in a statement of its own, after the wait.

The rules are in [ARCHITECTURE.md, Permissions](../ARCHITECTURE.md#permissions).

## Alternatives

- **A check before the write only.** A change of access that commits meanwhile is ignored.
- **The advisory lock alone.** Correct, but waiting writes hold pool connections, and one tenant
  starves the others.
- **Row locks alone** (the state before). Two of their lock orders deadlocked, and a write that took
  none was never stopped.

## Consequences

- A tenant's writes run one at a time: simple to reason about, and enough for one convention's
  team; a tenant with heavy concurrent writes would feel it first.
- The queue orders writes within one process; the advisory lock stays the guarantee across
  processes.
- A refused write answers at once, without waiting for the queue.
- Every write route judges its actor again under the lock, and the tests check it per route.

## Sources

- PR #35, "cover rls and rbac and require a test with every change".
- PR #38, "bound the wait for the tenant write lock".
- PR #43, "check member expiry after waiting for row locks".
