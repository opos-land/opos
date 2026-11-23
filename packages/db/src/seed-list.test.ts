import { describe, expect, it } from 'vitest'
import { listSeed, type ListedSeed } from './seed-list'

const SEED: ListedSeed = {
  password: 'password123',
  accounts: [
    { email: 'head@a.test', firstName: 'Anna', lastName: 'Nowak' },
    { email: 'program@a.test', firstName: 'Piotr', lastName: 'Lis' },
    { email: 'old@a.test', firstName: 'Marek', lastName: 'Sowa' },
    { email: 'speaker@example.com', firstName: 'Kasia', lastName: 'Mazur', nickname: 'Mazurek' },
    { email: 'fan@example.com', firstName: 'Jan', lastName: 'Kowal' },
  ],
  admin: { email: 'admin@example.com', firstName: 'Adam', lastName: 'Wrona' },
  twoFactor: ['fan@example.com'],
  profiles: [
    { email: 'speaker@example.com', published: true, avatar: true, reports: [{}, {}] },
    { email: 'fan@example.com' },
    { email: 'old@a.test', takenDown: { reviewRequested: true } },
  ],
  tenants: [
    {
      slug: 'a',
      name: 'Convention A',
      defaultLocale: 'pl',
      timezone: 'Europe/Warsaw',
      headEmail: 'head@a.test',
      shop: {},
      editions: [
        {
          slug: '2025',
          name: 'Convention A 2025',
          startsAt: new Date('2025-06-13T08:00:00Z'),
          endsAt: new Date('2025-06-15T18:00:00Z'),
          isActive: false,
          isPublished: true,
          program: [{ title: 'Opening', speakers: ['speaker@example.com'] }],
          shop: { open: false },
        },
        {
          slug: '2026',
          name: 'Convention A 2026',
          startsAt: new Date('2026-06-12T08:00:00Z'),
          endsAt: new Date('2026-06-14T18:00:00Z'),
          isActive: true,
          isPublished: false,
          program: [
            { title: 'Maps', speakers: ['speaker@example.com'], likedBy: ['fan@example.com'] },
            { title: 'Dragons', likedBy: ['fan@example.com'] },
          ],
          shop: {
            open: true,
            catalog: { ticketTypes: [{}, {}], addOns: [{}], items: [{}, {}, {}] },
            discountCodes: [{}],
            orders: [{ account: 'fan@example.com' }, {}],
            scanners: [{}, { revoked: true }],
          },
        },
      ],
      team: [
        {
          email: 'program@a.test',
          tenant: { settingsAccess: 'read', brandingAccess: 'none' },
          editions: { '2026': { programAccess: 'write', websiteContentAccess: 'read' } },
        },
        { email: 'old@a.test', expired: true, tenant: { shopConfigAccess: 'write' } },
      ],
    },
    {
      slug: 'b',
      name: 'Convention B',
      defaultLocale: 'en',
      timezone: 'Europe/Prague',
      headEmail: 'head@b.test',
      suspended: true,
      editions: [],
      team: [{ email: 'head@a.test', role: 'head' }],
    },
  ],
}

/** The lines of a section, each cut at its column gaps. */
function section(text: string, title: string) {
  const start = text.split('\n').indexOf(title)
  expect(start).toBeGreaterThanOrEqual(0)
  const lines = text.split('\n').slice(start + 1)
  const end = lines.indexOf('')
  return (end === -1 ? lines : lines.slice(0, end)).map((line) => line.trim().split(/ {2,}/))
}

describe('listSeed', () => {
  const text = listSeed(SEED)

  it('gives the password every account signs in with', () => {
    expect(text.split('\n')[0]).toBe('Every account signs in with the password password123.')
  })

  it('lists every account with what it is in the demo', () => {
    expect(section(text, 'Accounts')).toEqual([
      ['head@a.test', 'Anna Nowak', 'head of a; head of b'],
      [
        'program@a.test',
        'Piotr Lis',
        'org of a: settings read, 2026 program write, 2026 website content read',
      ],
      ['old@a.test', 'Marek Sowa', 'expired org of a: shop config write'],
      ['speaker@example.com', 'Kasia "Mazurek" Mazur', 'speaker of 2 programme items'],
      ['fan@example.com', 'Jan Kowal', '2 likes; 1 order; two-factor authentication'],
      ['admin@example.com', 'Adam Wrona', 'admin; two-factor authentication; local only'],
    ])
  })

  it('aligns the columns of a section', () => {
    const lines = text.split('\n')
    const start = lines.indexOf('Accounts') + 1
    const rows = lines.slice(start, lines.indexOf('', start))
    const nameColumn = rows.map((line) => line.indexOf(line.trim().split(/ {2,}/)[1] ?? ''))
    expect(rows).toHaveLength(6)
    expect(new Set(nameColumn).size).toBe(1)
  })

  it('lists every tenant with its editions and what their shops hold', () => {
    expect(section(text, 'Tenants')).toEqual([
      ['a', 'Convention A', 'pl, Europe/Warsaw', 'seller details set'],
      [
        '2025',
        'Convention A 2025',
        '2025-06-13 to 2025-06-15',
        'published',
        '1 programme item',
        'shop closed',
      ],
      [
        '2026',
        'Convention A 2026',
        '2026-06-12 to 2026-06-14',
        'active, unpublished',
        '2 programme items',
        'shop open: 2 ticket types, 1 add-on, 3 merchandise items, 1 discount code, 2 orders, 2 scanners (1 revoked)',
      ],
      ['b', 'Convention B', 'en, Europe/Prague', 'suspended'],
    ])
  })

  it('lists every profile with its state', () => {
    expect(section(text, 'Profiles')).toEqual([
      ['speaker@example.com', 'published; avatar; 2 reports'],
      ['fan@example.com', 'unpublished'],
      ['old@a.test', 'taken down, review requested'],
    ])
  })
})
