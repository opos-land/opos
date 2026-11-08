# 0006. Define the API in an oRPC contract with zod

- Status: Accepted
- Date: 2026-10-24

## Context

The API, the panel and the portal share one TypeScript monorepo. The API's shape was a ts-rest
contract with no build step, from which the frontends inferred their types. ts-rest had had no
stable release since March 2025, and its peer dependency pinned zod 3, which kept the repository off
zod 4 and its fixes.

## Decision

- `packages/contract` holds an oRPC contract with zod 4 schemas, the single source of the API's
  shape, consumed from TypeScript source with no build step.
- Every route starts from `publicRoute`, `accountRoute` or `tenantRoute` of `common.ts`, which set
  its OpenAPI security, the tenant header and the error responses.
- The API implements each route with `@Implement` of `@orpc/nest`; the OpenAPI document and the
  public documentation at `/docs` are generated from the contract.

## Alternatives

- **Staying on ts-rest.** No stable release in over a year, and zod 3 pinned by its peer
  dependency.
- **A hand-written OpenAPI document with generated clients.** A second source of truth and a build
  step between the API and the frontends.

## Consequences

- A route, its input and its errors change in one place, and a frontend that uses them wrongly fails
  its typecheck.
- The tests read the contract: a route not served or not listed with its permission fails the
  suite.
- `@orpc/nest` sends its response from inside its own interceptor, so a hook holds it until the
  tenant transaction has committed
  ([0007](0007-run-each-tenant-request-in-one-transaction.md)).
- oRPC reads an unparsed body straight from the stream with no size limit, so a request whose body
  is not JSON answers `415` before routing.
- `/health` stays a plain Nest route, since oRPC answers a status outside 2xx only with an error.

## Sources

- PR #25, "move the api contract from ts-rest to orpc".
