import { createHash } from 'node:crypto'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { and, eq, notInArray, sql } from 'drizzle-orm'
import { grantAdmin } from './admins'
import { migrationDb } from './client'
import { demoPdf } from './demo-pdf'
import { migrationUrl, reachableUrl } from './migration-url'
import {
  accountRecoveryCodes,
  accounts,
  admins,
  editionConsents,
  editionDocuments,
  editionDocumentVersions,
  editionMemberships,
  editions,
  editionShops,
  paymentProviderAccounts,
  programItemLikes,
  programItems,
  programItemSpeakers,
  retiredTenantSlugs,
  shopSellers,
  tenantMemberships,
  tenants,
  uploadedFiles,
} from './schema'
import { open, providerAccountOf, seal, sealingKey } from './sealed'
import { createTenant, restoreTenant, suspendTenant } from './tenants'
import { totp } from './totp'

// Demo data. Idempotent: every run converges on the same rows.

type Access = 'none' | 'read' | 'write'

interface SeedAccount {
  email: string
  firstName: string
  lastName: string
  locale?: string
  theme?: 'light' | 'dark'
}

interface SeedMember {
  email: string
  /** `org` when left out; a head holds no permission of its own and never expires. */
  role?: 'head' | 'org'
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

type DocumentKind = (typeof editionDocuments.kind.enumValues)[number]

/** A legal document of a demo edition, published once as a PDF of these lines. */
interface SeedDocument {
  kind: DocumentKind
  title: string
  lines: string[]
}

/** A consent of a demo edition, in the order given; it may link the edition's document of a kind. */
interface SeedConsent {
  text: string
  isRequired: boolean
  document?: DocumentKind
}

/** The shop of a demo edition: what opening asks of the edition, and whether it is open. */
interface SeedEditionShop {
  open: boolean
  faqUrl?: string
  documents: SeedDocument[]
  consents: SeedConsent[]
}

interface SeedEdition {
  slug: string
  name: string
  startsAt: Date
  endsAt: Date
  isActive: boolean
  isPublished: boolean
  /** Where the edition takes place, as its page and the list of editions show it. */
  venueName: string
  venueAddress: string
  venueCity: string
  program: SeedItem[]
  /** Left out, the edition has set nothing of its shop. */
  shop?: SeedEditionShop
}

/** What a demo convention has set of its shop: its seller's details and its provider account. */
interface SeedShop {
  sellerName: string
  sellerAddress: string
  sellerRegistrationNumber: string
  contactEmail: string
  /** The credentials the fake provider takes as ready to sell. */
  credentials: Record<string, string>
}

interface SeedTenant {
  slug: string
  name: string
  defaultLocale: string
  timezone: string
  headEmail: string
  /** Suspended by the admin: off for everyone else, with everything it owns kept. */
  suspended?: boolean
  /** Left out, the convention has set nothing of its shop. */
  shop?: SeedShop
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
  {
    email: 'viewer@convention-a.test',
    firstName: 'Tom',
    lastName: 'Baker',
    locale: 'en',
    theme: 'dark',
  },
  { email: 'expired@convention-a.test', firstName: 'Marek', lastName: 'Sowa' },
  { email: 'gate@convention-a.test', firstName: 'Ola', lastName: 'Kruk' },
  { email: 'head@convention-b.test', firstName: 'Jana', lastName: 'Novak' },
  { email: 'head@convention-c.test', firstName: 'Igor', lastName: 'Bielik' },
  { email: 'speaker@example.com', firstName: 'Kasia', lastName: 'Mazur' },
  { email: 'attendee@example.com', firstName: 'Jan', lastName: 'Kowal' },
  { email: 'mfa@example.com', firstName: 'Maria', lastName: 'Zielinska' },
  { email: 'multi@example.com', firstName: 'Olga', lastName: 'Duda' },
]

// The accounts with two-factor authentication: a TOTP factor enrolled and verified
// through Supabase Auth, and ten recovery codes of the length the API issues.
const MFA_EMAIL = 'mfa@example.com'
// The admin: two-factor authentication on, as the role needs, and the role granted on that factor.
// On the local stack alone. The demo password and recovery codes are public: on the shared Dev
// anyone could sign in with them, replace the factor and wait for the next run to grant the role
// to the new one. On Dev a person's own account is granted the role with `pnpm db:admin:grant`.
const ADMIN: SeedAccount = { email: 'admin@example.com', firstName: 'Adam', lastName: 'Wrona' }
const SEEDS_ADMIN = process.env.OPOS_ENV === 'local'
const RECOVERY_CODES = Array.from(
  { length: 10 },
  (_, index) => `DEMORECOVERYCOD${'ABCDEFGHIJ'[index]}`,
)

// The text of every demo document says what it is: OPOS ships no legal text of its own.
const demoDocument = (kind: DocumentKind, title: string): SeedDocument => ({
  kind,
  title,
  lines: [
    'This is a demo document of a demo convention.',
    'It stands in for a text the convention writes itself and binds nobody.',
  ],
})

const TENANTS: SeedTenant[] = [
  {
    slug: 'convention-a',
    name: 'Convention A',
    defaultLocale: 'pl',
    timezone: 'Europe/Warsaw',
    headEmail: 'head@convention-a.test',
    // Ready to sell: the seller's details complete, and an account of the fake provider.
    shop: {
      sellerName: 'Convention A Foundation',
      sellerAddress: 'ul. Przykładowa 1, 61-001 Poznań',
      sellerRegistrationNumber: 'KRS 0000000000',
      contactEmail: 'shop@convention-a.test',
      credentials: { account: 'demo' },
    },
    editions: [
      {
        slug: '2025',
        name: 'Convention A 2025',
        startsAt: new Date('2025-06-13T08:00:00Z'),
        endsAt: new Date('2025-06-15T18:00:00Z'),
        isActive: false,
        isPublished: true,
        venueName: 'Old Brewery Hall',
        venueAddress: 'ul. Przykładowa 12',
        venueCity: 'Poznań',
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
        // Closed, and not ready to open: it has its shop terms and no privacy policy.
        shop: {
          open: false,
          documents: [demoDocument('shop-terms', 'Shop terms 2025')],
          consents: [],
        },
      },
      {
        slug: '2026',
        name: 'Convention A 2026',
        ...upcoming(2),
        isActive: true,
        isPublished: true,
        venueName: 'Exhibition Grounds, Hall 3',
        venueAddress: 'ul. Przykładowa 40',
        venueCity: 'Poznań',
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
        // Open: every condition of opening holds.
        shop: {
          open: true,
          faqUrl: 'https://convention-a.test/faq',
          documents: [
            demoDocument('shop-terms', 'Shop terms'),
            demoDocument('privacy-policy', 'Privacy policy'),
            demoDocument('edition-rules', 'Convention rules'),
          ],
          consents: [
            { text: 'I accept the shop terms.', isRequired: true, document: 'shop-terms' },
            {
              text: 'I have read the privacy policy.',
              isRequired: true,
              document: 'privacy-policy',
            },
            { text: 'I want to receive news of the convention by email.', isRequired: false },
          ],
        },
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
      { email: 'multi@example.com', role: 'head' },
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
        venueName: 'Riverside Community Centre',
        venueAddress: 'Vzorová 7',
        venueCity: 'Praha',
        program: [
          { title: 'Welcome talk' },
          { title: 'An introduction to live role-play' },
          { title: 'Fantasy cartography' },
          { title: 'Closing panel' },
        ],
      },
    ],
    team: [{ email: 'multi@example.com', role: 'head' }],
  },
  {
    slug: 'convention-c',
    name: 'Convention C',
    defaultLocale: 'pl',
    timezone: 'Europe/Warsaw',
    headEmail: 'head@convention-c.test',
    suspended: true,
    editions: [
      {
        slug: '2026',
        name: 'Convention C 2026',
        ...upcoming(1),
        isActive: true,
        isPublished: true,
        venueName: 'Student Union',
        venueAddress: 'ul. Przykładowa 3',
        venueCity: 'Wrocław',
        program: [
          { title: 'Welcome talk' },
          { title: 'Heraldry for invented kingdoms', likedBy: ['attendee@example.com'] },
          { title: 'Closing panel' },
        ],
      },
    ],
    team: [],
  },
]

if (process.env.OPOS_ENV !== 'local' && process.env.OPOS_ENV !== 'dev') {
  console.error('The seed runs where OPOS_ENV is local or dev.')
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

// The key the API opens a provider account's credentials with seals the demo account's.
const credentialsKey = sealingKey(required('PAYMENT_CREDENTIALS_KEY'))

// The bucket the API reads holds the demo documents. Its address follows the rule of the database
// URL too: a bucket off the loopback interface needs OPOS_ENV dev.
const s3 = {
  endpoint: required('S3_ENDPOINT'),
  region: required('S3_REGION'),
  bucket: required('S3_BUCKET'),
  accessKeyId: required('S3_ACCESS_KEY_ID'),
  secretAccessKey: required('S3_SECRET_ACCESS_KEY'),
}
try {
  reachableUrl('S3_ENDPOINT', s3.endpoint)
} catch (error) {
  console.error((error as Error).message)
  process.exit(1)
}
const bucket = new S3Client({
  endpoint: s3.endpoint,
  region: s3.region,
  credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
  forcePathStyle: true,
  // An S3-compatible bucket takes the checksums S3 itself asks for, and no others.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})

/** The kind the API's storage keeps a version of a legal document as. */
const DOCUMENT_FILE_KIND = 'edition-document'

/**
 * Where the API's storage reads an edition's file that is no image: under its tenant and the
 * file, as `file` (apps/api/src/modules/files/owners.ts). An API test reads a seeded document
 * through the public route, so a change of the layout there fails it.
 */
const fileObjectKey = (tenantId: string, fileId: string) => `tenants/${tenantId}/${fileId}/file`

/** An object the bucket gets once the rows that point at it are committed. */
interface PendingObject {
  key: string
  bytes: Buffer
}

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

/** The Supabase Auth admin API. */
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
  // The auth.users trigger created the row; the seed owns the names, the locale and the theme.
  await db
    .update(accounts)
    .set({
      firstName: account.firstName,
      lastName: account.lastName,
      locale: account.locale ?? null,
      theme: account.theme ?? null,
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
  if (!held.some((factor) => factor.status === 'verified')) {
    // Enrolling signs in with the dev password, which the person may have changed since; it is
    // set only here, so a rerun that finds the factor leaves the password alone.
    await authAdmin('PUT', `/admin/users/${id}`, { password: DEV_PASSWORD })
    await enrollFactor(email)
  }

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

/**
 * Grants the account the admin role unless a grant of its present factor stands, so a rerun
 * leaves no second entry in the log and a replaced factor gets a new grant.
 */
async function ensureAdmin(email: string) {
  const [grant] = await db
    .select({ stands: sql<boolean>`${admins.mfaEnabledAt} = ${accounts.mfaEnabledAt}` })
    .from(admins)
    .innerJoin(accounts, eq(accounts.id, admins.accountId))
    .where(eq(accounts.email, email))
  if (!grant?.stands) await grantAdmin(db, email)
}

async function accountId(email: string) {
  const [row] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, email))
  if (!row) throw new Error(`Seed account ${email} is missing`)
  return row.id
}

async function seedTenant(spec: SeedTenant) {
  // The seed owns the slugs of its tenants: one an admin deleted is retired for good, and freed
  // here, so the demo tenant returns.
  await db.delete(retiredTenantSlugs).where(eq(retiredTenantSlugs.slug, spec.slug))
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

  const objects: PendingObject[] = []
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
            venueName: edition.venueName,
            venueAddress: edition.venueAddress,
            venueCity: edition.venueCity,
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

    if (spec.shop) await seedShop(tx, tenantId, spec.shop)
    for (const edition of spec.editions) {
      if (!edition.shop) continue
      objects.push(
        ...(await seedEditionShop(tx, tenantId, editionIds.get(edition.slug)!, edition.shop)),
      )
    }

    // A head holds no permission of its own and never expires.
    const asHead = (id: string) => ({
      id,
      role: 'head' as const,
      expiresAt: null,
      tenant: {} as NonNullable<SeedMember['tenant']>,
      editions: {} as NonNullable<SeedMember['editions']>,
    })
    const members = [
      asHead(headId),
      ...team.map((member) =>
        member.role === 'head'
          ? asHead(member.id)
          : {
              id: member.id,
              role: 'org' as const,
              expiresAt: member.expired ? new Date(Date.now() - DAY) : null,
              tenant: member.tenant ?? {},
              editions: member.editions ?? {},
            },
      ),
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

  // The rows are committed: the bucket gets the files they point at. A file already there is put
  // again with the same bytes, so a bucket that lost one gets it back.
  for (const { key, bytes } of objects) {
    await bucket.send(
      new PutObjectCommand({
        Bucket: s3.bucket,
        Key: key,
        Body: bytes,
        ContentType: 'application/pdf',
      }),
    )
  }

  // A demo tenant is suspended or not as the list says, whatever an admin did to it since.
  await (spec.suspended ? suspendTenant(db, tenantId) : restoreTenant(db, tenantId))
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * The seller's details and the provider account of a demo convention. The account is kept while
 * its credentials open to the demo ones: its row is replaced, never changed, so a rerun leaves it.
 */
async function seedShop(tx: Tx, tenantId: string, shop: SeedShop) {
  const { credentials, ...seller } = shop
  await tx
    .insert(shopSellers)
    .values({ tenantId, ...seller })
    .onConflictDoUpdate({ target: shopSellers.tenantId, set: seller })

  const [account] = await tx
    .select({
      provider: paymentProviderAccounts.provider,
      credentials: paymentProviderAccounts.credentials,
      readyAt: paymentProviderAccounts.readyAt,
    })
    .from(paymentProviderAccounts)
    .where(eq(paymentProviderAccounts.tenantId, tenantId))
  const wanted = JSON.stringify(credentials)
  const sealedFor = providerAccountOf(tenantId, 'fake')
  const opens = (sealed: string) => {
    try {
      return open(credentialsKey, sealed, sealedFor) === wanted
    } catch {
      // Sealed with another key or for another account, or not sealed at all.
      return false
    }
  }
  if (account?.provider === 'fake' && account.readyAt && opens(account.credentials)) return
  await tx.delete(paymentProviderAccounts).where(eq(paymentProviderAccounts.tenantId, tenantId))
  await tx.insert(paymentProviderAccounts).values({
    tenantId,
    provider: 'fake',
    credentials: seal(credentialsKey, wanted, sealedFor),
    readyAt: new Date(),
  })
}

/**
 * The shop of a demo edition: its documents, each with one version, its consents in their order,
 * and whether it is open. A document is identified by its kind within a seeded edition, a consent
 * by its sentence. Answers the files the bucket is to hold.
 */
async function seedEditionShop(
  tx: Tx,
  tenantId: string,
  editionId: string,
  shop: SeedEditionShop,
): Promise<PendingObject[]> {
  const objects: PendingObject[] = []
  const documentIds = new Map<DocumentKind, string>()
  for (const document of shop.documents) {
    const [existing] = await tx
      .select({ id: editionDocuments.id })
      .from(editionDocuments)
      .where(
        and(eq(editionDocuments.editionId, editionId), eq(editionDocuments.kind, document.kind)),
      )
    const [saved] = existing
      ? await tx
          .update(editionDocuments)
          .set({ title: document.title, hiddenAt: null })
          .where(eq(editionDocuments.id, existing.id))
          .returning({ id: editionDocuments.id })
      : await tx
          .insert(editionDocuments)
          .values({ tenantId, editionId, kind: document.kind, title: document.title })
          .returning({ id: editionDocuments.id })
    const documentId = saved!.id
    documentIds.set(document.kind, documentId)

    const bytes = demoPdf(document.title, document.lines)
    const file = {
      contentType: 'application/pdf',
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      name: `${document.title}.pdf`,
    }
    const [version] = await tx
      .select({ fileId: editionDocumentVersions.fileId })
      .from(editionDocumentVersions)
      .where(
        and(
          eq(editionDocumentVersions.documentId, documentId),
          eq(editionDocumentVersions.number, 1),
        ),
      )
    let fileId = version?.fileId
    if (fileId) {
      // The seed owns its demo files: a text changed since the last run is the file's new bytes.
      await tx.update(uploadedFiles).set(file).where(eq(uploadedFiles.id, fileId))
    } else {
      const [kept] = await tx
        .insert(uploadedFiles)
        .values({ tenantId, editionId, kind: DOCUMENT_FILE_KIND, ...file })
        .returning({ id: uploadedFiles.id })
      fileId = kept!.id
      await tx
        .insert(editionDocumentVersions)
        .values({ tenantId, editionId, documentId, number: 1, fileId })
    }
    objects.push({ key: fileObjectKey(tenantId, fileId), bytes })
  }

  for (const [index, consent] of shop.consents.entries()) {
    const values = {
      documentId: consent.document ? documentIds.get(consent.document)! : null,
      isRequired: consent.isRequired,
      position: index + 1,
      hiddenAt: null,
    }
    const [existing] = await tx
      .select({ id: editionConsents.id })
      .from(editionConsents)
      .where(and(eq(editionConsents.editionId, editionId), eq(editionConsents.text, consent.text)))
    if (existing) {
      await tx.update(editionConsents).set(values).where(eq(editionConsents.id, existing.id))
    } else {
      await tx
        .insert(editionConsents)
        .values({ tenantId, editionId, text: consent.text, ...values })
    }
  }

  // An open shop keeps the moment it was opened at.
  const faqUrl = shop.faqUrl ?? null
  await tx
    .insert(editionShops)
    .values({ tenantId, editionId, faqUrl, openedAt: shop.open ? new Date() : null })
    .onConflictDoUpdate({
      target: editionShops.editionId,
      set: {
        faqUrl,
        openedAt: shop.open ? sql`coalesce(${editionShops.openedAt}, now())` : null,
      },
    })
  return objects
}

try {
  const seeded = SEEDS_ADMIN ? [...ACCOUNTS, ADMIN] : ACCOUNTS
  for (const account of seeded) await ensureAccount(account)
  await ensureTwoFactor(MFA_EMAIL)
  if (SEEDS_ADMIN) {
    await ensureTwoFactor(ADMIN.email)
    await ensureAdmin(ADMIN.email)
  }
  for (const tenant of TENANTS) await seedTenant(tenant)
  console.log(
    `Seeded ${TENANTS.length} tenants and ${seeded.length} accounts; password ${DEV_PASSWORD}.`,
  )
} finally {
  await db.$client.end()
}
