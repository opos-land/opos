import { createHash } from 'node:crypto'
import { and, eq, notInArray } from 'drizzle-orm'
import { migrationDb } from './client'
import { migrationUrl, reachableUrl } from './migration-url'
import {
  accountRecoveryCodes,
  accounts,
  editionMemberships,
  editions,
  programItemLikes,
  programItems,
  programItemSpeakers,
  tenantMemberships,
  tenants,
} from './schema'
import { createTenant } from './tenants'
import { totp } from './totp'

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

interface SeedItem {
  title: string
  description?: string
  speakers?: string[]
  likedBy?: string[]
}

interface SeedEdition {
  slug: string
  name: string
  startsAt: Date
  endsAt: Date
  isActive: boolean
  isPublished: boolean
  program: SeedItem[]
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
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// The active editions start 60 days after the run, so their programme stays in the future.
const upcoming = (days: number) => {
  const start = new Date(Date.now() + 60 * DAY)
  start.setUTCHours(8, 0, 0, 0)
  return { startsAt: start, endsAt: new Date(start.getTime() + days * DAY + 10 * HOUR) }
}

// Four programme items a day, two hours apart, from two hours after the edition starts.
const ITEMS_PER_DAY = 4
const slot = (edition: Pick<SeedEdition, 'startsAt'>, index: number) => {
  const day = Math.floor(index / ITEMS_PER_DAY)
  const hours = 2 + 2 * (index % ITEMS_PER_DAY)
  const startsAt = new Date(edition.startsAt.getTime() + day * DAY + hours * HOUR)
  return { startsAt, endsAt: new Date(startsAt.getTime() + 1.5 * HOUR) }
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
  { email: 'mfa@example.com', firstName: 'Maria', lastName: 'Zielinska' },
]

// The account with two-factor authentication (PLAN.md 14): a TOTP factor enrolled and verified
// through Supabase Auth, and ten recovery codes of the length the API issues.
const MFA_EMAIL = 'mfa@example.com'
const RECOVERY_CODES = Array.from(
  { length: 10 },
  (_, index) => `DEMORECOVERYCOD${'ABCDEFGHIJ'[index]}`,
)

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
        program: [
          { title: 'Opening ceremony' },
          {
            title: 'Worldbuilding from scratch',
            description: 'Geography, history and belief, in the order a new world needs them.',
            speakers: ['speaker@example.com'],
          },
          { title: 'A history of tabletop role-playing' },
          { title: 'Costume armour workshop' },
          {
            title: 'Writing villains people remember',
            description: 'What a good antagonist wants, and why the reader half agrees.',
            speakers: ['speaker@example.com'],
          },
          { title: 'Board game design clinic' },
          { title: 'Folklore in modern fantasy' },
          { title: 'Closing ceremony' },
        ],
      },
      {
        slug: '2026',
        name: 'Convention A 2026',
        ...upcoming(2),
        isActive: true,
        isPublished: true,
        program: [
          { title: 'Opening ceremony' },
          {
            title: 'Maps for imaginary worlds',
            description: 'Coastlines, rivers and borders that look as if they grew there.',
            likedBy: ['attendee@example.com'],
          },
          { title: 'Running your first campaign', likedBy: ['attendee@example.com'] },
          { title: 'Prop making on a budget' },
          { title: 'Magic systems that hold together', likedBy: ['attendee@example.com'] },
          { title: 'Miniature painting basics' },
          { title: 'Dragons across cultures' },
          { title: 'Live action role-play safety' },
          { title: 'Translating fantasy fiction' },
          { title: 'Speed painting contest' },
          { title: 'An evening of fantasy music' },
          { title: 'Closing ceremony' },
        ],
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
        program: [
          { title: 'Welcome talk' },
          { title: 'An introduction to live role-play' },
          { title: 'Fantasy cartography' },
          { title: 'Closing panel' },
        ],
      },
    ],
    team: [],
  },
]

if (process.env.OPOS_ENV !== 'local' && process.env.OPOS_ENV !== 'dev') {
  console.error('The seed runs where OPOS_ENV is local or dev (PLAN.md 14).')
  process.exit(1)
}

function required(name: string) {
  const value = process.env[name]
  if (!value) {
    console.error(`${name} is not set; run pnpm infra:init`)
    process.exit(1)
  }
  return value
}

// The Auth URL follows the rule of the database URL: a host off the loopback interface needs
// OPOS_ENV dev, so a remote Auth next to a local database gets no account.
let supabaseUrl: string
try {
  supabaseUrl = reachableUrl('SUPABASE_URL', required('SUPABASE_URL'))
} catch (error) {
  console.error((error as Error).message)
  process.exit(1)
}
const authUrl = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`
const secretKey = required('SUPABASE_SECRET_KEY')

const db = migrationDb(migrationUrl())

/** A call to Supabase Auth, authorized by the secret key alone, or by a session on top of it. */
async function authCall<T = object>(
  method: string,
  path: string,
  body?: object,
  accessToken?: string,
) {
  const response = await fetch(`${authUrl}${path}`, {
    method,
    headers: {
      apikey: secretKey,
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`)
  }
  return (await response.json().catch(() => ({}))) as T
}

/** The Supabase Auth admin API (PLAN.md 10). */
const authAdmin = <T = object>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: object,
) => authCall<T>(method, path, body)

async function ensureAccount(account: SeedAccount) {
  const [existing] = await db
    .select({ id: accounts.id, emailConfirmedAt: accounts.emailConfirmedAt })
    .from(accounts)
    .where(eq(accounts.email, account.email))
  // Every seed account is confirmed: createTenant and the invitations count no other.
  if (!existing) {
    await authAdmin('POST', '/admin/users', {
      email: account.email,
      password: DEV_PASSWORD,
      email_confirm: true,
    })
  } else if (!existing.emailConfirmedAt) {
    await authAdmin('PUT', `/admin/users/${existing.id}`, { email_confirm: true })
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

/**
 * Gives the account a verified TOTP factor and ten unused recovery codes. The factor is enrolled
 * and verified through Supabase Auth as a person would, so its trigger sets `mfaEnabledAt`; a
 * verified factor is kept, so a rerun enrolls nothing.
 */
async function ensureTwoFactor(email: string) {
  const id = await accountId(email)
  const { factors: held = [] } = await authAdmin<{ factors?: { id: string; status: string }[] }>(
    'GET',
    `/admin/users/${id}`,
  )
  for (const factor of held.filter((factor) => factor.status !== 'verified')) {
    await authAdmin('DELETE', `/admin/users/${id}/factors/${factor.id}`)
  }
  if (!held.some((factor) => factor.status === 'verified')) await enrollFactor(email)

  const hashes = RECOVERY_CODES.map((code) => createHash('sha256').update(code).digest('hex'))
  await db.transaction(async (tx) => {
    await tx
      .delete(accountRecoveryCodes)
      .where(
        and(
          eq(accountRecoveryCodes.accountId, id),
          notInArray(accountRecoveryCodes.codeHash, hashes),
        ),
      )
    for (const codeHash of hashes) {
      await tx
        .insert(accountRecoveryCodes)
        .values({ accountId: id, codeHash })
        .onConflictDoUpdate({
          target: [accountRecoveryCodes.accountId, accountRecoveryCodes.codeHash],
          set: { usedAt: null },
        })
    }
  })
}

/** Signs in with the dev password, enrolls a TOTP factor and verifies it with its own code. */
async function enrollFactor(email: string) {
  const session = await authCall<{ access_token: string }>('POST', '/token?grant_type=password', {
    email,
    password: DEV_PASSWORD,
  })
  const token = session.access_token
  const factor = await authCall<{ id: string; totp: { secret: string } }>(
    'POST',
    '/factors',
    { factor_type: 'totp', friendly_name: 'Authenticator' },
    token,
  )
  const secret = factor.totp.secret
  const challenge = await authCall<{ id: string }>(
    'POST',
    `/factors/${factor.id}/challenge`,
    {},
    token,
  )
  await authCall(
    'POST',
    `/factors/${factor.id}/verify`,
    { challenge_id: challenge.id, code: totp(secret, Date.now()) },
    token,
  )
  // The output of a local run stays on the developer's machine; on Dev it lands in the deploy log.
  if (process.env.OPOS_ENV === 'local') console.log(`${email} TOTP secret: ${secret}`)
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
  const itemAccounts = new Set(
    spec.editions.flatMap(({ program }) =>
      program.flatMap(({ speakers = [], likedBy = [] }) => [...speakers, ...likedBy]),
    ),
  )
  const accountIds = new Map(
    await Promise.all(
      [...itemAccounts].map(async (email) => [email, await accountId(email)] as const),
    ),
  )

  await db.transaction(async (tx) => {
    await tx
      .update(tenants)
      .set({ name: spec.name, defaultLocale: spec.defaultLocale, timezone: spec.timezone })
      .where(eq(tenants.id, tenantId))

    // Inactive editions first: the partial unique index allows one active edition at a time.
    const editionIds = new Map<string, string>()
    for (const { program, ...edition } of [...spec.editions].sort(
      (a, b) => +a.isActive - +b.isActive,
    )) {
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
      const editionId = row!.id
      editionIds.set(edition.slug, editionId)

      // A programme item has no natural key: its title identifies it within a seeded edition.
      for (const [index, item] of program.entries()) {
        const values = {
          title: item.title,
          description: item.description ?? null,
          ...slot(edition, index),
        }
        const [existing] = await tx
          .select({ id: programItems.id })
          .from(programItems)
          .where(and(eq(programItems.editionId, editionId), eq(programItems.title, item.title)))
        const [saved] = existing
          ? await tx
              .update(programItems)
              .set(values)
              .where(eq(programItems.id, existing.id))
              .returning({ id: programItems.id })
          : await tx
              .insert(programItems)
              .values({ tenantId, editionId, ...values })
              .returning({ id: programItems.id })
        const onItem = (email: string) => ({
          tenantId,
          programItemId: saved!.id,
          accountId: accountIds.get(email)!,
        })
        for (const email of item.speakers ?? []) {
          await tx.insert(programItemSpeakers).values(onItem(email)).onConflictDoNothing()
        }
        for (const email of item.likedBy ?? []) {
          await tx.insert(programItemLikes).values(onItem(email)).onConflictDoNothing()
        }
      }
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
  await ensureTwoFactor(MFA_EMAIL)
  for (const tenant of TENANTS) await seedTenant(tenant)
  console.log(
    `Seeded ${TENANTS.length} tenants and ${ACCOUNTS.length} accounts; password ${DEV_PASSWORD}.`,
  )
} finally {
  await db.$client.end()
}
