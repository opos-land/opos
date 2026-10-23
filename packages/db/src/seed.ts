import { createHmac } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { migrationDb } from './client'
import { migrationUrl } from './migration-url'
import { accounts, editionMemberships, editions, tenantMemberships, tenants } from './schema'
import { createTenant } from './tenants'

// Demo data (PLAN.md 14). Idempotent: every run converges on the same rows.

type Access = 'none' | 'read' | 'write'

interface SeedAccount {
  email: string
  firstName: string
  lastName: string
  locale?: string
}

interface SeedMember {
  email: string
  expired?: boolean
  tenant?: { settingsAccess?: Access; brandingAccess?: Access; shopConfigAccess?: Access }
  editions?: Record<
    string,
    { programAccess?: Access; websiteContentAccess?: Access; ticketsAccess?: Access }
  >
}

interface SeedEdition {
  slug: string
  name: string
  startsAt: Date
  endsAt: Date
  isActive: boolean
  isPublished: boolean
}

interface SeedTenant {
  slug: string
  name: string
  defaultLocale: string
  timezone: string
  headEmail: string
  editions: SeedEdition[]
  team: SeedMember[]
}

const DEV_PASSWORD = 'password123'
const DEV_JWT_SECRET = 'dev-jwt-secret-at-least-32-characters-long'
const DAY = 24 * 60 * 60 * 1000

// The active editions start 60 days after the run, so their programme stays in the future.
const upcoming = (days: number) => {
  const start = new Date(Date.now() + 60 * DAY)
  start.setUTCHours(8, 0, 0, 0)
  return { startsAt: start, endsAt: new Date(start.getTime() + days * DAY + 10 * 60 * 60 * 1000) }
}

const ACCOUNTS: SeedAccount[] = [
  { email: 'head@convention-a.test', firstName: 'Anna', lastName: 'Nowak' },
  { email: 'program@convention-a.test', firstName: 'Piotr', lastName: 'Lis' },
  { email: 'settings@convention-a.test', firstName: 'Ewa', lastName: 'Wilk' },
  { email: 'viewer@convention-a.test', firstName: 'Tom', lastName: 'Baker', locale: 'en' },
  { email: 'expired@convention-a.test', firstName: 'Marek', lastName: 'Sowa' },
  { email: 'gate@convention-a.test', firstName: 'Ola', lastName: 'Kruk' },
  { email: 'head@convention-b.test', firstName: 'Jana', lastName: 'Novak' },
  { email: 'speaker@example.com', firstName: 'Kasia', lastName: 'Mazur' },
  { email: 'attendee@example.com', firstName: 'Jan', lastName: 'Kowal' },
]

const TENANTS: SeedTenant[] = [
  {
    slug: 'convention-a',
    name: 'Convention A',
    defaultLocale: 'pl',
    timezone: 'Europe/Warsaw',
    headEmail: 'head@convention-a.test',
    editions: [
      {
        slug: '2025',
        name: 'Convention A 2025',
        startsAt: new Date('2025-06-13T08:00:00Z'),
        endsAt: new Date('2025-06-15T18:00:00Z'),
        isActive: false,
        isPublished: true,
      },
      {
        slug: '2026',
        name: 'Convention A 2026',
        ...upcoming(2),
        isActive: true,
        isPublished: true,
      },
    ],
    team: [
      { email: 'program@convention-a.test', editions: { '2026': { programAccess: 'write' } } },
      { email: 'settings@convention-a.test', tenant: { settingsAccess: 'write' } },
      {
        email: 'viewer@convention-a.test',
        tenant: { settingsAccess: 'read' },
        editions: { '2026': { programAccess: 'read' } },
      },
      {
        email: 'expired@convention-a.test',
        expired: true,
        tenant: { settingsAccess: 'write' },
        editions: { '2026': { programAccess: 'write' } },
      },
      { email: 'gate@convention-a.test', editions: { '2026': { ticketsAccess: 'write' } } },
    ],
  },
  {
    slug: 'convention-b',
    name: 'Convention B',
    defaultLocale: 'en',
    timezone: 'Europe/Prague',
    headEmail: 'head@convention-b.test',
    editions: [
      {
        slug: '2026',
        name: 'Convention B 2026',
        ...upcoming(1),
        isActive: true,
        isPublished: true,
      },
    ],
    team: [],
  },
]

const production = process.env.NODE_ENV === 'production'
if (production && !process.argv.includes('--i-know-what-i-am-doing')) {
  console.error('Refusing to seed with NODE_ENV=production without --i-know-what-i-am-doing.')
  process.exit(1)
}

const jwtSecret = process.env.JWT_SECRET ?? (production ? undefined : DEV_JWT_SECRET)
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || (jwtSecret && serviceRoleKey(jwtSecret))
if (!serviceKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY or JWT_SECRET to create accounts.')
  process.exit(1)
}
const authUrl = process.env.AUTH_URL ?? `http://localhost:${process.env.OPOS_AUTH_PORT ?? '9999'}`

const db = migrationDb(migrationUrl())

/** A short-lived service_role JWT for the GoTrue admin API, signed like PLAN.md 10 describes. */
function serviceRoleKey(secret: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role: 'service_role', iat: now, exp: now + 600 })}`
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`
}

async function ensureAccount(account: SeedAccount) {
  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.email, account.email))
  if (!existing) {
    const response = await fetch(`${authUrl}/admin/users`, {
      method: 'POST',
      headers: { authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email: account.email, password: DEV_PASSWORD, email_confirm: true }),
    })
    if (!response.ok) {
      throw new Error(
        `Creating ${account.email} failed: ${response.status} ${await response.text()}`,
      )
    }
  }
  // The auth.users trigger created the row; the seed owns the names and the locale.
  await db
    .update(accounts)
    .set({
      firstName: account.firstName,
      lastName: account.lastName,
      locale: account.locale ?? null,
    })
    .where(eq(accounts.email, account.email))
}

async function accountId(email: string) {
  const [row] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, email))
  if (!row) throw new Error(`Seed account ${email} is missing`)
  return row.id
}

async function seedTenant(spec: SeedTenant) {
  const [existing] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, spec.slug))
  const tenantId = existing
    ? existing.id
    : (
        await createTenant(db, {
          slug: spec.slug,
          name: spec.name,
          headEmail: spec.headEmail,
          defaultLocale: spec.defaultLocale,
          timezone: spec.timezone,
        })
      ).id

  const headId = await accountId(spec.headEmail)
  const team = await Promise.all(
    spec.team.map(async (member) => ({ ...member, id: await accountId(member.email) })),
  )

  await db.transaction(async (tx) => {
    await tx
      .update(tenants)
      .set({ name: spec.name, defaultLocale: spec.defaultLocale, timezone: spec.timezone })
      .where(eq(tenants.id, tenantId))

    // Inactive editions first: the partial unique index allows one active edition at a time.
    const editionIds = new Map<string, string>()
    for (const edition of [...spec.editions].sort((a, b) => +a.isActive - +b.isActive)) {
      const [row] = await tx
        .insert(editions)
        .values({ tenantId, ...edition })
        .onConflictDoUpdate({
          target: [editions.tenantId, editions.slug],
          set: {
            name: edition.name,
            startsAt: edition.startsAt,
            endsAt: edition.endsAt,
            isActive: edition.isActive,
            isPublished: edition.isPublished,
          },
        })
        .returning({ id: editions.id })
      editionIds.set(edition.slug, row!.id)
    }

    const members = [
      {
        id: headId,
        role: 'head' as const,
        expiresAt: null,
        tenant: {} as NonNullable<SeedMember['tenant']>,
        editions: {} as NonNullable<SeedMember['editions']>,
      },
      ...team.map((member) => ({
        id: member.id,
        role: 'org' as const,
        expiresAt: member.expired ? new Date(Date.now() - DAY) : null,
        tenant: member.tenant ?? {},
        editions: member.editions ?? {},
      })),
    ]
    for (const member of members) {
      const access = {
        role: member.role,
        settingsAccess: member.tenant.settingsAccess ?? 'none',
        brandingAccess: member.tenant.brandingAccess ?? 'none',
        shopConfigAccess: member.tenant.shopConfigAccess ?? 'none',
        expiresAt: member.expiresAt,
      }
      const [membership] = await tx
        .insert(tenantMemberships)
        .values({ accountId: member.id, tenantId, ...access })
        .onConflictDoUpdate({
          target: [tenantMemberships.accountId, tenantMemberships.tenantId],
          set: access,
        })
        .returning({ id: tenantMemberships.id })

      for (const [slug, permissions] of Object.entries(member.editions)) {
        const editionAccess = {
          programAccess: permissions.programAccess ?? 'none',
          websiteContentAccess: permissions.websiteContentAccess ?? 'none',
          ticketsAccess: permissions.ticketsAccess ?? 'none',
        }
        await tx
          .insert(editionMemberships)
          .values({
            tenantId,
            tenantMembershipId: membership!.id,
            editionId: editionIds.get(slug)!,
            ...editionAccess,
          })
          .onConflictDoUpdate({
            target: [editionMemberships.tenantMembershipId, editionMemberships.editionId],
            set: editionAccess,
          })
      }
    }
  })
}

try {
  for (const account of ACCOUNTS) await ensureAccount(account)
  for (const tenant of TENANTS) await seedTenant(tenant)
  console.log(
    `Seeded ${TENANTS.length} tenants and ${ACCOUNTS.length} accounts; password ${DEV_PASSWORD}.`,
  )
} finally {
  await db.$client.end()
}
