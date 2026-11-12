# 0031. Suspend a tenant before deleting it, and delete it at once and for good

- Status: Proposed
- Date: 2026-11-12

## Context

The admin is to take a convention off the platform for a while and to remove one for good
([0029](0029-ship-four-web-applications.md)). Neither had a rule: a tenant had no state, and its
row could be deleted only by hand, as `postgres`. Everything a tenant owns hangs on that row,
while the accounts are global and belong to nobody's convention
([ARCHITECTURE.md, Tenant isolation](../ARCHITECTURE.md#tenant-isolation)).

A convention is taken off when its head's account may be in the wrong hands, when it breaks the
platform's terms or when it parts with OPOS. In the first case nobody of the convention may read
its attendees' data until the matter is settled.

## Decision

- **A suspended tenant is off for everyone but the admin.** Its page is not found in the portal, a
  user's personal schedule leaves its programme items out, and its organizers get one answer in the
  panel, that the convention is suspended: no read and no write. A membership stays and shows the
  convention as suspended.
- **A suspension is always reversible.** An admin restores the tenant, and everything is as it was.
- **Only a suspended tenant can be deleted.** The deletion is immediate and permanent, and takes
  everything the tenant owns: its team, editions, programme and likes. The accounts stay.
- **The deletion asks, in its modal, for the tenant's address typed in.** This is the exception to
  [0023](0023-ask-in-a-modal-before-an-action-that-cannot-be-undone.md), which turned typing down
  as more than the risk asked for: no other action takes away as much. Suspending and restoring ask
  nothing, since the same screen reverses them.
- **No email goes to the heads** when their tenant is suspended, restored or deleted: the admin
  tells them.
- The suspension is the API's rule, checked wherever a tenant is entered: when a tenant's
  transaction opens and when a tenant is looked up by its address.

## Alternatives

- **Deleting any tenant directly.** One modal would stand between a mistake and every edition of a
  convention. A suspension shows first, and reversibly, what the deletion takes away.
- **A soft deletion with a time to restore.** It needs a background job the API does not have, and
  a state, deleted but present, that every query has to leave out. The suspension is that time, for
  as long as the admin keeps it.
- **A suspension that leaves the organizers reading.** It would not stop a head's account in the
  wrong hands from reading the attendees' data.
- **A suspension that only stops writes.** The convention would stay public while the reason for
  suspending it stands.
- **Emails to the heads.** Three messages in every interface language for what a few admins do
  rarely, to heads they know.
- **The suspension in the RLS policy.** A covered table has one policy, the tenant's
  ([0002](0002-isolate-tenants-by-row-under-postgres-rls.md)), and a second condition in it would
  have to hold for the admin's own work on the suspended tenant too.

## Consequences

- Not built yet.
- Every way into a tenant checks the suspension. A module built later gets the check by working in
  the tenant's transaction, where every repository of a tenant table already works.
- The database's own roles are not held back by a suspension: it guards what the applications
  reach, as the permissions do.
- The last head of a suspended tenant can neither hand the role over nor delete their account, and
  asks the admin.
- The spec of the tickets module says what deleting a tenant does to its orders, which stay as the
  convention's sales records when an account goes
  ([PRODUCT.md 10](../PRODUCT.md#10-personal-data-and-privacy)); until then a deletion takes
  everything.
- A deleted tenant stays in the backups for as long as they are kept.
- Whether the address of a deleted tenant is free at once is open in the spec.
