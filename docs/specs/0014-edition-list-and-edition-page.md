# Edition list and edition page

- Status: Accepted
- Domain owner: the team: the edition list and the edition's page are part of the core
- Decisions: [0043](../adr/0043-list-every-published-edition-on-the-portals-home-page.md)

## Goal

A visitor finds a convention without being given its link. The portal's home page lists the
published editions of every convention, the coming ones and the past ones, and an edition's page
shows what a visitor needs first: the convention's name and logo, when and where the edition takes
place, and the ways on, to its programme and to its shop. It serves step 5 of the MVP flow
([PRODUCT.md 2](../PRODUCT.md#2-mvp-goal-and-end-to-end-flow)) and gives step 6 its way into the
shop.

It builds on [file storage](0012-file-storage.md) and [image variants](0013-image-variants.md),
which keep the logo, and it is built before [checkout and orders](0004-checkout-and-orders.md),
whose pages hang under the edition's page.

## Business rules

The **From** column names where a rule comes from: the record, a document, or "new" for a rule
this spec added.

### The list

| #   | Rule                                                                                                                                                                                                      | From                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| L1  | The portal's home page lists the published editions of every convention that is not suspended, to anyone, with no sign-in.                                                                                | 0043                                             |
| L2  | Publishing an edition puts it on the list and unpublishing takes it off, at once. Nothing else decides it: no convention, org or admin lists or hides an edition apart from its publication.              | 0043                                             |
| L3  | The list has two parts. The coming editions are those that have not ended, an edition under way among them, the one that starts soonest first. The past ones follow, the last ended first.                | 0043; the order is new                           |
| L4  | A row shows the convention's logo, the edition's name, the convention's name where the edition's does not hold it, its dates in the convention's time zone and its city, and leads to the edition's page. | 0043; the city and the convention's name are new |
| L5  | A convention with no logo shows none: no picture stands in for it.                                                                                                                                        | PRODUCT.md 8                                     |
| L6  | Each part shows its first rows and more when the visitor asks for them.                                                                                                                                   | new                                              |
| L7  | The list is the same for everyone: it holds nothing of an account.                                                                                                                                        | new                                              |

### The edition's page

| #   | Rule                                                                                                                                                                                              | From               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| E1  | Every published edition of a convention that is not suspended has a page of its own, a past edition too. Any other edition answers as not found.                                                  | 0043; PRODUCT.md 4 |
| E2  | The page shows the convention's name and logo, the edition's name, its dates in the convention's time zone and its venue.                                                                         | 0043               |
| E3  | The page links the edition's programme, which has a page of its own.                                                                                                                              | 0043               |
| E4  | The page links the edition's shop while that shop is open. The link arrives with [checkout and orders](0004-checkout-and-orders.md), which builds the shop's pages; until then the page has none. | 0043               |
| E5  | The page links the convention's page.                                                                                                                                                             | new                |
| E6  | The convention's page shows the convention's name and logo, its active edition as E2–E4 show it, and its other published editions, the coming ones first, each leading to its page.               | new                |

### The venue

| #   | Rule                                                                                                                                               | From |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| V1  | An edition has a venue: the name of the place, its address and its city, each optional.                                                            | new  |
| V2  | An org with settings write access sets the venue, with the edition's name and dates.                                                               | new  |
| V3  | The list shows the city alone; the edition's page shows all three. An edition with no venue set shows nothing in its place.                        | new  |
| V4  | The venue is text. No map and nothing from another origin shows it ([0026](../adr/0026-run-a-tracker-only-with-consent-and-none-in-the-panel.md)). | new  |

### The logo

| #   | Rule                                                                                                                                    | From           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| G1  | A convention has at most one logo, an image. It is the convention's, not an edition's: every edition shows it.                          | PRODUCT.md 4   |
| G2  | An org with branding write access uploads, replaces and removes the logo.                                                               | PRODUCT.md 5.1 |
| G3  | Anyone reads the logo of a convention that is not suspended.                                                                            | new            |
| G4  | A replaced or removed logo is gone: its address answers as not found, and the list and the pages show the new one or none.              | new            |
| G5  | The logo is the convention's own: OPOS makes none and puts none in its place ([PRODUCT.md 8](../PRODUCT.md#8-design-and-public-image)). | PRODUCT.md 8   |
| G6  | The branding is a permission an org is given like the others of the convention: the team's screens show it and set it.                  | new            |

## Shape

### Tables

| Table          | Level  | Holds                                                                                                                    |
| -------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| `editions`     | tenant | gains `venue_name`, `venue_address` and `venue_city`, each empty when not set                                            |
| `tenant_logos` | tenant | a row a tenant while it has a logo: `file_id`. A replaced logo is a new row: the row is added and removed, never changed |

### Files

This spec declares one kind of file to [file storage](0012-file-storage.md): a convention's logo.
It is a convention's, a JPEG, PNG or WebP of up to 2 MB, and `tenant_logos.file_id` points at it.

| Variant | Box       | Fit    | Made              | Shown on                                             |
| ------- | --------- | ------ | ----------------- | ---------------------------------------------------- |
| `small` | 96 × 96   | inside | with the upload   | a row of the list                                    |
| `large` | 320 × 320 | inside | by its first read | the edition's page, the convention's page, the panel |

### Routes

Public routes, without sign-in:

| Route                                                      | Does                                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /public/editions`                                     | a page of one part of the list, coming or past: 20 rows unless asked otherwise, 50 at most, and the place the next page continues from, which the next request gives back; a row is what L4 shows, with the addresses that lead to it |
| `GET /public/tenants/{slug}`                               | as before, and the convention's logo                                                                                                                                                                                                  |
| `GET /public/tenants/{slug}/editions`                      | as before, and each edition's venue                                                                                                                                                                                                   |
| `GET /public/tenants/{slug}/editions/{editionSlug}`        | as before, and the edition's venue                                                                                                                                                                                                    |
| `GET /public/tenants/{slug}/logo-files/{fileId}/{variant}` | a variant of the convention's logo; a file that is not its logo now, an undeclared variant and a suspended convention answer as not found                                                                                             |

A logo travels in an answer as its file's identifier with the width and the height of its picture,
whose proportions every variant keeps, so that a page keeps its place before it loads.

Tenant routes:

| Route                                           | Needs                        | Refuses with                                                                       |
| ----------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| `GET /branding`                                 | branding>=read               |                                                                                    |
| `PUT /branding/logo`                            | branding=write; takes a file | `file.type-refused`, `file.too-large`, `file.limit-reached`, `storage.unavailable` |
| `DELETE /branding/logo`                         | branding=write               |                                                                                    |
| `POST /editions`, `PATCH /editions/{editionId}` | settings=write, as before    | as before; they take the venue with the edition's other data                       |

### Screens

The portal, each built for 360 px first:

| Screen                  | At                                            | Holds                                                           |
| ----------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| the home page           | `/`                                           | the introduction that was there, then the two parts of the list |
| the convention's page   | `/conventions/<convention>`                   | E6                                                              |
| the edition's page      | `/conventions/<convention>/<edition>`         | E2–E5                                                           |
| the edition's programme | `/conventions/<convention>/<edition>/program` | the programme the edition's page held before                    |

A programme item keeps its address under the edition's programme. The shop's pages sit under the
edition's page, at `/conventions/<convention>/<edition>/shop`; what they hold is set in
[checkout and orders](0004-checkout-and-orders.md).

The panel:

| Screen                            | Holds                                           |
| --------------------------------- | ----------------------------------------------- |
| convention settings, branding     | the logo: uploading, replacing and removing it  |
| edition settings, new edition     | the venue, beside the edition's name and dates  |
| the team, a member, an invitation | the branding among the convention's permissions |

The convention settings open to an org with branding read access, on the branding, as they open to
one with settings read access. Replacing and removing the logo ask first in a modal: no screen
brings the file back
([0023](../adr/0023-ask-in-a-modal-before-an-action-that-cannot-be-undone.md)).

A deployed application shows pictures from the API beside its own: its content security policy
names the API as a source of images.

### Seed

The demo editions get a venue each, and the seed keeps a coming edition and a past one whenever it
runs. It carries no logo, as it puts nothing in the bucket: the demo conventions show the list and
the pages without a logo, which is the state of every new convention.

## Tenant isolation and permissions

- The list is a new cross-tenant query of `GlobalDbService`, bound by publication: it reads the
  public columns of published editions and of their conventions, never those of a suspended
  convention, and nothing of an account
  ([0043](../adr/0043-list-every-published-edition-on-the-portals-home-page.md)). It joins the
  table of [ARCHITECTURE.md, Tenant isolation](../ARCHITECTURE.md#tenant-isolation) and its
  columns join `globalReads`; `opos_app_global` gains `select` on those columns alone.
- What the list answers is fixed by its schema in the contract: a field added there is public at
  once, for every convention.
- The place a page continues from is a moment and an identifier the API compares with, and looks
  nothing up by: a place made up of an edition that is not listed answers nothing of it, not even
  that it is there.
- `tenant_logos` is a tenant table under RLS, with its own `tenant_id` as its key and a composite
  foreign key to `uploaded_files`.
- The logo's public route opens the tenant from its slug, as the convention's page does: another
  convention's file, and any file of a suspended convention, answers as not found.
- These are the first routes that need `branding`. A tenant-level permission grants no
  edition-level one, and the venue is the edition's data behind `settings`, as its name and dates
  are.
- Every route at `write` judges its actor again under the tenant's write lock
  ([0008](../adr/0008-serialize-the-writes-of-a-tenant.md)).

## Tests

Integration, in `packages/db/test`:

- RLS on `tenant_logos`, in `covered`; an insert with another tenant's identifier refused; one row
  a tenant; a file of another tenant refused.
- `verify` fails on each new privilege and on the new cross-tenant read, each broken once; the
  seed, run twice, changes no row count.

Integration, in `apps/api/test`:

- Every route against every actor of the permission matrix, with `branding` at each level.
- The list: an unpublished edition and a suspended convention's edition are absent; an edition
  appears once published and leaves once unpublished or its convention is suspended, and returns
  when the convention is restored.
- The parts: an edition under way and one that ends in a minute are coming, one that ended a
  minute ago is past; each part in its order; a second page continues the first with no row twice
  and none missing, also when its last row is taken back meanwhile; a place naming an unpublished
  edition or one of a suspended convention answers as one naming no edition.
- The list's answer holds the fields of its schema alone, and the same for a visitor and for a
  signed-in account.
- The logo: a file of a type the kind does not take, one over the limit and one whose content is
  not what its type says are refused; a replaced one answers as not found at its old address; an
  undeclared variant, another convention's file and a suspended convention answer as not found.
- The venue: set and cleared with settings write access, refused with programme access alone, and
  answered by the public routes of a published edition only.

The tests of file storage sweep the whole bucket as if a day had passed: they run after every
other test of the API, so that the sweep never takes the bytes of another test's upload.

e2e, each scenario making its own tenant and looking for its own rows on the list, and checking
the BFF boundary; the first and the last on a mobile viewport too:

1. A visitor opens the home page, finds a coming edition and a past one, opens the coming one, sees
   its dates and venue and follows the link to its programme.
2. A head uploads a logo and sets the venue; both show on the list and on the edition's page.
3. An edition is on the list only while it is published.
4. The convention's page shows its active edition and leads to a past one.

## Out of scope

- The guests of an edition: a spec of their own, with their place in the glossary
  ([0043](../adr/0043-list-every-published-edition-on-the-portals-home-page.md)).
- The shop's pages, and the link to them: [checkout and orders](0004-checkout-and-orders.md).
- Signing up for an edition from its page: attendee registrations, which wait for their domain
  owner ([PRODUCT.md 7](../PRODUCT.md#7-modules)).
- Searching and filtering the list; a map; editions near the visitor; editions put forward.
- A published edition kept off the list.
- An edition's description, photographs and the rest of its website content: the CMS
  ([PRODUCT.md 11](../PRODUCT.md#11-mvp-scope-vs-beyond-mvp)).
- Branding beyond the logo; a logo in the demo data.
- What a search engine or a shared link shows of a page.
