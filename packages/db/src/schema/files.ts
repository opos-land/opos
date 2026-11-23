import { type SQL, sql } from 'drizzle-orm'
import { type AnyPgColumn, check, integer, text, timestamp } from 'drizzle-orm/pg-core'
import { id } from './columns'

/**
 * The types the storage keeps, the only ones a kind may take (docs/specs/0012-file-storage.md):
 * inert ones, never HTML, SVG or an archive.
 */
export const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const

export type FileType = (typeof FILE_TYPES)[number]

/** The largest file the storage keeps, in bytes. */
export const MAX_FILE_SIZE = 15 * 1024 * 1024

/**
 * The columns of a file's row, whatever its owner. A file never changes once it is kept, so a
 * row has no `updated_at`.
 */
export const fileColumns = () => ({
  id: id(),
  // The name of the kind a feature declared, which says what the file is kept for.
  kind: text().notNull(),
  contentType: text().notNull(),
  size: integer().notNull(),
  sha256: text().notNull(),
  // The name it was uploaded under, a label alone.
  name: text().notNull(),
  // Set for an image, those of its master.
  width: integer(),
  height: integer(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

const quoted = (values: readonly string[]): SQL =>
  sql.raw(values.map((value) => `'${value}'`).join(', '))

/** The constraints of a file's row, named after its table. */
export const fileConstraints = (
  table: string,
  t: Record<'contentType' | 'size' | 'sha256' | 'name' | 'width' | 'height', AnyPgColumn>,
) => [
  check(`${table}_content_type`, sql`${t.contentType} in (${quoted(FILE_TYPES)})`),
  check(`${table}_size`, sql`${t.size} between 1 and ${sql.raw(String(MAX_FILE_SIZE))}`),
  check(`${table}_sha256`, sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
  check(`${table}_name`, sql`char_length(${t.name}) between 1 and 255`),
  check(
    `${table}_dimensions`,
    sql`(${t.width} is null and ${t.height} is null) or (${t.width} is not null and ${t.height} is not null and ${t.width} > 0 and ${t.height} > 0)`,
  ),
]
