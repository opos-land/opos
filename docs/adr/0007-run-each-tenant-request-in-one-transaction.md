# 0007. Run each tenant request in one transaction that holds its permission check

- Status: Accepted
- Date: 2026-10-23

## Context

RLS reads the tenant from a setting of the transaction
([0002](0002-isolate-tenants-by-row-under-postgres-rls.md)), so nothing tenant-scoped can run
before it is set. Permission guards ran before any transaction opened, so the membership they
checked was read outside the state the handler then wrote. The contract library of the time
returned a `4xx` as a value, not an exception, so a rule "commit when nothing was thrown" would
have kept the partial writes of a refused request. An email sent inside a transaction goes out even
when the transaction then rolls back.

## Decision

- A tenant request is one transaction on `opos_app`: the interceptor resolves the tenant, opens the
  transaction with `set_config('app.tenant_id', …, true)`, loads the membership and checks the
  route's permission in that same transaction, then runs the handler.
- It commits only when the response status is below `300`; an exception or any other status rolls
  it back. The response waits for the commit.
- Outbound I/O never runs inside the transaction: it waits for the commit (`afterCommit`), and a
  send the business cannot lose keeps an outbox.
- A request without the tenant header opens its tenant context through `withTenant`, from a lookup
  across tenants or a verified token.

The rules are in [ARCHITECTURE.md, Tenant isolation](../ARCHITECTURE.md#tenant-isolation) and
[API conventions](../ARCHITECTURE.md#api-conventions).

## Alternatives

- **Permission guards before the transaction** (the design before). A read runs before the tenant
  context exists, and the check and the write see different states.
- **Commit unless an exception was thrown.** A refused request returned as a value keeps what it
  wrote before the refusal.
- **Outbound calls inside the transaction.** An email or a payment call for a write that never
  commits.

## Consequences

- A repository takes its transaction from `TenantContextService.tx()`, which throws outside one.
- A failure of an after-commit step is logged while the response stands, since the write has
  committed.
- A request holds a pool connection for its whole length, which bounds the writes of one tenant
  ([0008](0008-serialize-the-writes-of-a-tenant.md)).
- After the move to oRPC, a hook holds oRPC's response until the commit
  ([0006](0006-define-the-api-in-an-orpc-contract.md)).

## Sources

- PR #11, "rework the tenant transaction and ship pl translations".
- PR #25, "move the api contract from ts-rest to orpc".
