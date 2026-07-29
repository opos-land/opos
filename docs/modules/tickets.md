# Module: `tickets`

## 1. What it does

The convention defines what can be bought — a weekend pass, a Saturday pass, a supporter ticket —
with prices and sale windows, and attendees buy through the convention website, the portal or the
application. A paid order issues tickets with codes and registers the buyer as an attendee of the
edition.

The money never passes through OPOS. The shop configuration points at a payment provider account
belonging to the convention, the payment happens there, and OPOS learns the result from the
provider's callback ([PRODUCT.md 4](../PRODUCT.md#4-business-model--tenant-and-edition)).

In the MVP: not present.

## 2. Terms

| Term | Meaning |
|---|---|
| **ticket type** | what is on sale: name, price, sale window |
| **order** | one purchase: an account, ticket types and quantities, one payment |
| **ticket** | a single admission issued by a paid order, with its own code and holder |
| **shop configuration** | the convention's payment provider account, at tenant level |

## 3. Flows

| Actor | Action | Effect |
|---|---|---|
| org, tenant `shop=write` | configures the provider and currency | the shop can be opened; secrets are stored encrypted and never returned by the API |
| org, `write` | defines a ticket type | invisible until its sale window opens |
| user | picks types and quantities | an order in status `pending`, waiting for a payment for `ORDER_TTL` |
| user | pays at the provider | the callback moves the order to `paid`, tickets are issued, the buyer becomes an `attendee` of the edition |
| user | abandons the payment | after `ORDER_TTL` the order becomes `expired` and stops waiting |
| user | opens the portal or the application | sees their tickets with codes and holder names |
| user | edits a holder's name | allowed while the ticket is `issued` and the edition has not started |
| org, `write` | confirms a payment | the order becomes `paid` and its tickets are issued, exactly as the callback would have done |
| org, `write` | cancels an order | tickets go to `cancelled`; the refund itself is made in the provider's own panel |
| org, `write` | issues a free ticket | a type priced at zero skips the provider entirely — the order is `paid` on creation |
| org, `read` | opens sales | sees the order list and tickets sold per type |

**The callback is not the only way in.** When the provider reports nothing — an outage, a rejected
signature, a notification that never arrives — an organizer who can see the money at the provider
confirms the order by hand, and everything a callback would have done happens: the same tickets and
the same `attendees` row. `pending` and `expired` orders can be confirmed; a `cancelled` one
answers `409`.

A type whose sale window has closed stays visible with sales shut, because a convention that has
stopped selling says so.

## 4. Permissions

Resource `tickets`, edition level. The provider account sits behind the tenant-level `shop`
resource, which already exists — one shop serves every edition.

| Level | Allows |
|---|---|
| `read` | ticket types, orders, tickets, sales figures, buyers' names and email addresses |
| `write` | everything in `read`, plus defining and editing types, changing prices and windows, confirming payments, cancelling orders and issuing free tickets |

## 5. Data

**`tenant_shop_configs`** — at most one per tenant.

| Column | Type | Notes |
|---|---|---|
| `tenantId` | uuid | FK cascade; unique |
| `provider` | text | the provider identifier, validated against the list in `packages/contract` |
| `currency` | text | ISO 4217, `PLN` in the first market |
| `merchantId` | text | the convention's account at the provider |
| `secretEncrypted` | text | encrypted with a key from the API environment; write-only through the API |
| `isEnabled` | boolean | default `false` — nothing sells before it is switched on |

**`ticket_types`**

| Column | Type | Notes |
|---|---|---|
| `tenantId`, `editionId` | uuid | FK cascade |
| `name` | text | 1-100 characters |
| `description` | text | nullable, up to 2000 characters |
| `priceMinor` | integer | in minor units; `0` means a free type |
| `salesStartAt`, `salesEndAt` | timestamptz | nullable |
| `position` | integer | display order, default `0` |

Unique `(editionId, name)` and `(id, tenantId)`.

**`ticket_orders`**

| Column | Type | Notes |
|---|---|---|
| `tenantId`, `editionId`, `accountId` | uuid | FK cascade |
| `status` | text | `pending` \| `paid` \| `expired` \| `cancelled` |
| `totalMinor` | integer | the sum at the moment of creation; a later price change does not move it |
| `currency` | text | copied from the shop configuration |
| `providerOrderId` | text | nullable — the provider's identifier |
| `expiresAt`, `paidAt`, `cancelledAt` | timestamptz | nullable |

Index `(tenantId, editionId, status)` and `(accountId)`.

**`tickets`**

| Column | Type | Notes |
|---|---|---|
| `tenantId`, `editionId`, `orderId`, `ticketTypeId` | uuid | FK cascade |
| `code` | text | unique platform-wide, random, 12 characters — the future entry code |
| `holderFirstName`, `holderLastName` | text | the buyer's own by default, editable per ticket |
| `state` | text | `issued` \| `cancelled` |

Index `(tenantId, editionId)` and unique `(code)`.

**Invariants.** Issuing tickets happens once per order: a payment reported twice, or reported by
the callback and confirmed by hand, still leaves exactly the tickets the order was placed for. A
paid order creates the missing `attendees` row for the buyer; cancelling the order does not remove
it, because attendance and payment are separate facts. Nothing counts places sold against a limit —
there are no limits ([7](#7-out-of-scope)).

## 6. API

| Method | Path | Who |
|---|---|---|
| GET | `/public/tenants/:slug/editions/:editionSlug/ticket-types` | anyone — types on sale |
| POST | `/me/ticket-orders` | the buyer |
| GET | `/me/ticket-orders` | the buyer |
| GET | `/me/tickets` | the buyer |
| PATCH | `/me/tickets/:ticketId` | the buyer — the holder's name |
| POST | `/payments/:provider/callback` | the provider — unauthenticated, verified by signature |
| GET, POST, PATCH, DELETE | `/editions/:editionId/ticket-types[/:typeId]` | `tickets>=read` / `tickets=write` |
| GET | `/editions/:editionId/ticket-orders` | `tickets>=read` |
| POST | `/editions/:editionId/ticket-orders/:orderId/confirm` | `tickets=write` — a payment the callback never reported |
| POST | `/editions/:editionId/ticket-orders/:orderId/cancel` | `tickets=write` |
| POST | `/editions/:editionId/tickets/issue` | `tickets=write` — a free ticket without a purchase |
| GET, PUT | `/tenants/current/shop` | `shop>=read` / `shop=write` |

The callback is idempotent, and so is confirming by hand: a repeated notification or a confirmation
of an order already `paid` answers `200` and changes nothing. `GET /tenants/current/shop` never
returns the secret.

## 7. Out of scope

- **Entry, scanning codes, printing badges** — planned as its own module; `tickets.code` exists so
  it can be added without reissuing anything.
- **Refunds.** OPOS records a cancellation; the money is returned by the organizer in the
  provider's panel, because the money was never here.
- **Sales limits and reservations.** A ticket type has no pool: nothing caps how many are sold,
  nothing is held back while an order is `pending`, and nothing sells out. A convention that has to
  stop selling closes the sale window.
- **A limit per buyer.** Nothing caps how many tickets one account may buy, free types included.
- **A ticket bought for someone else reaching their account.** A paid order registers only the
  buyer as an `attendee`; the other tickets carry their holders' names and nothing more — no
  account, no "my conventions", no application.
- **Invoices for buyers, VAT, accounting exports.**
- **Discount codes, seat selection, bundles.**
- **Signing up for an edition without paying** — that is the core `attendees` registration.
