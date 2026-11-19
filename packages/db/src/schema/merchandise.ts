import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, timestamps } from './columns'
import { editions } from './editions'
import { uploadedFiles } from './uploaded-files'

/**
 * A merchandise item of an edition (docs/specs/0003-catalog.md): a product picked up at the
 * edition, at one price for all its variants. A hidden one is no longer offered and stays on its
 * orders.
 */
export const merchandiseItems = pgTable(
  'merchandise_items',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    name: text().notNull(),
    description: text().notNull().default(''),
    amountMinor: integer().notNull(),
    /** The most of it a single order may take, over all its variants. */
    perOrderLimit: integer().notNull(),
    picturesIllustrative: boolean().notNull().default(false),
    position: integer().notNull(),
    hiddenAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('merchandise_items_id_tenant_edition_unique').on(t.id, t.tenantId, t.editionId),
    index('merchandise_items_tenant_edition_position_idx').on(t.tenantId, t.editionId, t.position),
    foreignKey({
      name: 'merchandise_items_edition_fk',
      columns: [t.editionId, t.tenantId],
      foreignColumns: [editions.id, editions.tenantId],
    }).onDelete('cascade'),
    check('merchandise_items_name', sql`char_length(btrim(${t.name})) between 1 and 100`),
    check('merchandise_items_description', sql`char_length(${t.description}) <= 5000`),
    check('merchandise_items_amount', sql`${t.amountMinor} between 0 and 100000000`),
    check('merchandise_items_per_order_limit', sql`${t.perOrderLimit} between 1 and 100`),
    check('merchandise_items_position', sql`${t.position} >= 1`),
  ],
)

/** An option axis of an item, such as its cut or its size. */
export const merchandiseOptionAxes = pgTable(
  'merchandise_option_axes',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    merchandiseItemId: uuid().notNull(),
    name: text().notNull(),
    position: integer().notNull(),
  },
  (t) => [
    // What a value points at: the axis within its item, so that a value names its item too.
    unique('merchandise_option_axes_id_item_unique').on(
      t.id,
      t.tenantId,
      t.editionId,
      t.merchandiseItemId,
    ),
    index('merchandise_option_axes_tenant_item_idx').on(t.tenantId, t.merchandiseItemId),
    foreignKey({
      name: 'merchandise_option_axes_item_fk',
      columns: [t.merchandiseItemId, t.tenantId, t.editionId],
      foreignColumns: [merchandiseItems.id, merchandiseItems.tenantId, merchandiseItems.editionId],
    }).onDelete('cascade'),
    check('merchandise_option_axes_name', sql`char_length(btrim(${t.name})) between 1 and 50`),
    check('merchandise_option_axes_position', sql`${t.position} >= 1`),
  ],
)

/** A value of an axis, such as "M" of the size. It names its item beside its axis. */
export const merchandiseOptionValues = pgTable(
  'merchandise_option_values',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    merchandiseItemId: uuid().notNull(),
    axisId: uuid().notNull(),
    label: text().notNull(),
    position: integer().notNull(),
  },
  (t) => [
    // What a size chart points at.
    unique('merchandise_option_values_id_tenant_edition_unique').on(t.id, t.tenantId, t.editionId),
    // What a variant's value points at: the value within its axis and its item.
    unique('merchandise_option_values_id_item_axis_unique').on(
      t.id,
      t.tenantId,
      t.editionId,
      t.merchandiseItemId,
      t.axisId,
    ),
    index('merchandise_option_values_tenant_axis_idx').on(t.tenantId, t.axisId),
    foreignKey({
      name: 'merchandise_option_values_axis_fk',
      columns: [t.axisId, t.tenantId, t.editionId, t.merchandiseItemId],
      foreignColumns: [
        merchandiseOptionAxes.id,
        merchandiseOptionAxes.tenantId,
        merchandiseOptionAxes.editionId,
        merchandiseOptionAxes.merchandiseItemId,
      ],
    }).onDelete('cascade'),
    check('merchandise_option_values_label', sql`char_length(btrim(${t.label})) between 1 and 50`),
    check('merchandise_option_values_position', sql`${t.position} >= 1`),
  ],
)

/**
 * A variant of an item: what a buyer takes, with its own stock, empty while it is unlimited. An
 * item without axes has one variant with no values. A hidden one is no longer offered and stays
 * on its orders.
 */
export const merchandiseVariants = pgTable(
  'merchandise_variants',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    merchandiseItemId: uuid().notNull(),
    stock: integer(),
    hiddenAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('merchandise_variants_id_item_unique').on(
      t.id,
      t.tenantId,
      t.editionId,
      t.merchandiseItemId,
    ),
    index('merchandise_variants_tenant_item_idx').on(t.tenantId, t.merchandiseItemId),
    foreignKey({
      name: 'merchandise_variants_item_fk',
      columns: [t.merchandiseItemId, t.tenantId, t.editionId],
      foreignColumns: [merchandiseItems.id, merchandiseItems.tenantId, merchandiseItems.editionId],
    }).onDelete('cascade'),
    check('merchandise_variants_stock', sql`${t.stock} >= 0`),
  ],
)

/**
 * A value of a variant: one of each axis, by the primary key, of the variant's own item, by the
 * two foreign keys that both name it.
 */
export const merchandiseVariantValues = pgTable(
  'merchandise_variant_values',
  {
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    merchandiseItemId: uuid().notNull(),
    variantId: uuid().notNull(),
    axisId: uuid().notNull(),
    optionValueId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ name: 'merchandise_variant_values_pkey', columns: [t.variantId, t.axisId] }),
    index('merchandise_variant_values_tenant_variant_idx').on(t.tenantId, t.variantId),
    index('merchandise_variant_values_tenant_value_idx').on(t.tenantId, t.optionValueId),
    foreignKey({
      name: 'merchandise_variant_values_variant_fk',
      columns: [t.variantId, t.tenantId, t.editionId, t.merchandiseItemId],
      foreignColumns: [
        merchandiseVariants.id,
        merchandiseVariants.tenantId,
        merchandiseVariants.editionId,
        merchandiseVariants.merchandiseItemId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'merchandise_variant_values_value_fk',
      columns: [t.optionValueId, t.tenantId, t.editionId, t.merchandiseItemId, t.axisId],
      foreignColumns: [
        merchandiseOptionValues.id,
        merchandiseOptionValues.tenantId,
        merchandiseOptionValues.editionId,
        merchandiseOptionValues.merchandiseItemId,
        merchandiseOptionValues.axisId,
      ],
    }).onDelete('cascade'),
  ],
)

/** A picture of an item: an uploaded image, in its place among the item's pictures. */
export const merchandiseItemPictures = pgTable(
  'merchandise_item_pictures',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    merchandiseItemId: uuid().notNull(),
    fileId: uuid().notNull(),
    position: integer().notNull(),
  },
  (t) => [
    unique('merchandise_item_pictures_file_unique').on(t.fileId),
    index('merchandise_item_pictures_tenant_item_idx').on(
      t.tenantId,
      t.merchandiseItemId,
      t.position,
    ),
    foreignKey({
      name: 'merchandise_item_pictures_item_fk',
      columns: [t.merchandiseItemId, t.tenantId, t.editionId],
      foreignColumns: [merchandiseItems.id, merchandiseItems.tenantId, merchandiseItems.editionId],
    }).onDelete('cascade'),
    // The file is the picture's own edition's. No cascade: a picture keeps its file for as long
    // as it is there. Deferred to the end of the transaction in the privileges migration, so that
    // an edition goes with both.
    foreignKey({
      name: 'merchandise_item_pictures_file_fk',
      columns: [t.fileId, t.tenantId, t.editionId],
      foreignColumns: [uploadedFiles.id, uploadedFiles.tenantId, uploadedFiles.editionId],
    }),
    check('merchandise_item_pictures_position', sql`${t.position} >= 1`),
  ],
)

/**
 * The size chart of a value, such as of a cut: an uploaded image, one a value. A row of its own
 * and no column of the value, so that a chart is put and taken away by adding and deleting a row:
 * the application role updates no column that points at another row.
 */
export const merchandiseSizeCharts = pgTable(
  'merchandise_size_charts',
  {
    optionValueId: uuid().primaryKey(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    fileId: uuid().notNull(),
  },
  (t) => [
    unique('merchandise_size_charts_file_unique').on(t.fileId),
    index('merchandise_size_charts_tenant_edition_idx').on(t.tenantId, t.editionId),
    foreignKey({
      name: 'merchandise_size_charts_value_fk',
      columns: [t.optionValueId, t.tenantId, t.editionId],
      foreignColumns: [
        merchandiseOptionValues.id,
        merchandiseOptionValues.tenantId,
        merchandiseOptionValues.editionId,
      ],
    }).onDelete('cascade'),
    // As a picture's: no cascade, and deferred in the privileges migration.
    foreignKey({
      name: 'merchandise_size_charts_file_fk',
      columns: [t.fileId, t.tenantId, t.editionId],
      foreignColumns: [uploadedFiles.id, uploadedFiles.tenantId, uploadedFiles.editionId],
    }),
  ],
)
