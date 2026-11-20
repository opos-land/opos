import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { describe, expect, it } from 'vitest'
import { open, orderQrCodeOf, providerAccountOf, sealingKey } from '../src/sealed'
import { migrator } from './db'

// The seed refuses before it opens a connection: it runs where OPOS_ENV is local or dev, and a
// missing variable stops it.

const seed = (env: Record<string, string | undefined>) =>
  spawnSync(process.execPath, ['--import', 'tsx', 'src/seed.ts'], {
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
  })

/** The whole seed against the local stack, with the environment of the test run. */
const runSeed = (opos: 'local' | 'dev') =>
  spawnSync(process.execPath, ['--import', 'tsx', 'src/seed.ts'], {
    env: { ...process.env, OPOS_ENV: opos },
    encoding: 'utf8',
  })

// Each case starts tsx in a process of its own, which takes seconds on a loaded machine.
describe('db:seed', { timeout: 30_000 }, () => {
  it.each([{}, { OPOS_ENV: 'production' }, { OPOS_ENV: 'staging' }])(
    'refuses where OPOS_ENV is not local or dev: %o',
    (env) => {
      const { status, stderr } = seed(env)

      expect(status).toBe(1)
      expect(stderr).toMatch(/OPOS_ENV/)
    },
  )

  it('ignores the old flag on production', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'src/seed.ts', '--i-know-what-i-am-doing'],
      { env: { PATH: process.env.PATH, OPOS_ENV: 'production' }, encoding: 'utf8' },
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/OPOS_ENV/)
  })

  it.each([
    [{ OPOS_ENV: 'local' }, /SUPABASE_URL/],
    [{ OPOS_ENV: 'local', SUPABASE_URL: 'http://127.0.0.1:54321' }, /SUPABASE_SECRET_KEY/],
    [
      {
        OPOS_ENV: 'local',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_SECRET_KEY: 'sb_secret_x',
      },
      /DATABASE_MIGRATION_URL/,
    ],
    [
      {
        OPOS_ENV: 'local',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_SECRET_KEY: 'sb_secret_x',
        DATABASE_MIGRATION_URL: 'postgres://postgres:postgres@127.0.0.1:54322/postgres',
      },
      /PAYMENT_CREDENTIALS_KEY/,
    ],
    [
      {
        OPOS_ENV: 'local',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_SECRET_KEY: 'sb_secret_x',
        DATABASE_MIGRATION_URL: 'postgres://postgres:postgres@127.0.0.1:54322/postgres',
        PAYMENT_CREDENTIALS_KEY: 'k'.repeat(64),
      },
      /S3_ENDPOINT/,
    ],
  ])('stops on a missing variable: %o', (env, missing) => {
    const { status, stderr } = seed(env)

    expect(status).not.toBe(0)
    expect(stderr).toMatch(missing)
    expect(stderr).not.toContain('sb_secret_x')
  })
})

describe('db:seed Auth URL', { timeout: 30_000 }, () => {
  it('refuses a remote Auth URL on local before it creates an account', () => {
    const { status, stderr } = seed({
      OPOS_ENV: 'local',
      SUPABASE_URL: 'https://auth.remote.example',
      SUPABASE_SECRET_KEY: 'sb_secret_x',
      DATABASE_MIGRATION_URL: process.env.DATABASE_MIGRATION_URL,
    })

    expect(status).toBe(1)
    expect(stderr).toMatch(/SUPABASE_URL names the remote host auth\.remote\.example/)
    expect(stderr).not.toContain('sb_secret_x')
  })
})

// The two-factor demo account is enrolled through Supabase Auth, never written into auth; it
// runs the whole seed against the local stack.
describe('db:seed two-factor account', () => {
  const email = 'mfa@example.com'
  const authUrl = `${process.env.SUPABASE_URL?.replace(/\/+$/, '')}/auth/v1`
  const admin = (method: string, path: string) =>
    fetch(`${authUrl}${path}`, { method, headers: { apikey: process.env.SUPABASE_SECRET_KEY! } })

  const accountId = async () =>
    (await migrator<{ id: string }[]>`select id from accounts where email = ${email}`)[0]!.id

  const factors = async (id: string) => {
    const response = await admin('GET', `/admin/users/${id}`)
    return ((await response.json()) as { factors?: { id: string; status: string }[] }).factors ?? []
  }

  const removeFactors = async (id: string) => {
    for (const factor of await factors(id)) {
      await admin('DELETE', `/admin/users/${id}/factors/${factor.id}`)
    }
  }

  const codes = (id: string) =>
    migrator<{ code_hash: string; used_at: Date | null }[]>`
      select code_hash, used_at from account_recovery_codes where account_id = ${id}
    `

  it(
    'enrolls and verifies a factor through Supabase Auth, once',
    { timeout: 120_000 },
    async () => {
      const id = await accountId()
      await removeFactors(id)

      const first = runSeed('local')

      expect(first.status, first.stderr).toBe(0)
      expect(first.stdout).toMatch(/mfa@example\.com TOTP secret: [A-Z2-7]{16,}/)
      const enrolled = await factors(id)
      expect(enrolled).toHaveLength(1)
      expect(enrolled[0]!.status).toBe('verified')
      const [row] = await migrator<{ mfa_enabled_at: Date | null }[]>`
      select mfa_enabled_at from accounts where id = ${id}
    `
      expect(row!.mfa_enabled_at).toBeInstanceOf(Date)
      expect(await codes(id)).toHaveLength(10)

      // A rerun keeps the factor, prints no secret, and converges on the ten codes.
      await migrator`insert into account_recovery_codes (account_id, code_hash) values (${id}, ${'f'.repeat(64)})`
      await migrator`update account_recovery_codes set used_at = now() where account_id = ${id} and code_hash <> ${'f'.repeat(64)}`
      const second = runSeed('local')

      expect(second.status, second.stderr).toBe(0)
      expect(second.stdout).not.toMatch(/TOTP secret/)
      expect((await factors(id)).map((factor) => factor.id)).toEqual([enrolled[0]!.id])
      const rows = await codes(id)
      expect(rows).toHaveLength(10)
      expect(rows.every((code) => code.used_at === null)).toBe(true)
      expect(rows.map((code) => code.code_hash)).not.toContain('f'.repeat(64))
    },
  )

  it(
    'enrolls again after the password has changed and the factor is gone',
    { timeout: 120_000 },
    async () => {
      const id = await accountId()
      await removeFactors(id)
      const changed = await fetch(`${authUrl}/admin/users/${id}`, {
        method: 'PUT',
        headers: { apikey: process.env.SUPABASE_SECRET_KEY!, 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'a-password-chosen-since' }),
      })
      expect(changed.status).toBe(200)

      const run = runSeed('local')

      expect(run.status, run.stderr).toBe(0)
      expect((await factors(id)).map((factor) => factor.status)).toEqual(['verified'])
      // The password is reset only to enroll: a rerun that finds the factor leaves it alone.
      const kept = await fetch(`${authUrl}/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: process.env.SUPABASE_SECRET_KEY!, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' }),
      })
      expect(kept.status).toBe(200)
      await fetch(`${authUrl}/admin/users/${id}`, {
        method: 'PUT',
        headers: { apikey: process.env.SUPABASE_SECRET_KEY!, 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'a-password-chosen-since' }),
      })
      const rerun = runSeed('local')
      expect(rerun.status, rerun.stderr).toBe(0)
      const left = await fetch(`${authUrl}/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: process.env.SUPABASE_SECRET_KEY!, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'a-password-chosen-since' }),
      })
      expect(left.status).toBe(200)
      // Back to the demo password for the tests after this one.
      await fetch(`${authUrl}/admin/users/${id}`, {
        method: 'PUT',
        headers: { apikey: process.env.SUPABASE_SECRET_KEY!, 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'password123' }),
      })
    },
  )

  it(
    'replaces a stale unverified factor and prints no secret on dev',
    { timeout: 120_000 },
    async () => {
      const id = await accountId()
      await removeFactors(id)
      const key = process.env.SUPABASE_SECRET_KEY!
      const json = { apikey: key, 'content-type': 'application/json' }
      const signIn = await fetch(`${authUrl}/token?grant_type=password`, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ email, password: 'password123' }),
      })
      const { access_token } = (await signIn.json()) as { access_token: string }
      const stale = await fetch(`${authUrl}/factors`, {
        method: 'POST',
        headers: { ...json, authorization: `Bearer ${access_token}` },
        body: JSON.stringify({ factor_type: 'totp', friendly_name: 'Stale' }),
      })
      const { id: staleId } = (await stale.json()) as { id: string }
      expect((await factors(id)).map((factor) => factor.status)).toEqual(['unverified'])

      const run = runSeed('dev')

      expect(run.status, run.stderr).toBe(0)
      expect(run.stdout).not.toMatch(/TOTP secret/)
      expect(run.stdout).not.toMatch(/[A-Z2-7]{26,}/)
      const after = await factors(id)
      expect(after).toHaveLength(1)
      expect(after[0]).toMatchObject({ status: 'verified' })
      expect(after[0]!.id).not.toBe(staleId)
    },
  )
})

// A second run refuses only what a constraint refuses, so a plain insert into a table with no
// unique key would pass and double its rows. Every table of `public` counts, so a future table is
// covered with no change here.
describe('db:seed run twice', () => {
  const rowCounts = async () => {
    const tables = await migrator<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'
    `
    const counts: Record<string, number> = {}
    for (const { tablename } of tables) {
      const [row] = await migrator<{ count: number }[]>`
        select count(*)::int as count from ${migrator(tablename)}
      `
      counts[tablename] = row!.count
    }
    return counts
  }

  it('adds no row to any table of public on the second run', { timeout: 120_000 }, async () => {
    const first = runSeed('local')
    expect(first.status, first.stderr).toBe(0)
    const before = await rowCounts()
    // The migrator sees through row-level security, so a tenant table counts its real rows.
    expect(before.program_items).toBeGreaterThan(0)

    const second = runSeed('local')

    expect(second.status, second.stderr).toBe(0)
    expect(await rowCounts()).toEqual(before)
  })
})

// A demo account reads the applications in Polish whatever language its browser asks for, and
// a run of the seed sets that again for an account whose language somebody changed.
describe('db:seed accounts', () => {
  const DEMO = /@(convention-[abc]\.test|example\.com)$/
  const languages = async () =>
    (
      await migrator<{ email: string; locale: string | null }[]>`select email, locale from accounts`
    ).filter((account) => DEMO.test(account.email))

  it('gives every demo account Polish as its language', { timeout: 120_000 }, async () => {
    expect(runSeed('local').status).toBe(0)
    const seeded = await languages()

    expect(seeded.length).toBeGreaterThanOrEqual(12)
    expect(seeded.filter((account) => account.locale !== 'pl')).toEqual([])

    // Changed by its owner in the panel, it is Polish again after the next run.
    await migrator`update accounts set locale = 'en' where email = 'head@convention-a.test'`
    expect(runSeed('local').status).toBe(0)
    expect((await languages()).filter((account) => account.locale !== 'pl')).toEqual([])
  })
})

// The shop's setup of the demo conventions (docs/specs/0002-shop-setup.md): one convention ready
// to sell, with an edition whose shop is open and another whose shop misses a condition, and one
// that has set nothing.
describe('db:seed shop', () => {
  const env = (name: string) => process.env[name]!
  const bucket = new S3Client({
    endpoint: env('S3_ENDPOINT'),
    region: env('S3_REGION'),
    credentials: {
      accessKeyId: env('S3_ACCESS_KEY_ID'),
      secretAccessKey: env('S3_SECRET_ACCESS_KEY'),
    },
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  const object = async (key: string) => {
    const answer = await bucket.send(new GetObjectCommand({ Bucket: env('S3_BUCKET'), Key: key }))
    return Buffer.from(await answer.Body!.transformToByteArray())
  }

  const tenantId = async (slug: string) =>
    (await migrator<{ id: string }[]>`select id from tenants where slug = ${slug}`)[0]!.id
  const editionId = async (tenant: string, slug: string) =>
    (
      await migrator<{ id: string }[]>`
        select id from editions where tenant_id = ${tenant} and slug = ${slug}
      `
    )[0]!.id
  const account = async (tenant: string) =>
    (
      await migrator<{ provider: string; credentials: string; ready_at: Date | null }[]>`
        select provider, credentials, ready_at from payment_provider_accounts
        where tenant_id = ${tenant}
      `
    )[0]
  const documents = (edition: string) =>
    migrator<{ kind: string; versions: number }[]>`
      select d.kind, count(v.id)::int as versions
      from edition_documents d
      left join edition_document_versions v on v.document_id = d.id
      where d.edition_id = ${edition} and d.hidden_at is null
      group by d.id order by d.kind
    `
  const files = (tenant: string) =>
    migrator<{ id: string; size: number; sha256: string; content_type: string }[]>`
      select f.id, f.size, f.sha256, f.content_type
      from edition_document_versions v join uploaded_files f on f.id = v.file_id
      where v.tenant_id = ${tenant} order by f.id
    `

  it(
    'makes convention A ready to sell, with the credentials of its account sealed',
    { timeout: 120_000 },
    async () => {
      const run = runSeed('local')
      expect(run.status, run.stderr).toBe(0)
      const a = await tenantId('convention-a')

      const [seller] = await migrator<Record<string, string | null>[]>`
        select seller_name, seller_address, seller_registration_number, contact_email, currency
        from shop_sellers where tenant_id = ${a}
      `
      expect(Object.values(seller!).every((part) => part)).toBe(true)
      expect(seller!.currency).toBe('PLN')

      const stored = (await account(a))!
      expect(stored.provider).toBe('fake')
      expect(stored.ready_at).toBeInstanceOf(Date)
      expect(stored.credentials).not.toContain('demo')
      expect(
        JSON.parse(
          open(
            sealingKey(env('PAYMENT_CREDENTIALS_KEY')),
            stored.credentials,
            providerAccountOf(a, 'fake'),
          ),
        ),
      ).toEqual({ account: 'demo' })

      // A rerun keeps the account it finds: its row is replaced, never changed, by the API alone.
      expect(runSeed('local').status).toBe(0)
      expect(await account(a)).toEqual(stored)
    },
  )

  it(
    'opens the shop of the coming edition, with its documents and consents',
    { timeout: 120_000 },
    async () => {
      const run = runSeed('local')
      expect(run.status, run.stderr).toBe(0)
      const a = await tenantId('convention-a')
      const edition = await editionId(a, '2026')

      const [shop] = await migrator<{ opened_at: Date | null; faq_url: string | null }[]>`
        select opened_at, faq_url from edition_shops where edition_id = ${edition}
      `
      expect(shop!.opened_at).toBeInstanceOf(Date)
      expect(shop!.faq_url).toMatch(/^https:/)
      expect([...(await documents(edition))]).toEqual([
        { kind: 'shop-terms', versions: 1 },
        { kind: 'privacy-policy', versions: 1 },
        { kind: 'edition-rules', versions: 1 },
      ])
      const consents = await migrator<
        { position: number; is_required: boolean; kind: string | null }[]
      >`
        select c.position, c.is_required, d.kind
        from edition_consents c left join edition_documents d on d.id = c.document_id
        where c.edition_id = ${edition} order by c.position
      `
      expect([...consents]).toEqual([
        { position: 1, is_required: true, kind: 'shop-terms' },
        { position: 2, is_required: true, kind: 'privacy-policy' },
        { position: 3, is_required: false, kind: null },
      ])

      // A rerun keeps the moment the shop was opened.
      expect(runSeed('local').status).toBe(0)
      const [again] = await migrator<{ opened_at: Date | null }[]>`
        select opened_at from edition_shops where edition_id = ${edition}
      `
      expect(again!.opened_at).toEqual(shop!.opened_at)
    },
  )

  it(
    'leaves the shop of the past edition closed, with one condition missing',
    { timeout: 120_000 },
    async () => {
      const run = runSeed('local')
      expect(run.status, run.stderr).toBe(0)
      const a = await tenantId('convention-a')
      const edition = await editionId(a, '2025')

      const shops = await migrator<{ opened_at: Date | null }[]>`
        select opened_at from edition_shops where edition_id = ${edition}
      `
      expect(shops.every((shop) => shop.opened_at === null)).toBe(true)
      // The shop terms are there; the privacy policy opening asks for is not.
      expect([...(await documents(edition))]).toEqual([{ kind: 'shop-terms', versions: 1 }])
    },
  )

  // The catalog of the edition with an open shop (docs/specs/0003-catalog.md, Seed).
  it(
    'gives the coming edition a catalog: ticket types, add-ons, merchandise and custom fields',
    { timeout: 120_000 },
    async () => {
      const run = runSeed('local')
      expect(run.status, run.stderr).toBe(0)
      const a = await tenantId('convention-a')
      const edition = await editionId(a, '2026')

      const types = await migrator`
        select t.name, t.allows_child, t.allows_teen, t.allows_adult, t.discounts_excluded,
          (select count(*)::int from ticket_type_price_tiers p where p.ticket_type_id = t.id) as tiers,
          (select count(*)::int from ticket_type_supporter_prices s where s.ticket_type_id = t.id)
            as supporter_prices,
          (select count(*)::int from ticket_type_perks k where k.ticket_type_id = t.id) as perks,
          (select count(*)::int from ticket_type_add_ons o where o.ticket_type_id = t.id) as add_ons,
          (select count(*)::int from ticket_type_merchandise_items m where m.ticket_type_id = t.id)
            as items
        from ticket_types t where t.edition_id = ${edition} order by t.position
      `
      expect([...types]).toEqual([
        // Two price tiers and supporter prices.
        expect.objectContaining({
          name: 'Standard',
          allows_child: true,
          discounts_excluded: false,
          tiers: 2,
          supporter_prices: 2,
          add_ons: 2,
          items: 2,
        }),
        // For adults only, and excluded from discounts.
        expect.objectContaining({
          name: 'Supporter',
          allows_child: false,
          allows_teen: false,
          allows_adult: true,
          discounts_excluded: true,
          tiers: 1,
        }),
      ])
      expect(types.every((type) => (type.perks as number) > 0)).toBe(true)

      const addOns = await migrator`
        select kind, capacity, places_left_threshold from add_ons
        where edition_id = ${edition} order by position
      `
      expect([...addOns]).toEqual([
        { kind: 'limited', capacity: 40, places_left_threshold: 10 },
        { kind: 'headcount', capacity: null, places_left_threshold: null },
      ])

      // A T-shirt with two cuts and their sizes, a size chart a cut, one variant out of stock and
      // one that does not exist; and an item without axes, sold as its one variant.
      const items = await migrator`
        select i.name,
          (select count(*)::int from merchandise_option_axes x where x.merchandise_item_id = i.id)
            as axes,
          (select count(*)::int from merchandise_option_values v where v.merchandise_item_id = i.id)
            as values,
          (select count(*)::int from merchandise_variants v where v.merchandise_item_id = i.id)
            as variants,
          (select count(*)::int from merchandise_variants v
            where v.merchandise_item_id = i.id and v.stock = 0) as sold_out,
          (select count(*)::int from merchandise_size_charts c
            join merchandise_option_values v on v.id = c.option_value_id
            where v.merchandise_item_id = i.id) as size_charts
        from merchandise_items i where i.edition_id = ${edition} order by i.position
      `
      expect([...items]).toEqual([
        // Two cuts by four sizes are eight combinations, of which seven exist.
        { name: 'T-shirt', axes: 2, values: 6, variants: 7, sold_out: 1, size_charts: 2 },
        { name: 'Enamel pin', axes: 0, values: 0, variants: 1, sold_out: 0, size_charts: 0 },
      ])

      const [shop] = await migrator`
        select teen_from_age, adult_from_age, guardian_consent_form_url, merch_only_enabled,
          merch_preorder_deadline > now() as preorder_open, sales_closed_message is not null as message
        from edition_shops where edition_id = ${edition}
      `
      expect(shop).toEqual({
        teen_from_age: 13,
        adult_from_age: 18,
        guardian_consent_form_url: expect.stringMatching(/^https:/) as string,
        merch_only_enabled: true,
        preorder_open: true,
        message: true,
      })
      const fields = await migrator<{ label: string; is_required: boolean }[]>`
        select label, is_required from edition_custom_fields
        where edition_id = ${edition} order by position
      `
      expect(fields).toHaveLength(2)
      // Both are optional: the demo checkout asks a ticket holder for nothing it could do without.
      expect(fields.map((field) => [field.label, field.is_required])).toEqual([
        ['City you travel from', false],
        ['Favourite fandom', false],
      ])
    },
  )

  it(
    'keeps each size chart as an image in the bucket, where the API reads its master',
    { timeout: 120_000 },
    async () => {
      const run = runSeed('local')
      expect(run.status, run.stderr).toBe(0)
      const a = await tenantId('convention-a')
      const charts = async () => [
        ...(await migrator<
          { id: string; size: number; sha256: string; content_type: string; width: number }[]
        >`
          select f.id, f.size, f.sha256, f.content_type, f.width
          from merchandise_size_charts c join uploaded_files f on f.id = c.file_id
          where c.tenant_id = ${a} order by f.id
        `),
      ]
      const kept = await charts()
      expect(kept).toHaveLength(2)
      // The key the API's storage gives the master of an edition's image.
      const key = (id: string) => `tenants/${a}/${id}/master`

      for (const file of kept) {
        const bytes = await object(key(file.id))
        expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG')
        expect(file.content_type).toBe('image/png')
        expect(bytes.length).toBe(file.size)
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256)
        expect(file.width).toBeGreaterThan(0)
      }

      await bucket.send(
        new DeleteObjectCommand({ Bucket: env('S3_BUCKET'), Key: key(kept[0]!.id) }),
      )
      expect(runSeed('local').status).toBe(0)

      expect(await charts()).toEqual(kept)
      expect((await object(key(kept[0]!.id))).length).toBe(kept[0]!.size)
    },
  )

  // The API keeps the sizes it made of a master and reads them before it makes them again: a
  // master the seed draws anew must not leave the sizes of the old one behind.
  it('takes away the sizes made of a size chart it draws anew', { timeout: 120_000 }, async () => {
    expect(runSeed('local').status).toBe(0)
    const a = await tenantId('convention-a')
    const [chart] = await migrator<{ id: string; sha256: string }[]>`
        select f.id, f.sha256 from merchandise_size_charts c
        join uploaded_files f on f.id = c.file_id where c.tenant_id = ${a} order by f.id limit 1
      `
    const small = `tenants/${a}/${chart!.id}/small`
    await bucket.send(
      new PutObjectCommand({
        Bucket: env('S3_BUCKET'),
        Key: small,
        Body: Buffer.from('made of another master'),
        ContentType: 'image/webp',
      }),
    )

    // The same master: its sizes stay.
    expect(runSeed('local').status).toBe(0)
    expect((await object(small)).toString()).toBe('made of another master')

    // The row tells of other bytes than the seed draws now: the master is put anew.
    await migrator`update uploaded_files set sha256 = ${'0'.repeat(64)} where id = ${chart!.id}`
    expect(runSeed('local').status).toBe(0)

    await expect(object(small)).rejects.toThrow()
    const [again] = await migrator<{ sha256: string }[]>`
        select sha256 from uploaded_files where id = ${chart!.id}
      `
    expect(again!.sha256).toBe(chart!.sha256)
  })

  // The orders of the edition with an open shop (docs/specs/0004-checkout-and-orders.md, Seed).
  it(
    'gives the coming edition an order in each status, with what each status holds',
    { timeout: 120_000 },
    async () => {
      const run = runSeed('local')
      expect(run.status, run.stderr).toBe(0)
      const a = await tenantId('convention-a')
      const edition = await editionId(a, '2026')

      const orders = await migrator<
        {
          id: string
          number: string
          status: string
          holds: boolean
          age_band: string | null
          email: string | null
          total_minor: number
          lines_total: number
          tickets: number
          qr_codes: number
          attached_to: string | null
          guardian: boolean
          hold_ends_at: Date | null
          manual_reason: string | null
          extends_number: string | null
          qr_code_id: string | null
        }[]
      >`
        select o.id, o.number, o.status, o.holds, o.age_band, o.email, o.total_minor,
          o.hold_ends_at, o.manual_reason, o.guardian_consent_acknowledged_at is not null as guardian,
          (select e.number from orders e where e.id = o.extends_order_id) as extends_number,
          (select q.qr_code_id from order_qr_code_orders q where q.order_id = o.id) as qr_code_id,
          (select coalesce(sum(l.amount_minor), 0)::int from order_lines l where l.order_id = o.id)
            as lines_total,
          (select count(*)::int from order_lines l where l.order_id = o.id and l.kind = 'ticket')
            as tickets,
          (select count(*)::int from order_qr_code_orders q where q.order_id = o.id) as qr_codes,
          (select c.email from order_accounts oa join accounts c on c.id = oa.account_id
            where oa.order_id = o.id) as attached_to
        from orders o where o.edition_id = ${edition} order by o.number
      `
      expect(orders.map((order) => order.status).sort()).toEqual([
        'awaiting-payment',
        'canceled',
        'declined',
        'expired',
        'needs-review',
        'paid',
        'paid',
        'paid',
        'paid',
        'paid',
        'paid',
        'paid',
        'paid-manual',
        'paid-manual',
        'paid-manual',
      ])
      for (const order of orders) {
        // The total of an order is the sum of its lines, to the cent.
        expect(order.lines_total, order.number).toBe(order.total_minor)
        expect(order.tickets, order.number).toBeLessThanOrEqual(1)
        // What each status holds of stock and capacity.
        expect(order.holds, order.number).toBe(
          ['awaiting-payment', 'paid', 'paid-manual', 'needs-review'].includes(order.status),
        )
        // A paid order of the shop has one QR code; no other order has one.
        expect(order.qr_codes, order.number).toBe(order.status === 'paid' ? 1 : 0)
      }
      const paid = orders.filter((order) => order.status === 'paid')
      // One with a teen as its ticket holder, one of merchandise alone, one of a demo account.
      expect(paid.filter((order) => order.age_band === 'teen' && order.guardian)).toHaveLength(1)
      const first = paid.filter((order) => order.extends_number === null)
      expect(first.filter((order) => order.age_band === null && order.tickets === 0)).toHaveLength(
        1,
      )
      expect(first.map((order) => order.attached_to).filter(Boolean)).toEqual([
        'attendee@example.com',
      ])
      // The demo account bought more for its paid order (docs/specs/0009-buyer-self-service.md,
      // Seed): an order of its own, with no ticket, on the QR code of the one it extends.
      const more = paid.filter((order) => order.extends_number !== null)
      expect(more).toMatchObject([
        { extends_number: 'DEMPAD2222', attached_to: 'attendee@example.com', tickets: 0 },
      ])
      expect(more[0]!.qr_code_id).toBe(
        orders.find((order) => order.number === 'DEMPAD2222')!.qr_code_id,
      )
      // A manual order was recorded by an org: nobody's email, and one of each reason. A
      // complimentary one costs nothing.
      const manual = orders.filter((order) => order.status === 'paid-manual')
      expect(manual.map((order) => order.email)).toEqual([null, null, null])
      expect(manual.map((order) => order.manual_reason).sort()).toEqual([
        'complimentary',
        'desk',
        'invoice',
      ])
      expect(manual.find((order) => order.manual_reason === 'complimentary')!.total_minor).toBe(0)
      // The one awaiting payment keeps doing so while the demo stands.
      const awaiting = orders.find((order) => order.status === 'awaiting-payment')!
      expect(awaiting.hold_ends_at!.getTime()).toBeGreaterThan(Date.now() + 365 * 24 * 3_600_000)

      // The QR code opens with the key the API holds, sealed for its own row.
      const codes = await migrator<
        { id: string; code: string; code_hash: string; replaced_at: Date | null }[]
      >`
        select id, code, code_hash, replaced_at from order_qr_codes where edition_id = ${edition}
      `
      expect(codes.filter((code) => code.replaced_at !== null)).toHaveLength(1)
      // One a paid order of the shop, those a discount code paid for among them, and one more
      // that a changed email replaced.
      expect(codes).toHaveLength(7)
      const key = sealingKey(env('PAYMENT_CREDENTIALS_KEY'))
      for (const code of codes) {
        const text = open(key, code.code, orderQrCodeOf(a, code.id))
        expect(text).toMatch(/^[A-Z2-7]{32}$/)
        expect(code.code_hash).toBe(createHash('sha256').update(text).digest('hex'))
      }

      // One order link that opens and one that expired, each under a token the demo knows.
      const links = await migrator<{ number: string; valid: boolean; token_hash: string }[]>`
        select o.number, l.expires_at > now() as valid, l.token_hash
        from order_links l join orders o on o.id = l.order_id
        where l.edition_id = ${edition} order by o.number
      `
      expect(links.map(({ number, valid }) => ({ number, valid }))).toEqual([
        { number: 'DEMPAD2222', valid: true },
        { number: 'DEMTEEN222', valid: false },
      ])
      for (const link of links) {
        expect(link.token_hash).toBe(
          createHash('sha256').update(`demo-order-link-${link.number}`).digest('hex'),
        )
      }
      // The edition says where and when its merchandise is handed over.
      const [shop] = await migrator<
        {
          pickup_information: string | null
          opening_hours: string | null
          reminder_days_before: number | null
        }[]
      >`
        select pickup_information, opening_hours, reminder_days_before
        from edition_shops where edition_id = ${edition}
      `
      expect(shop!.pickup_information).toMatch(/merchandise desk/)
      // And when it is open, with a reminder three days before it starts
      // (docs/specs/0011-pre-edition-reminder.md).
      expect(shop!.opening_hours).toMatch(/10:00/)
      expect(shop!.reminder_days_before).toBe(3)

      const attempts = await migrator<
        {
          order_status: string
          status: string
          amount_minor: number
          paid_amount_minor: number | null
          money_with: string | null
          failure_reason: string | null
        }[]
      >`
        select o.status as order_status, p.status, p.amount_minor, p.paid_amount_minor,
          p.money_with, p.failure_reason
        from payment_attempts p join orders o on o.id = p.order_id
        where p.edition_id = ${edition} order by o.number, p.created_at
      `
      // A payment an order no longer needed, refused: its money stays with the buyer.
      expect(attempts).toContainEqual(
        expect.objectContaining({ order_status: 'paid', status: 'refused', money_with: 'buyer' }),
      )
      // The one that needs review was paid another amount than it asked for.
      const review = attempts.find((attempt) => attempt.order_status === 'needs-review')!
      expect(review).toMatchObject({ status: 'paid', money_with: 'convention' })
      expect(review.paid_amount_minor).not.toBe(review.amount_minor)
      // The expired one was tried and failed; a manual order has no attempt.
      expect(attempts).toContainEqual(
        expect.objectContaining({ order_status: 'expired', status: 'failed' }),
      )
      expect(attempts.some((attempt) => attempt.order_status === 'paid-manual')).toBe(false)

      // The ticket holder's answers and consents are kept with the order, and its emails are
      // listed as sent: the seed sends nothing.
      const [kept] = await migrator<{ answers: number; consents: number; unsent: number }[]>`
        select
          (select count(*)::int from order_custom_field_answers where edition_id = ${edition})
            as answers,
          (select count(*)::int from order_consents where edition_id = ${edition}) as consents,
          (select count(*)::int from order_emails where edition_id = ${edition} and sent_at is null)
            as unsent
      `
      expect(kept!.answers).toBeGreaterThan(0)
      expect(kept!.consents).toBeGreaterThan(0)
      expect(kept!.unsent).toBe(0)
    },
  )

  // docs/specs/0008-discount-codes.md, Seed: a percent code for a ticket type, an amount code for
  // merchandise, a 100% code used once, and a code used up.
  it(
    'gives the selling edition four discount codes, two of them used',
    { timeout: 120_000 },
    async () => {
      const run = runSeed('local')
      expect(run.status, run.stderr).toBe(0)
      const a = await tenantId('convention-a')
      const edition = await editionId(a, '2026')

      const codes = await migrator<
        {
          code: string
          kind: string
          percent: number | null
          amount_minor: number | null
          usage_limit: number | null
          uses: number
          ticket_types: number
          items: number
        }[]
      >`
      select c.code, c.kind, c.percent, c.amount_minor, c.usage_limit,
        (select count(*)::int from orders o where o.discount_code_id = c.id and o.holds) as uses,
        (select count(*)::int from discount_code_ticket_types t where t.discount_code_id = c.id)
          as ticket_types,
        (select count(*)::int from discount_code_merchandise_items i
          where i.discount_code_id = c.id) as items
      from discount_codes c where c.edition_id = ${edition} order by c.code
    `
      expect(codes).toEqual([
        {
          code: 'early10',
          kind: 'percent',
          percent: 10,
          amount_minor: null,
          usage_limit: null,
          uses: 0,
          ticket_types: 1,
          items: 0,
        },
        {
          code: 'firstfan',
          kind: 'percent',
          percent: 15,
          amount_minor: null,
          usage_limit: 1,
          uses: 1,
          ticket_types: 1,
          items: 0,
        },
        {
          code: 'guest100',
          kind: 'percent',
          percent: 100,
          amount_minor: null,
          usage_limit: null,
          uses: 1,
          ticket_types: 1,
          items: 0,
        },
        {
          code: 'merch20',
          kind: 'amount',
          percent: null,
          amount_minor: 2000,
          usage_limit: null,
          uses: 0,
          ticket_types: 0,
          items: 1,
        },
      ])
      // An order a code paid for in full costs nothing, and its discount line says what was taken off.
      const [guest] = await migrator<{ total_minor: number; discount: number; status: string }[]>`
      select o.total_minor, o.status,
        (select l.amount_minor from order_lines l where l.order_id = o.id and l.kind = 'discount')
          as discount
      from orders o join discount_codes c on c.id = o.discount_code_id
      where o.edition_id = ${edition} and c.code = 'guest100'
    `
      expect(guest).toMatchObject({ total_minor: 0, status: 'paid' })
      expect(guest!.discount).toBeLessThan(0)
    },
  )

  // docs/specs/0007-scanner.md, Seed: two scanners, one of them revoked, their pairing codes spent.
  it(
    'gives the selling edition two scanners that open no device',
    { timeout: 120_000 },
    async () => {
      const run = runSeed('local')
      expect(run.status, run.stderr).toBe(0)
      const a = await tenantId('convention-a')
      const edition = await editionId(a, '2026')

      const scanners = await migrator<
        {
          name: string
          revoked: boolean
          paired: boolean
          enabled: boolean
          pairing_open: boolean
        }[]
      >`
      select name, revoked_at is not null as revoked, paired_at is not null as paired,
        enabled_by_membership_id is not null as enabled, pairing_expires_at > now() as pairing_open
      from scanner_devices where edition_id = ${edition} order by name
    `
      expect(scanners).toEqual([
        { name: 'Main gate', revoked: false, paired: true, enabled: true, pairing_open: false },
        {
          name: 'Merchandise desk',
          revoked: true,
          paired: true,
          enabled: true,
          pairing_open: false,
        },
      ])
    },
  )

  // An order a demo changed stays as it was left: the seed places none anew.
  it('leaves an order it placed as the demo changed it', { timeout: 120_000 }, async () => {
    expect(runSeed('local').status).toBe(0)
    const a = await tenantId('convention-a')
    const [order] = await migrator<{ id: string }[]>`
      select id from orders where tenant_id = ${a} and status = 'declined' limit 1
    `
    await migrator`update orders set holder_name = 'Changed by a demo' where id = ${order!.id}`
    try {
      expect(runSeed('local').status).toBe(0)
      expect(await migrator`select holder_name from orders where id = ${order!.id}`).toMatchObject([
        { holder_name: 'Changed by a demo' },
      ])
    } finally {
      await migrator`update orders set holder_name = 'Demo Declined' where id = ${order!.id}`
    }
  })

  it('sets nothing of a shop for convention B', { timeout: 120_000 }, async () => {
    const run = runSeed('local')
    expect(run.status, run.stderr).toBe(0)
    const b = await tenantId('convention-b')

    for (const table of [
      'shop_sellers',
      'payment_provider_accounts',
      'edition_shops',
      'edition_documents',
      'edition_consents',
      'ticket_types',
      'add_ons',
      'merchandise_items',
      'edition_custom_fields',
    ]) {
      const [row] = await migrator<{ count: number }[]>`
        select count(*)::int as count from ${migrator(table)} where tenant_id = ${b}
      `
      expect(row!.count, table).toBe(0)
    }
  })

  it(
    'keeps each version as a PDF in the bucket, where the API reads it, and puts back a lost one',
    { timeout: 120_000 },
    async () => {
      const run = runSeed('local')
      expect(run.status, run.stderr).toBe(0)
      const a = await tenantId('convention-a')
      const kept = [...(await files(a))]
      expect(kept).toHaveLength(4)
      // The key the API's storage gives an edition's file: its tenant, the file, then `file`.
      const key = (id: string) => `tenants/${a}/${id}/file`

      for (const file of kept) {
        const bytes = await object(key(file.id))
        expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
        expect(file.content_type).toBe('application/pdf')
        expect(bytes.length).toBe(file.size)
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256)
      }

      await bucket.send(
        new DeleteObjectCommand({ Bucket: env('S3_BUCKET'), Key: key(kept[0]!.id) }),
      )
      expect(runSeed('local').status).toBe(0)

      // The same rows, and the object back under the same key.
      expect([...(await files(a))]).toEqual(kept)
      expect((await object(key(kept[0]!.id))).length).toBe(kept[0]!.size)
    },
  )
})

// One account heads both conventions, so the panel's convention picker and switch have someone to
// show; a head holds no tenant-level permission and never expires.
describe('db:seed head of two conventions', () => {
  it('makes multi@example.com a head organizer of both', { timeout: 120_000 }, async () => {
    const run = runSeed('local')
    expect(run.status, run.stderr).toBe(0)

    const rows = await migrator<
      { slug: string; role: string; settings_access: string; expires_at: Date | null }[]
    >`
      select t.slug, m.role, m.settings_access, m.expires_at
      from tenant_memberships m
      join tenants t on t.id = m.tenant_id
      join accounts a on a.id = m.account_id
      where a.email = 'multi@example.com'
      order by t.slug
    `

    expect(rows).toEqual([
      { slug: 'convention-a', role: 'head', settings_access: 'none', expires_at: null },
      { slug: 'convention-b', role: 'head', settings_access: 'none', expires_at: null },
    ])
  })
})

// The admin of the demo data: two-factor authentication on, and the role bound to that factor, so
// the admin application has someone to sign in. On the local stack alone: the demo password and
// recovery codes are public, so on the shared Dev anyone could take such an account over, and a
// seed that granted it the role again would hand them every tenant.
describe('db:seed admin', () => {
  const email = 'admin@example.com'
  const authUrl = `${process.env.SUPABASE_URL?.replace(/\/+$/, '')}/auth/v1`
  const admin = (method: string, path: string) =>
    fetch(`${authUrl}${path}`, { method, headers: { apikey: process.env.SUPABASE_SECRET_KEY! } })

  const state = async () =>
    (
      await migrator<{ id: string; mfa: boolean; bound: boolean | null }[]>`
        select c.id, c.mfa_enabled_at is not null as mfa,
          a.mfa_enabled_at = c.mfa_enabled_at as bound
        from accounts c left join admins a on a.account_id = c.id where c.email = ${email}
      `
    )[0]

  const grants = async (id: string) =>
    (
      await migrator<{ count: number }[]>`
        select count(*)::int as count from admin_actions
        where action = 'admin.grant' and subject_account_id = ${id}
      `
    )[0]!.count

  it('grants the role to an account with a second factor, once', { timeout: 120_000 }, async () => {
    const first = runSeed('local')
    expect(first.status, first.stderr).toBe(0)

    const granted = await state()
    expect(granted).toMatchObject({ mfa: true, bound: true })
    const logged = await grants(granted!.id)
    expect(logged).toBeGreaterThan(0)

    // A rerun finds the grant standing and leaves no second entry in the log.
    const second = runSeed('local')
    expect(second.status, second.stderr).toBe(0)
    expect(await grants(granted!.id)).toBe(logged)
  })

  it('grants the role anew once the factor was replaced', { timeout: 120_000 }, async () => {
    const before = await state()
    const user = await admin('GET', `/admin/users/${before!.id}`)
    const { factors = [] } = (await user.json()) as { factors?: { id: string }[] }
    for (const factor of factors) {
      await admin('DELETE', `/admin/users/${before!.id}/factors/${factor.id}`)
    }
    expect(await state()).toMatchObject({ mfa: false })

    const run = runSeed('local')

    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout).toMatch(/admin@example\.com TOTP secret: [A-Z2-7]{16,}/)
    expect(await state()).toMatchObject({ mfa: true, bound: true })
  })

  it('grants no admin role where OPOS_ENV is dev', { timeout: 120_000 }, async () => {
    const before = await state()
    await migrator`delete from admins where account_id = ${before!.id}`
    const logged = await grants(before!.id)

    const dev = runSeed('dev')

    expect(dev.status, dev.stderr).toBe(0)
    expect(await state()).toMatchObject({ bound: null })
    expect(await grants(before!.id)).toBe(logged)

    // Back on the local stack for the tests after this one.
    const local = runSeed('local')
    expect(local.status, local.stderr).toBe(0)
    expect(await state()).toMatchObject({ bound: true })
  })
})

// A suspended convention with a head of its own, for the admin application, the panel and the
// portal to show; the other two are not suspended, whatever was done to them since the last run.
describe('db:seed suspended tenant', () => {
  const suspended = () =>
    migrator<{ slug: string; suspended: boolean }[]>`
      select slug, suspended_at is not null as suspended from tenants
      where slug like 'convention-%' order by slug
    `

  it('suspends convention-c and no other', { timeout: 120_000 }, async () => {
    await migrator`update tenants set suspended_at = now() where slug = 'convention-a'`
    await migrator`update tenants set suspended_at = null where slug = 'convention-c'`

    const run = runSeed('local')

    expect(run.status, run.stderr).toBe(0)
    expect(await suspended()).toEqual([
      { slug: 'convention-a', suspended: false },
      { slug: 'convention-b', suspended: false },
      { slug: 'convention-c', suspended: true },
    ])
    expect(
      await migrator`
        select a.email, m.role from tenant_memberships m
        join tenants t on t.id = m.tenant_id join accounts a on a.id = m.account_id
        where t.slug = 'convention-c'
      `,
    ).toEqual([{ email: 'head@convention-c.test', role: 'head' }])
  })

  // The slug of a deleted tenant is held back for good; the seed owns the slugs of its tenants.
  it('brings back a demo tenant an admin deleted', { timeout: 120_000 }, async () => {
    await migrator`delete from tenants where slug = 'convention-c'`
    expect(
      await migrator`select 1 from retired_tenant_slugs where slug = 'convention-c'`,
    ).toHaveLength(1)

    const run = runSeed('local')

    expect(run.status, run.stderr).toBe(0)
    expect(await suspended()).toContainEqual({ slug: 'convention-c', suspended: true })
    expect(
      await migrator`select 1 from retired_tenant_slugs where slug = 'convention-c'`,
    ).toHaveLength(0)
  })
})
