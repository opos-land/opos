import { drizzle } from 'drizzle-orm/pg-proxy'
import { describe, expect, it } from 'vitest'
import { type TenantContextService } from '../../common/als/tenant-context.service'
import { OrderEmailsRepository } from './order-emails.repository'

/** The repository over a database that holds nothing and keeps the text of what it is asked. */
function asked() {
  const queries: string[] = []
  const db = drizzle(
    (query) => {
      queries.push(query)
      return Promise.resolve({ rows: [] })
    },
    // The names of the columns as the tenant client writes them.
    { casing: 'snake_case' },
  )
  const context = { tx: () => db } as unknown as TenantContextService
  return { emails: new OrderEmailsRepository(context), queries }
}

describe('the account of the recipient of an order’s email', () => {
  // A column named without its table is read as the column of whichever table holds that name:
  // one added to either table would change what is compared, and the read would report nothing.
  it('is matched to the order by columns named with their tables', async () => {
    const { emails, queries } = asked()

    expect(await emails.account('ada@example.test', 'an-order')).toBeUndefined()

    expect(queries).toHaveLength(1)
    expect(queries[0]).toContain('"order_accounts"."account_id" = "accounts"."id"')
    expect(queries[0]).toMatch(/"order_accounts"\."order_id" = \$\d/)
  })
})
