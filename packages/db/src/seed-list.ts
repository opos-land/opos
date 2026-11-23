// What `pnpm db:seed --list` prints: the demo data of the seed, read from its definitions, with no
// connection opened. Each shape takes only the fields the list shows of the seed's own.

type Access = 'none' | 'read' | 'write'

interface ListedAccount {
  email: string
  firstName: string
  lastName: string
  nickname?: string
}

interface ListedProfile {
  email: string
  published?: boolean
  avatar?: boolean
  takenDown?: { reviewRequested: boolean }
  reports?: unknown[]
}

interface ListedMember {
  email: string
  role?: 'head' | 'org'
  expired?: boolean
  tenant?: Record<string, Access | undefined>
  editions?: Record<string, Record<string, Access | undefined>>
}

interface ListedEdition {
  slug: string
  name: string
  startsAt: Date
  endsAt: Date
  isActive: boolean
  isPublished: boolean
  program: { title: string; speakers?: string[]; likedBy?: string[] }[]
  shop?: {
    open: boolean
    catalog?: { ticketTypes: unknown[]; addOns: unknown[]; items: unknown[] }
    discountCodes?: unknown[]
    orders?: { account?: string }[]
    scanners?: { revoked?: boolean }[]
  }
}

interface ListedTenant {
  slug: string
  name: string
  defaultLocale: string
  timezone: string
  headEmail: string
  suspended?: boolean
  shop?: object
  editions: ListedEdition[]
  team: ListedMember[]
}

export interface ListedSeed {
  password: string
  accounts: ListedAccount[]
  /** Seeded on the local stack alone. */
  admin: ListedAccount
  /** The accounts with two-factor authentication on, the admin's aside. */
  twoFactor: string[]
  profiles: ListedProfile[]
  tenants: ListedTenant[]
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const words = (key: string) =>
  key.replace(/Access$/, '').replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)

const day = (date: Date) => date.toISOString().slice(0, 10)

/** The rows padded into columns two spaces apart, each row indented by two. */
function columns(rows: string[][]) {
  const widths = rows.reduce<number[]>(
    (max, row) => row.map((cell, index) => Math.max(max[index] ?? 0, cell.length)),
    [],
  )
  return rows.map(
    (row) =>
      `  ${row.map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index] ?? 0))).join('  ')}`,
  )
}

function name(account: ListedAccount) {
  return account.nickname
    ? `${account.firstName} "${account.nickname}" ${account.lastName}`
    : `${account.firstName} ${account.lastName}`
}

function permissions(member: ListedMember) {
  const granted = (entries: [string, Access | undefined][], prefix = '') =>
    entries
      .filter(([, access]) => access && access !== 'none')
      .map(([key, access]) => `${prefix}${words(key)} ${access}`)
  return [
    ...granted(Object.entries(member.tenant ?? {})),
    ...Object.entries(member.editions ?? {}).flatMap(([edition, access]) =>
      granted(Object.entries(access), `${edition} `),
    ),
  ]
}

function roles(seed: ListedSeed, email: string) {
  const held: string[] = []
  for (const tenant of seed.tenants) {
    if (tenant.headEmail === email) held.push(`head of ${tenant.slug}`)
    for (const member of tenant.team.filter((member) => member.email === email)) {
      if (member.role === 'head') {
        held.push(`head of ${tenant.slug}`)
        continue
      }
      const granted = permissions(member)
      const org = `${member.expired ? 'expired ' : ''}org of ${tenant.slug}`
      held.push(granted.length ? `${org}: ${granted.join(', ')}` : org)
    }
  }
  const editions = seed.tenants.flatMap((tenant) => tenant.editions)
  const items = editions.flatMap((edition) => edition.program)
  const spoken = items.filter((item) => item.speakers?.includes(email)).length
  if (spoken) held.push(`speaker of ${count(spoken, 'programme item')}`)
  const liked = items.filter((item) => item.likedBy?.includes(email)).length
  if (liked) held.push(count(liked, 'like'))
  const ordered = editions
    .flatMap((edition) => edition.shop?.orders ?? [])
    .filter((order) => order.account === email).length
  if (ordered) held.push(count(ordered, 'order'))
  if (seed.twoFactor.includes(email)) held.push('two-factor authentication')
  return held
}

function shop(edition: ListedEdition) {
  if (!edition.shop) return 'no shop'
  const { open, catalog, discountCodes = [], orders = [], scanners = [] } = edition.shop
  const held = catalog
    ? [
        count(catalog.ticketTypes.length, 'ticket type'),
        count(catalog.addOns.length, 'add-on'),
        count(catalog.items.length, 'merchandise item'),
        count(discountCodes.length, 'discount code'),
        count(orders.length, 'order'),
      ]
    : []
  if (scanners.length) {
    const revoked = scanners.filter((scanner) => scanner.revoked).length
    held.push(`${count(scanners.length, 'scanner')}${revoked ? ` (${revoked} revoked)` : ''}`)
  }
  const state = open ? 'shop open' : 'shop closed'
  return held.length ? `${state}: ${held.join(', ')}` : state
}

function tenantLines(tenant: ListedTenant) {
  const state = [tenant.suspended && 'suspended', tenant.shop && 'seller details set'].filter(
    (part): part is string => Boolean(part),
  )
  const [head] = columns([
    [tenant.slug, tenant.name, `${tenant.defaultLocale}, ${tenant.timezone}`, ...state],
  ])
  const editions = columns(
    tenant.editions.map((edition) => [
      edition.slug,
      edition.name,
      `${day(edition.startsAt)} to ${day(edition.endsAt)}`,
      [edition.isActive && 'active', edition.isPublished ? 'published' : 'unpublished']
        .filter(Boolean)
        .join(', '),
      count(edition.program.length, 'programme item'),
      shop(edition),
    ]),
  ).map((line) => `  ${line}`)
  return [head, ...editions]
}

function profileState(profile: ListedProfile) {
  if (profile.takenDown) {
    return profile.takenDown.reviewRequested ? 'taken down, review requested' : 'taken down'
  }
  return [
    profile.published ? 'published' : 'unpublished',
    profile.avatar && 'avatar',
    profile.reports?.length && count(profile.reports.length, 'report'),
  ]
    .filter(Boolean)
    .join('; ')
}

export function listSeed(seed: ListedSeed): string {
  const accounts = [
    ...seed.accounts.map((account) => [
      account.email,
      name(account),
      roles(seed, account.email).join('; '),
    ]),
    [
      seed.admin.email,
      name(seed.admin),
      ['admin', 'two-factor authentication', 'local only'].join('; '),
    ],
  ]
  return [
    `Every account signs in with the password ${seed.password}.`,
    '',
    'Accounts',
    ...columns(accounts),
    '',
    'Tenants',
    ...seed.tenants.flatMap(tenantLines),
    '',
    'Profiles',
    ...columns(seed.profiles.map((profile) => [profile.email, profileState(profile)])),
  ].join('\n')
}
