# Catalog

- Status: Implemented
- Domain owner: the domain owner of tickets ([CONTRIBUTORS.md](../../CONTRIBUTORS.md))
- Brief: [0001](../briefs/0001-convention-shop.md), B2 and the requirements it leans on
- Decisions:
  [0046](../adr/0046-keep-the-price-tiers-of-a-ticket-type-apart-with-an-exclusion-constraint.md);
  the records this spec still needs are among its [open questions](#open-questions)

## Goal

What an edition sells and on what terms: ticket types with their prices, add-ons, merchandise with
its variants and stock, and the edition's age bands and custom fields. An org sets all of it in
the panel, with no developer's help. It serves the second half of step 4 of the MVP flow
([PRODUCT.md 2](../PRODUCT.md#2-mvp-goal-and-end-to-end-flow)), putting tickets on sale. The shop
that shows the catalog to buyers is [checkout and orders](0004-checkout-and-orders.md). It builds
on [file storage](0012-file-storage.md) and [image variants](0013-image-variants.md), which are
built before it.

## Business rules

The **Brief** column names where a rule comes from; "new" marks a rule this draft adds for the
domain owner to confirm. Every price is a gross amount in the convention's currency.

### Ticket types

| #   | Rule                                                                                                                                                                                                                                       | Brief       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| T1  | An edition offers any number of ticket types, up to the limit of an edition. Each has a name, a short and a long description, a capacity, a sale window, the age bands it allows and whether discounts apply to it.                        | BR-02, B2.1 |
| T2  | A ticket type has price tiers: each a price valid within a date window. The windows of one ticket type never overlap. Its price at a moment is the tier covering that moment, and with no tier covering it the ticket type is not on sale. | BR-03, B2.1 |
| T3  | A ticket type may offer supporter prices: fixed amounts a buyer may choose instead of the tier's price. A supporter price not above the price in force is not offered.                                                                     | F2.2, B2.1  |
| T4  | A ticket type lists its perks: shown to the buyer, never sold separately, with no price and no stock.                                                                                                                                      | BR-05       |
| T5  | A ticket type names the add-ons and the merchandise items offered with it.                                                                                                                                                                 | B2.1        |
| T6  | A ticket type excluded from discounts says so on its page, and no discount code applies to it.                                                                                                                                             | BR-04       |
| T7  | Outside its sale window a ticket type is hidden or shown as not yet on sale or as closed, as the org set for it.                                                                                                                           | F1.2        |
| T8  | A capacity is a whole number or none: without one the ticket type is not limited.                                                                                                                                                          | BR-02       |

### Add-ons

| #   | Rule                                                                                                                                                                                                                                                               | Brief       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| A1  | An add-on has a name, a description and a price, which may be zero. It is one of three kinds: without a limit, limited by a capacity, or headcount only.                                                                                                           | BR-10       |
| A2  | A headcount-only add-on records interest and reserves nothing: it takes no capacity, and the shop says so.                                                                                                                                                         | BR-10, F3.1 |
| A3  | A capacity-limited add-on has a threshold: the shop shows the places left only below it.                                                                                                                                                                           | F3.2        |
| A4  | An add-on may have one picture: an uploaded image of the types and the size a merchandise picture has (M8), shown with the add-on in the shop. It is public once its add-on is not hidden and its edition is published, and readable by the edition's orgs before. | new         |

### Merchandise

| #   | Rule                                                                                                                                                                                                                                                                                                                                                                                   | Brief                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| M1  | A merchandise item has a name, a description, a price, pictures, a flag saying its pictures are illustrative and a limit a single order may take of it.                                                                                                                                                                                                                                | F4.3, B2.2                                     |
| M2  | An item may have option axes, such as cut and size, and the variants that exist: one value of each axis. A variant that does not exist cannot be bought. An item without axes is sold as one variant. Once an axis is added or taken away no variant fits the axes any more, so every variant of the item goes; a value taken away takes the variants that held it and its size chart. | BR-07, B2.2; the last sentence is new          |
| M3  | Stock is held per variant. A variant at zero stock cannot be bought. A variant that newly exists is out of stock until an org enters a number.                                                                                                                                                                                                                                         | BR-07; the last sentence is new                |
| M4  | An item may have a size chart for each value of one axis, such as each cut.                                                                                                                                                                                                                                                                                                            | UR-03, B2.2                                    |
| M5  | An edition may set a pre-order deadline. Until it, a variant's stock may be marked unlimited. After it, a variant sells only from a number an org entered: one still marked unlimited sells nothing. An edition with no deadline has no pre-order, and a variant marked unlimited sells nothing there either.                                                                          | BR-08, B2.3; the last sentence is new          |
| M6  | An edition turns merch-only orders on or off. A merch-only order is offered every merchandise item of the edition that is not hidden.                                                                                                                                                                                                                                                  | BR-06, F1.1; the second sentence is new        |
| M7  | Merchandise is picked up at the edition. The catalog has no field for shipping, and no text of the shop promises it.                                                                                                                                                                                                                                                                   | BR-09                                          |
| M8  | Pictures and size charts are uploaded files: JPEG, PNG or WebP images of up to 5 MB, up to ten pictures an item. No other type is taken, an SVG among them.                                                                                                                                                                                                                            | D16 of the brief; the types and limits are new |
| M9  | A picture or a size chart is public once its item is not hidden and its edition is published, and readable by the edition's orgs alone before that.                                                                                                                                                                                                                                    | new                                            |

### Age bands and custom fields

| #   | Rule                                                                                                                                                                                                            | Brief                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| E1  | An edition sets two ages that divide child, teen and adult, by a ticket holder's age on the edition's first day. The second is higher than the first.                                                           | BR-12, B2.6                    |
| E2  | An edition may give the address of a guardian consent form, for a teen's guardian to print.                                                                                                                     | BR-12, B2.6                    |
| E3  | An edition defines its custom fields: a label and whether an answer is required. An answer is a text of up to 200 characters. The panel says, where a field is defined, that it must ask for nothing sensitive. | BR-18, B2.7; the length is new |
| E4  | Custom field answers appear on the order and in the exports, and nowhere outside the convention.                                                                                                                | BR-19, B2.7                    |
| E5  | An edition sets the message its shop shows while nothing is on sale.                                                                                                                                            | F1.4                           |

### A catalog with orders

| #   | Rule                                                                                                                                                                            | Brief                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| L1  | A changed price changes no order: an order keeps the price it was placed at.                                                                                                    | BR-03, B2.4                    |
| L2  | A ticket type, an add-on, a merchandise item, a variant or a custom field that an order holds is never deleted. It is hidden: no longer offered, and still shown on its orders. | B2.5                           |
| L3  | A capacity or a stock is never set below what orders already hold of it.                                                                                                        | new                            |
| L4  | Every limit the catalog states holds under concurrent orders and concurrent changes of the catalog.                                                                             | invariant 9 of ARCHITECTURE.md |

## Shape

### Tables

All are edition tables.

| Table                           | Holds                                                                                                                                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ticket_types`                  | `name`, `short_description`, `long_description`, `capacity` (optional), `sale_starts_at`, `sale_ends_at`, `allows_child`, `allows_teen`, `allows_adult`, `discounts_excluded`, `shown_outside_sale_window`, `position`, `hidden_at` |
| `ticket_type_price_tiers`       | `ticket_type_id`, `amount_minor`, `starts_at`, `ends_at`; an exclusion constraint keeps the windows of one ticket type apart                                                                                                        |
| `ticket_type_supporter_prices`  | `ticket_type_id`, `amount_minor`                                                                                                                                                                                                    |
| `ticket_type_perks`             | `ticket_type_id`, `name`, `position`                                                                                                                                                                                                |
| `add_ons`                       | `name`, `description`, `amount_minor`, `kind` (`unlimited`, `limited`, `headcount`), `capacity`, `places_left_threshold`, `position`, `hidden_at`                                                                                   |
| `ticket_type_add_ons`           | `ticket_type_id`, `add_on_id`                                                                                                                                                                                                       |
| `merchandise_items`             | `name`, `description`, `amount_minor`, `per_order_limit`, `pictures_illustrative`, `position`, `hidden_at`                                                                                                                          |
| `ticket_type_merchandise_items` | `ticket_type_id`, `merchandise_item_id`                                                                                                                                                                                             |
| `merchandise_option_axes`       | `merchandise_item_id`, `name`, `position`                                                                                                                                                                                           |
| `merchandise_option_values`     | `merchandise_item_id`, `axis_id`, `label`, `position`: a value names its item beside its axis                                                                                                                                       |
| `merchandise_variants`          | `merchandise_item_id`, `stock`, empty while unlimited; `hidden_at`                                                                                                                                                                  |
| `merchandise_variant_values`    | `merchandise_item_id`, `variant_id`, `axis_id`, `option_value_id`: one value of each axis of the variant's own item, held by the keys alone                                                                                         |
| `merchandise_item_pictures`     | `merchandise_item_id`, `file_id`, `position`                                                                                                                                                                                        |
| `merchandise_size_charts`       | `option_value_id`, `file_id`: the size chart of a value, one a value; a row of its own, added and deleted, so that no role updates a column pointing at a file                                                                      |
| `edition_custom_fields`         | `label`, `is_required`, `position`, `hidden_at`                                                                                                                                                                                     |

`edition_shops` ([shop setup](0002-shop-setup.md)) gains `teen_from_age`, `adult_from_age`,
`guardian_consent_form_url`, `merch_preorder_deadline`, `merch_only_enabled` and
`sales_closed_message`.

An amount is a whole number of minor units. A hidden row keeps its `hidden_at`; nothing here has a
soft delete beyond it.

An edition holds up to 50 ticket types, 50 add-ons, 200 merchandise items, 100 variants an item
and 20 custom fields: the shop's offer is one answer, sent to anyone who asks. A ticket type holds
up to 20 price tiers, ten supporter prices and 20 perks; an item up to three axes of 30 values
each.

The windows of one ticket type's price tiers are kept apart by an exclusion constraint
([0046](../adr/0046-keep-the-price-tiers-of-a-ticket-type-apart-with-an-exclusion-constraint.md));
a window holds its start and not its end, so one tier may end at the moment the next one starts.

### Files

This spec declares two kinds of file to [file storage](0012-file-storage.md), both an edition's
and both JPEG, PNG or WebP images of up to 5 MB: a merchandise picture, which
`merchandise_item_pictures.file_id` points at, and a size chart, which
`merchandise_size_charts.file_id` points at. Both declare two
[variants](0013-image-variants.md): `small`, fitted inside 600 pixels and made with the upload,
and `large`, fitted inside 2000. The shop's listing and the cart show the small one, an item's
page and a size chart the large one.

The routes that add a picture and a size chart take the file and need tickets write access. A
tenant route serves the variants of the edition's files to its orgs, a hidden item's too, and the
public route below serves those of a shown item to everyone (M9), both from the API's own origin,
so the portal loads nothing from another origin
([0026](../adr/0026-run-a-tracker-only-with-consent-and-none-in-the-panel.md)).

### Routes

Tenant routes, each under `/editions/{editionId}`:

| Route                                                                                                | Needs                                                                | Refuses with                                                                                                |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /ticket-types`, `GET /add-ons`, `GET /merchandise-items`, `GET /custom-fields`                  | tickets>=read                                                        |                                                                                                             |
| `POST /ticket-types`                                                                                 | tickets=write                                                        | `catalog.limit-reached`, `ticket-type.tiers-overlap`                                                        |
| `PATCH /ticket-types/{ticketTypeId}`                                                                 | tickets=write                                                        | `ticket-type.tiers-overlap`, `catalog.below-held`                                                           |
| `DELETE /ticket-types/{ticketTypeId}`                                                                | tickets=write                                                        | `catalog.in-use`                                                                                            |
| `POST /add-ons`, `PATCH /add-ons/{addOnId}`, `DELETE /add-ons/{addOnId}`                             | tickets=write                                                        | `catalog.limit-reached`, `catalog.below-held`, `catalog.in-use`                                             |
| `PUT /add-ons/{addOnId}/picture`                                                                     | tickets=write; takes a file                                          | `file.type-refused`, `file.too-large`, `file.limit-reached`, `storage.unavailable`                          |
| `DELETE /add-ons/{addOnId}/picture`                                                                  | tickets=write                                                        |                                                                                                             |
| `GET /add-on-files/{fileId}/{variant}`                                                               | tickets>=read; answers the picture of an add-on, of a hidden one too |                                                                                                             |
| `POST /merchandise-items`, `PATCH /merchandise-items/{itemId}`, `DELETE /merchandise-items/{itemId}` | tickets=write                                                        | `catalog.limit-reached`, `catalog.in-use`                                                                   |
| `PUT /merchandise-items/{itemId}/variants`                                                           | tickets=write                                                        | `catalog.limit-reached`, `catalog.in-use` for a variant an order holds                                      |
| `PUT /merchandise-items/{itemId}/variants/{variantId}/stock`                                         | tickets=write                                                        | `catalog.below-held`                                                                                        |
| `POST /merchandise-items/{itemId}/pictures`                                                          | tickets=write; takes a file                                          | `catalog.limit-reached`, `file.type-refused`, `file.too-large`, `file.limit-reached`, `storage.unavailable` |
| `DELETE /merchandise-items/{itemId}/pictures/{pictureId}`                                            | tickets=write                                                        |                                                                                                             |
| `PUT /merchandise-items/{itemId}/option-values/{valueId}/size-chart`                                 | tickets=write; takes a file                                          | `file.type-refused`, `file.too-large`, `file.limit-reached`, `storage.unavailable`                          |
| `DELETE /merchandise-items/{itemId}/option-values/{valueId}/size-chart`                              | tickets=write                                                        |                                                                                                             |
| `GET /merchandise-files/{fileId}/{variant}`                                                          | tickets>=read; serves a file                                         |                                                                                                             |
| `POST /custom-fields`, `PATCH /custom-fields/{fieldId}`, `DELETE /custom-fields/{fieldId}`           | tickets=write                                                        | `catalog.limit-reached`, `catalog.in-use`                                                                   |

A ticket type's tiers, supporter prices, perks, add-ons and merchandise items travel with it as
whole lists, as an item's axes and the order of its pictures do with the item. An axis or a value
that names its identifier is the one the item has, renamed or moved; one without is new; one left
out goes. A row of another parent that a body names is `404`, as one in a path is. A picture and a
size chart are added and removed one at a time, each with its file. The edition settings of this
spec are changed through `PATCH /editions/{editionId}/shop`.

Two public routes, without sign-in:

| Route                                                             | Answers                                                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET /public/tenants/{slug}/merchandise-files/{fileId}/{variant}` | a variant of a picture or a size chart of an item that is not hidden, of a published edition; anything else as not found |
| `GET /public/tenants/{slug}/add-on-files/{fileId}/{variant}`      | a variant of the picture of an add-on that is not hidden, of a published edition; anything else as not found             |

### Screens

The panel, inside an edition:

| Screen               | Holds                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| ticket types         | the list in its order; a ticket type's form with its tiers, supporter prices, perks and what is offered with it                 |
| add-ons              | the list; an add-on's form, with its picture                                                                                    |
| merchandise          | the list; an item's form with its axes, variants, stock, pictures and size charts; the pre-order deadline and merch-only orders |
| ticket holders' data | the age bands with the guardian consent form's address; the custom fields, with the notice of E3                                |

A deletion asks first in a modal
([0023](../adr/0023-ask-in-a-modal-before-an-action-that-cannot-be-undone.md)); hiding does not,
since the same screen shows the row again.

### Seed

The demo edition with an open shop gets two ticket types, one with two price tiers and supporter
prices and one for adults only and excluded from discounts; a capacity-limited and a
headcount-only add-on; a T-shirt with two cuts and their sizes, a size chart a cut drawn by the seed's
own code and put into the bucket
([0045](../adr/0045-let-the-seed-put-its-demo-files-into-the-bucket.md)), one variant out of
stock and one that does not exist; an item without variants; age bands and two custom
fields.

## Tenant isolation and permissions

- Every table is a tenant table under RLS with its own `tenant_id`, a composite foreign key to its
  parent and an index starting with `tenant_id`; an edition table's parent chain ends at
  `editions (id, tenant_id)`.
- The join tables hold both sides in one tenant and one edition by composite foreign keys: a
  ticket type never offers another edition's add-on or item, and an item never shows another
  tenant's file.
- Every route needs `tickets` of the edition its path names; a row of another edition or tenant is
  `404`.
- The public file route opens the tenant from its slug, as the convention's page does, and
  answers a suspended tenant as an unknown address.
- A change of a capacity or a stock locks the row carrying the limit before it counts what orders
  hold, the same lock an order takes (invariant 9).

These sentences of the documents change with the code: PRODUCT.md 11 no longer lists merchandise
and file uploads beyond the MVP; the glossary gains price tier, supporter price, perk, add-on,
merchandise item, variant, size chart, pre-order deadline, age band, guardian consent and custom
field, with their `pl` renderings.

## Tests

Integration, in `packages/db/test`:

- RLS on every table; a foreign parent refused by each composite foreign key; two overlapping
  tiers of one ticket type refused by the constraint.
- `verify` fails on each new privilege broken once; the seed, run twice, changes no row count.

Integration, in `apps/api/test`:

- Every route against every actor of the permission matrix, with another tenant's and another
  edition's identifiers.
- The price of a ticket type at the edges of its tiers; a supporter price at and below the price
  in force.
- Hide and delete: a row an order holds cannot be deleted and can be hidden; a row without orders
  is deleted.
- A capacity and a stock set below what orders hold are refused, also against an order placed
  meanwhile.
- The pre-order deadline: an unlimited variant before and after it.
- Files: an SVG, a file over the limit and a content that is not what its type says are refused;
  a removed picture's file is gone; the public route serves a shown item's file with its stored
  type, and answers a hidden item's, an unpublished edition's and another tenant's as not found.
- The limits of an edition, each reached once.

e2e:

1. An org builds the catalog of the seed from an empty edition.
2. A price is changed and an item hidden while the shop is open; the shop shows both at once.
   It runs with [checkout and orders](0004-checkout-and-orders.md), which brings the shop's page.
3. An org with tickets read access sees the catalog and can change nothing.

## Out of scope

- Keeping a file, its upload and its bucket: [file storage](0012-file-storage.md).
- Selling the catalog and holding stock: [checkout and orders](0004-checkout-and-orders.md).
- Discount codes: [discount codes](0008-discount-codes.md).
- A capacity shared across ticket types, such as the venue's limit.
- Custom fields beyond a short text; a catalog copied from the previous edition; an alert when a
  variant's stock runs low.
- Shipping.

## Open questions

- **The picture of an add-on (A4):** not in the brief. It is one image an add-on, in the two sizes
  of a merchandise picture, public on the terms of M9: the domain owner's to confirm.
- **A closed shop (M9):** a shown item's pictures are for everyone while its edition is published,
  whether or not its shop is open, as the route above says. Whether a closed shop should keep them
  to the edition's orgs is the domain owner's to say.
- **Records before acceptance:** merchandise and file uploads in the MVP (D2 and D16 of the brief,
  with PRODUCT.md 11), the uploads decided in
  [0041](../adr/0041-keep-uploaded-files-in-an-s3-bucket-behind-the-api.md); the age band, the
  guardian consent and custom field answers as the convention's data (D7, with PRODUCT.md 10).
