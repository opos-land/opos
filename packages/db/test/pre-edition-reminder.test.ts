import { describe, expect, it } from 'vitest'
import { globalReads } from '../src/verify'
import { createEdition, createTenant, global, inTenant, migrator } from './db'

// The settings of the pre-edition reminder (docs/specs/0011-pre-edition-reminder.md): how many
// days before the edition it goes out, the opening hours it tells, and when it went out.

async function shop() {
  const tenant = await createTenant()
  const edition = await createEdition(tenant.id)
  await migrator`insert into edition_shops (tenant_id, edition_id) values (${tenant.id}, ${edition})`
  return { tenant: tenant.id, edition }
}

describe('the reminder settings of an edition', () => {
  it('are set by the application role: the days, the opening hours and when it went out', async () => {
    const at = await shop()

    await inTenant(
      at.tenant,
      (sql) => sql`
        update edition_shops set reminder_days_before = 3,
          opening_hours = 'Friday to Sunday, 10 to 20.', reminder_sent_at = now()
        where edition_id = ${at.edition}
      `,
    )

    const [row] = await migrator`
      select reminder_days_before, opening_hours, reminder_sent_at is not null as sent
      from edition_shops where edition_id = ${at.edition}
    `
    expect(row).toEqual({
      reminder_days_before: 3,
      opening_hours: 'Friday to Sunday, 10 to 20.',
      sent: true,
    })
  })

  it.each([
    ['no day before the edition', 'reminder_days_before', 0],
    ['more than sixty days before it', 'reminder_days_before', 61],
    ['opening hours over 1000 characters', 'opening_hours', 'h'.repeat(1001)],
  ])('refuse %s', async (_, column, value) => {
    const at = await shop()

    await expect(
      migrator`update edition_shops set ${migrator(column)} = ${value} where edition_id = ${at.edition}`,
    ).rejects.toThrow(/edition_shops_(reminder_days_before|opening_hours)/)
  })
})

describe('the editions whose reminder is due, across tenants', () => {
  it('are found by the days and whether it went out, and nothing else of a shop is read', async () => {
    const at = await shop()
    await migrator`update edition_shops set reminder_days_before = 5 where edition_id = ${at.edition}`

    const found = await global`
      select tenant_id, edition_id, reminder_days_before, reminder_sent_at
      from edition_shops where edition_id = ${at.edition}
    `

    expect(found).toEqual([
      {
        tenant_id: at.tenant,
        edition_id: at.edition,
        reminder_days_before: 5,
        reminder_sent_at: null,
      },
    ])
    const reads = globalReads
      .filter((read) => read.startsWith('edition_shops.'))
      .map((read) => read.split('.')[1])
    expect(reads.sort()).toEqual([
      'edition_id',
      'reminder_days_before',
      'reminder_sent_at',
      'tenant_id',
    ])
    for (const column of ['opening_hours', 'pickup_information', 'opened_at', 'faq_url']) {
      await expect(
        global.unsafe(`select ${column} from edition_shops limit 1`),
        column,
      ).rejects.toThrow(/permission denied/)
    }
    await expect(
      global.unsafe('update edition_shops set reminder_sent_at = now() where false'),
    ).rejects.toThrow(/permission denied/)
  })
})
