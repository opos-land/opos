import { type Transaction } from '@opos/db'
import { type SQL, sql } from 'drizzle-orm'
import { type AnyPgColumn, type PgTable } from 'drizzle-orm/pg-core'

/** A table of an edition whose rows an org keeps in an order. */
export type OrderedTable = PgTable & {
  id: AnyPgColumn
  editionId: AnyPgColumn
  position: AnyPgColumn
}

/** What `hidden_at` becomes: a row hidden again keeps the moment it was first hidden at. */
export const hiddenAt = (column: AnyPgColumn, hidden: boolean): SQL | null =>
  hidden ? sql`coalesce(${column}, now())` : null

/** The rows of the edition, by identifier, in their order. */
export async function orderOf(
  tx: Transaction,
  table: OrderedTable,
  editionId: string,
): Promise<string[]> {
  const rows = await tx.execute<{ id: string }>(sql`
    select ${table.id} as id from ${table}
    where ${table.editionId} = ${editionId}
    order by ${table.position}, ${table.id}
  `)
  return rows.map((row) => row.id)
}

/**
 * Gives the rows of the edition the places of `order`, counted from 1, in one statement; a row
 * already in its place stays as it is. Nothing here is unique by place, so no row waits for
 * another to move first.
 */
export async function arrange(
  tx: Transaction,
  table: OrderedTable,
  editionId: string,
  order: readonly string[],
) {
  if (order.length === 0) return
  const ids = sql.join(
    order.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
  await tx.execute(sql`
    update ${table} as moved set position = placed.place
    from unnest(array[${ids}]) with ordinality as placed(id, place)
    where moved.edition_id = ${editionId} and moved.id = placed.id
      and moved.position <> placed.place
  `)
}
