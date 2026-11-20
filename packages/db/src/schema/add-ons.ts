import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, timestamps } from './columns'
import { editions } from './editions'
import { uploadedFiles } from './uploaded-files'

/**
 * What limits an add-on: nothing, a capacity, or nothing at all because it only counts interest
 * and reserves no place.
 */
export const addOnKind = pgEnum('add_on_kind', ['unlimited', 'limited', 'headcount'])

/**
 * An add-on of an edition (docs/specs/0003-catalog.md): an optional extra bought with a ticket,
 * at a price that may be zero. A limited one has a capacity and may have a threshold, below which
 * the shop shows the places left. A hidden one is no longer offered and stays on its orders.
 */
export const addOns = pgTable(
  'add_ons',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    name: text().notNull(),
    description: text().notNull().default(''),
    amountMinor: integer().notNull(),
    kind: addOnKind().notNull(),
    capacity: integer(),
    placesLeftThreshold: integer(),
    position: integer().notNull(),
    hiddenAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('add_ons_id_tenant_edition_unique').on(t.id, t.tenantId, t.editionId),
    index('add_ons_tenant_edition_position_idx').on(t.tenantId, t.editionId, t.position),
    foreignKey({
      name: 'add_ons_edition_fk',
      columns: [t.editionId, t.tenantId],
      foreignColumns: [editions.id, editions.tenantId],
    }).onDelete('cascade'),
    check('add_ons_name', sql`char_length(btrim(${t.name})) between 1 and 100`),
    check('add_ons_description', sql`char_length(${t.description}) <= 1000`),
    check('add_ons_amount', sql`${t.amountMinor} between 0 and 100000000`),
    // A capacity is what a limited add-on has, and no other kind.
    check(
      'add_ons_capacity',
      sql`(${t.kind} = 'limited') = (${t.capacity} is not null) and (${t.capacity} is null or ${t.capacity} >= 0)`,
    ),
    check(
      'add_ons_threshold',
      sql`${t.placesLeftThreshold} is null or (${t.kind} = 'limited' and ${t.placesLeftThreshold} >= 1)`,
    ),
    check('add_ons_position', sql`${t.position} >= 1`),
  ],
)

/**
 * The picture of an add-on (docs/specs/0003-catalog.md, A9): an uploaded image, one an add-on. A
 * row of its own and no column of the add-on, so that a picture is put and taken away by adding
 * and deleting a row: the application role updates no column that points at another row.
 */
export const addOnPictures = pgTable(
  'add_on_pictures',
  {
    addOnId: uuid().primaryKey(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    fileId: uuid().notNull(),
  },
  (t) => [
    unique('add_on_pictures_file_unique').on(t.fileId),
    index('add_on_pictures_tenant_edition_idx').on(t.tenantId, t.editionId),
    foreignKey({
      name: 'add_on_pictures_add_on_fk',
      columns: [t.addOnId, t.tenantId, t.editionId],
      foreignColumns: [addOns.id, addOns.tenantId, addOns.editionId],
    }).onDelete('cascade'),
    // The file is the picture's own edition's. No cascade: a picture keeps its file for as long
    // as it is there. Deferred to the end of the transaction in the privileges migration, so that
    // an edition goes with both.
    foreignKey({
      name: 'add_on_pictures_file_fk',
      columns: [t.fileId, t.tenantId, t.editionId],
      foreignColumns: [uploadedFiles.id, uploadedFiles.tenantId, uploadedFiles.editionId],
    }),
  ],
)
