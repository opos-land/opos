# Shop setup

- Status: Draft
- Domain owner: the domain owner of tickets ([CONTRIBUTORS.md](../../CONTRIBUTORS.md))
- Brief: [0001](../briefs/0001-convention-shop.md), B1.4 and the requirements it leans on
- Decisions: [0044](../adr/0044-seal-payment-provider-credentials-with-a-key-of-the-apis-environment.md),
  [0045](../adr/0045-let-the-seed-put-its-demo-files-into-the-bucket.md); the records it still
  needs are among its [open questions](#open-questions)

## Goal

What a convention sets before an edition sells anything: its payment provider account and its
seller's details, once for the convention, and for each edition the legal documents, the consents
and the switch that opens its shop. It serves the first half of step 4 of the MVP flow
([PRODUCT.md 2](../PRODUCT.md#2-mvp-goal-and-end-to-end-flow)), connecting the convention's own
payment provider account; putting tickets on sale needs the [catalog](0003-catalog.md) too.

It is the first spec of the tickets module, so it carries the module's domain owner into the
documents and starts the module's glossary. It builds on [file storage](0012-file-storage.md),
which is built before it.

## Business rules

The **Brief** column names where a rule comes from; "new" marks a rule this draft adds for the
domain owner to confirm.

### Provider account

| #   | Rule                                                                                                                                                                                                                                                                            | Brief                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| P1  | A convention is paid into one payment provider account, its own. OPOS holds no money and no provider account of its own.                                                                                                                                                        | BR-01, BR-15                                 |
| P2  | An org with shop write access connects the account by giving the provider's credentials. They are stored encrypted with a key the API alone holds and are never shown again: the panel shows only the provider, when the account was connected and whether it is ready to sell. | BR-15, the contract with a provider's module |
| P3  | Connecting asks the provider's module to check the credentials with the provider. Refused credentials store nothing; a provider out of reach stores nothing and says so.                                                                                                        | the contract with a provider's module        |
| P4  | An account is ready to sell once its credentials passed and the conditions its provider's module sets hold; the module says which are missing.                                                                                                                                  | B1.4                                         |
| P5  | Giving credentials again replaces the stored ones, after the same check. It is refused while an order of the convention awaits payment: a payment under way is confirmed with the credentials it started with.                                                                  | new                                          |
| P6  | An org with shop write access disconnects the account, which removes its credentials. Disconnecting is refused while a shop of the convention is open, and while an order of the convention awaits payment, as P5 refuses new credentials.                                      | new                                          |
| P7  | An account is connected only to a provider the environment has a module of; the panel offers those and no other.                                                                                                                                                                | new                                          |
| P8  | Credentials that leave the account not ready are refused while a shop of the convention is open.                                                                                                                                                                                | new                                          |
| P9  | A convention checks credentials with its provider up to 20 times an hour.                                                                                                                                                                                                       | new                                          |

### Seller's details

| #   | Rule                                                                                                                                                                                             | Brief                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| S1  | The seller's details are the name, the address and the register or tax number of the legal entity running the convention. An org with shop write access sets them.                               | B1.4                                                        |
| S2  | The convention sells in one currency: PLN in the first shop.                                                                                                                                     | BR-01                                                       |
| S3  | The convention gives one contact address, set with the seller's details and shown in the shop's footer and in the emails that name "the convention's contact".                                   | new; F1.1 and the emails name a contact and no rule sets it |
| S4  | The shop's footer and the order confirmation show the seller's details: a buyer's contract is with the convention, not with OPOS.                                                                | F1.1, the order confirmation                                |
| S5  | The seller's details are complete once the name, the address, the register or tax number and the contact address are set. They cannot be made incomplete while a shop of the convention is open. | B1.4; the second sentence is new                            |

### Documents and consents

| #   | Rule                                                                                                                                                                                           | Brief                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| D1  | An edition holds its legal documents. Each has a kind (shop terms, privacy policy, edition rules or other), a title and one or more versions.                                                  | BR-01, BR-13                 |
| D2  | A version is an uploaded file, a PDF, published once and never changed: a changed document is a new version. The shop links the newest version; an order keeps the version its buyer accepted. | NF-07; the file is new       |
| D3  | A published version stays readable by its link for as long as its convention is on the platform, also once its document is hidden: a buyer reads what they accepted.                           | new; follows NF-07           |
| D4  | An edition holds its consents. Each has the sentence the buyer accepts, the document it links, whether it is required or optional, and its place in the list.                                  | BR-13, F5.2                  |
| D5  | The shop treats documents and consents as given: their kind and wording are the convention's. OPOS ships no text of its own and marks no consent as required by itself.                        | BR-13                        |
| D6  | A consent an order has accepted, and a document with such a consent, is never deleted: it is hidden from the shop and stays on its orders.                                                     | NF-07                        |
| D7  | An org with tickets write access to the edition sets its documents and consents.                                                                                                               | B1.4                         |
| D8  | An edition may give the address of its FAQ, linked from the shop's footer.                                                                                                                     | F1.1; where it is set is new |
| D9  | An edition holds up to 30 documents, a document up to 50 versions, an edition up to 20 consents.                                                                                               | new                          |
| D10 | A consent links its document for good: another link is a new consent. A document a consent links is not deleted while that consent is there.                                                   | new                          |

### Opening the shop

| #   | Rule                                                                                                                                                                                                                                                 | Brief                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| O1  | An org with tickets write access to the edition opens and closes its shop.                                                                                                                                                                           | B1.4                                                                   |
| O2  | Opening is refused unless the convention's provider account is ready (P4), its seller's details are complete (S5) and the edition has a published version of each document opening requires (O3). The refusal names every condition that is missing. | B1.4                                                                   |
| O3  | Opening requires the shop terms and the privacy policy; the edition rules are optional.                                                                                                                                                              | new; B1.4 says "the edition's required legal documents" and names none |
| O4  | An edition is published without an open shop, and a shop is opened on an edition not yet published. Buyers reach the shop only while the edition is published and its shop is open.                                                                  | B1.4                                                                   |
| O5  | Hiding or deleting the last document that stands for a kind opening requires is refused while the shop is open.                                                                                                                                      | new                                                                    |
| O6  | Closing the shop stops new orders only: an order already placed is paid, expires and is settled as before.                                                                                                                                           | new                                                                    |
| O7  | The edition's shop screen shows each condition of O2 as met or missing. An org without the shop permission learns only that much of the convention's provider account and seller's details.                                                          | UR-10; the second sentence is new                                      |

## Shape

### Tables

| Table                       | Level   | Holds                                                                                                                                     |
| --------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `shop_sellers`              | tenant  | one row a tenant: `seller_name`, `seller_address`, `seller_registration_number`, `contact_email`, `currency` (only `PLN`)                 |
| `payment_provider_accounts` | tenant  | one row a tenant: `provider`, `credentials` (encrypted), `ready_at`, empty while the account is not ready                                 |
| `edition_shops`             | edition | one row an edition: `opened_at`, empty while the shop is closed; `faq_url`. The later specs of the module add their edition settings here |
| `edition_documents`         | edition | `kind`, `title`, `hidden_at`                                                                                                              |
| `edition_document_versions` | edition | `document_id`, `number`, counted from 1 within its document, `file_id`, `published_at`                                                    |
| `edition_consents`          | edition | `document_id` (optional), `text`, `is_required`, `position`, `hidden_at`                                                                  |

### Files

This spec declares one kind of file to [file storage](0012-file-storage.md): a legal document. It
is an edition's, a PDF of up to 10 MB, and `edition_document_versions.file_id` points at it. The route that
publishes a version takes the file and needs tickets write access; the public route below serves
a published version to everyone, as a download.

### Provider port

The API holds one port for payment providers, in `apps/api/src/modules/payments`. This spec uses
one operation of it; [checkout and orders](0004-checkout-and-orders.md) defines the rest.

| Operation | Does                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `connect` | checks the given credentials with the provider and answers ready, not ready with the conditions missing, refused, or out of reach |

A fake provider implements the port on `local` and `dev` alone
([ARCHITECTURE.md, Environments](../ARCHITECTURE.md#environments)): it accepts any credentials but
one value it refuses and one it reports as not ready, so every answer has a test.
[Przelewy24](0005-przelewy24.md) is the first real provider.

The key that encrypts the credentials is a secret of the API's environment, validated on start.
The call to the provider runs outside the request's transaction.

### Routes

Tenant routes:

| Route                                                        | Needs         | Refuses with                                                                                                     |
| ------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /shop/seller`                                           | shop>=read    |                                                                                                                  |
| `PUT /shop/seller`                                           | shop=write    | `shop.open` when the change makes the details incomplete                                                         |
| `GET /shop/provider-account`                                 | shop>=read    |                                                                                                                  |
| `PUT /shop/provider-account`                                 | shop=write    | `provider.credentials-refused`, `provider.unavailable`, `shop.payments-under-way`                                |
| `DELETE /shop/provider-account`                              | shop=write    | `shop.open`, `shop.payments-under-way`                                                                           |
| `GET /editions/{editionId}/shop`                             | tickets>=read |                                                                                                                  |
| `PATCH /editions/{editionId}/shop`                           | tickets=write |                                                                                                                  |
| `POST /editions/{editionId}/shop/open`                       | tickets=write | `shop.not-ready`, its `params` naming the missing conditions                                                     |
| `POST /editions/{editionId}/shop/close`                      | tickets=write |                                                                                                                  |
| `GET /editions/{editionId}/documents`                        | tickets>=read |                                                                                                                  |
| `POST /editions/{editionId}/documents`                       | tickets=write | `document.too-many`                                                                                              |
| `PATCH /editions/{editionId}/documents/{documentId}`         | tickets=write | `shop.open` when it hides a required document                                                                    |
| `POST /editions/{editionId}/documents/{documentId}/versions` | tickets=write | `document.too-many-versions`, `file.type-refused`, `file.too-large`, `file.limit-reached`, `storage.unavailable` |
| `DELETE /editions/{editionId}/documents/{documentId}`        | tickets=write | `document.in-use`, `shop.open` when it is a required document                                                    |
| `GET /editions/{editionId}/consents`                         | tickets>=read |                                                                                                                  |
| `POST /editions/{editionId}/consents`                        | tickets=write | `consent.too-many`                                                                                               |
| `PATCH /editions/{editionId}/consents/{consentId}`           | tickets=write |                                                                                                                  |
| `DELETE /editions/{editionId}/consents/{consentId}`          | tickets=write | `consent.in-use`                                                                                                 |

`GET /shop/provider-account` answers the provider, `ready_at` and the conditions missing, never the
credentials, and the providers the environment can connect (P7). `GET /editions/{editionId}/shop`
answers whether the shop is open and each condition of O2 as a yes or a no.

`shop.payments-under-way` (P5, P6) and `consent.in-use` (D6) are refusals an order causes, built
with [checkout and orders](0004-checkout-and-orders.md). `document.in-use` refuses the deletion
of a document a consent links (D10). `PUT /shop/provider-account` also refuses with
`shop.open` (P8) and `request.rate-limited` (P9). `PATCH …/consents/{consentId}` takes the
sentence, whether it is required, the place and whether it is hidden, never the document (D10).

One public route, without sign-in:

| Route                                                      | Answers                                                                            |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /public/tenants/{slug}/document-versions/{versionId}` | the file of a published version (D3), kept by no cache; anything else as not found |

### Screens

The panel:

| Screen                          | Holds                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| convention settings, shop       | the seller's details; the provider account: connect, replace, disconnect, and whether it is ready |
| edition, shop                   | the conditions of O2; opening and closing; the FAQ address                                        |
| edition, documents and consents | the documents with their versions; the consents in their order                                    |

Disconnecting the provider account asks first in a modal: no screen brings the credentials back
([0023](../adr/0023-ask-in-a-modal-before-an-action-that-cannot-be-undone.md)).

### Seed

A demo tenant with complete seller's details, a ready account of the fake provider, and an edition
with its documents, consents and an open shop; a second edition with a closed shop and one
condition missing. The seed puts the documents' files into the bucket itself
([0045](../adr/0045-let-the-seed-put-its-demo-files-into-the-bucket.md)).

## Tenant isolation and permissions

- The six tables are tenant tables under RLS, each with its own `tenant_id`, a composite foreign
  key to its parent and an index starting with `tenant_id`
  ([ARCHITECTURE.md, Tenant isolation](../ARCHITECTURE.md#tenant-isolation)). `opos_app_global`
  gains one column, `edition_document_versions.file_id`: the sweep of files tells a version's file
  from one nothing points at, as for every kind of file.
- `opos_app` reads `payment_provider_accounts.credentials`, since the API decrypts them to call the
  provider; no route's answer carries the column, and a test of the contract keeps it so. The
  credentials are sealed for their tenant and provider: copied into another row, they open nothing.
- A version's file is its own edition's: the foreign key runs through the tenant and the edition.
- A version's file belongs to its tenant: the public route opens the tenant from its slug and
  answers a version of another tenant, and any version of a suspended one, as not found.
- The provider account and the seller's details need `shop`, the edition's shop, documents and
  consents `tickets`. A tenant-level permission grants no edition-level one: an org with `tickets`
  alone reads the convention's readiness as the yes or no of O7, and an org with `shop` alone
  opens no shop.
- Every route at `write` judges its actor again under the tenant's write lock
  ([0008](../adr/0008-serialize-the-writes-of-a-tenant.md)); opening the shop reads its three
  conditions under that lock.

These sentences of the documents change with the code: PRODUCT.md 7, ARCHITECTURE.md "Modules
waiting for their domain owner" and AGENTS.md no longer list tickets as waiting for its owner; the
glossary gains shop and consent, with their `pl` renderings in `glossary.ts`.

## Tests

Integration, in `packages/db/test`:

- RLS on the six tables, each in `covered`, and an insert with another tenant's identifier
  refused; `verify` fails on each new privilege broken once.
- One seller row and one provider account a tenant, one shop row an edition; a version's number is
  unique within its document; the seed, run twice, changes no row count.

Integration, in `apps/api/test`:

- Every route against every actor of the permission matrix.
- The credentials: never in an answer; refused ones store nothing; a provider out of reach stores
  nothing; replaced ones are checked again, and refused while an order awaits payment.
- Opening: refused for each missing condition and for all three, each named; allowed once they
  hold, on a published and on an unpublished edition.
- While a shop is open: disconnecting, making the seller's details incomplete and hiding a
  required document are refused; with the shop closed they pass.
- A version: a file that is not a PDF, one over the limit and one whose content is not what its
  type says are refused; a published one cannot be changed; the public route serves it to anyone
  as a download, also once its document is hidden, and serves another tenant's as not found.
- A consent or a document an order accepted cannot be deleted, and can be hidden.

e2e, each scenario making its own tenant and accounts and checking the BFF boundary:

1. A head connects the fake provider, sets the seller's details, adds the documents and consents
   and opens the shop.
2. An org with tickets write access alone sees the conditions as met or missing, and neither the
   seller's details nor the provider account.
3. Opening with a condition missing is refused and says which.
4. An org with shop read access sees the provider account without its credentials and can change
   nothing.

## Out of scope

- Keeping a file, its upload and its bucket: [file storage](0012-file-storage.md).
- How a provider processes a payment: [checkout and orders](0004-checkout-and-orders.md) and
  [Przelewy24](0005-przelewy24.md).
- What the shop sells: [catalog](0003-catalog.md).
- A second provider, and a provider chosen per edition
  ([PRODUCT.md 11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp)).
- A new edition made from the previous one's setup; named org roles on top of the permissions.
- The convention's taxes and fiscal duties, and any text of a legal document.

## Open questions

- **Records before acceptance:** the documents saying convention and organizer (D10 of the brief),
  which changes the terms this spec is written in; Przelewy24 as the MVP's provider (D3), with
  [Przelewy24](0005-przelewy24.md). The module having its domain owner (D1) is carried into the
  documents with this spec's code; the two records above are proposed with it.
- **The rules marked "new"** wait for the domain owner: P5 to P9, S3, the second sentence of S5,
  the file of D2, D3, D8's place, D9, D10, O3, O5, O6 and the second sentence of O7.
