import { randomUUID } from 'node:crypto'
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { type Account, type FileType } from '@opos/contract'
import { migrationDb, migrationUrl } from '@opos/db'
import { sql } from 'drizzle-orm'
import { pgSchema, uuid } from 'drizzle-orm/pg-core'
import { TenantContextService } from '../src/common/als/tenant-context.service'
import { loadEnv } from '../src/config/env'
import { imgproxyPath, signImgproxyPath } from '../src/modules/files/imgproxy'
import { type FileKind } from '../src/modules/files/kinds'

// The kinds of file declared for the tests of file storage, one for each owner, and the tables
// that point at their files, in a schema of their own outside public.

const env = loadEnv(process.env)
const db = migrationDb(migrationUrl())

export const SCHEMA = 'files_test'
const schema = pgSchema(SCHEMA)
export const conventionHolders = schema.table('convention_holders', { fileId: uuid() })
export const editionHolders = schema.table('edition_holders', { fileId: uuid() })
export const accountHolders = schema.table('account_holders', { fileId: uuid() })

export const KINDS = {
  terms: {
    name: 'test-terms',
    owner: 'convention',
    types: ['application/pdf'],
    maxSize: 64 * 1024,
    pointer: conventionHolders.fileId,
  },
  pictures: {
    name: 'test-pictures',
    owner: 'edition',
    types: ['image/jpeg', 'image/png', 'image/webp'],
    pointer: editionHolders.fileId,
    variants: {
      thumb: { width: 100, height: 100, fit: 'cover', withUpload: true },
      large: { width: 1000, height: 1000, fit: 'inside' },
    },
  },
  avatar: {
    name: 'test-avatar',
    owner: 'account',
    types: ['image/png', 'application/pdf'],
    pointer: accountHolders.fileId,
    variants: { small: { width: 64, height: 64, fit: 'cover' } },
  },
} as const satisfies Record<string, FileKind>

/** The schema of the pointing tables, which the sweep reads as opos_app_global. */
export async function createHolders() {
  await db.execute(
    sql.raw(`
    create schema if not exists ${SCHEMA};
    create table if not exists ${SCHEMA}.convention_holders (file_id uuid);
    create table if not exists ${SCHEMA}.edition_holders (file_id uuid);
    create table if not exists ${SCHEMA}.account_holders (file_id uuid);
    grant usage on schema ${SCHEMA} to opos_app_global, opos_app;
    grant select on all tables in schema ${SCHEMA} to opos_app_global, opos_app;
  `),
  )
}

export async function dropHolders() {
  await db.execute(sql.raw(`drop schema if exists ${SCHEMA} cascade`))
  await db.$client.end()
}

/** Points a table of the tests at a file, as a feature's row does. */
export const point = (table: 'convention' | 'edition' | 'account', fileId: string) =>
  db.execute(sql.raw(`insert into ${SCHEMA}.${table}_holders (file_id) values ('${fileId}')`))

/** Runs SQL as postgres, for rows a test sets up outside the API. */
export const asPostgres = (query: ReturnType<typeof sql>) => db.execute(query)

/**
 * Runs `during` inside a transaction of postgres that has run `first` and not yet committed, for
 * what the API does while another writer holds a row.
 */
export const whilePostgresHolds = <T>(first: ReturnType<typeof sql>, during: () => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(first)
    return during()
  })

/** The bucket, as the tests look into it. */
const bucket = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})
const signer = new S3Client({
  endpoint: env.IMGPROXY_BUCKET_ENDPOINT,
  region: env.S3_REGION,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  forcePathStyle: true,
})

export async function objectKeys(prefix: string) {
  const page = await bucket.send(
    new ListObjectsV2Command({ Bucket: env.S3_BUCKET, Prefix: prefix }),
  )
  return (page.Contents ?? []).map((object) => object.Key!).sort()
}

export async function objectBytes(key: string) {
  const object = await bucket.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
  return Buffer.from(await object.Body!.transformToByteArray())
}

export const putObject = (key: string, body: Uint8Array, type: string) =>
  bucket.send(
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: type }),
  )

/** Asks imgproxy for `request` of bytes put into the bucket outside every owner's keys. */
export async function convert(bytes: Uint8Array, options: string, extension: string) {
  const key = `fixtures/${randomUUID()}`
  await putObject(key, bytes, 'application/octet-stream')
  const source = await getSignedUrl(
    signer,
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    {
      expiresIn: 60,
    },
  )
  const path = imgproxyPath({ options, extension: extension as 'jpg' }, source)
  const response = await fetch(
    `${env.IMGPROXY_URL}/${signImgproxyPath(env.IMGPROXY_KEY, env.IMGPROXY_SALT, path)}${path}`,
  )
  if (!response.ok) throw new Error(`imgproxy answered ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

/** imgproxy asked directly, with a path signed or not. */
export async function askImgproxy(source: string, signed: boolean) {
  const path = imgproxyPath({ options: 'rs:fit:10:10:0', extension: 'webp' }, source)
  const signature = signed ? signImgproxyPath(env.IMGPROXY_KEY, env.IMGPROXY_SALT, path) : 'unsafe'
  return (await fetch(`${env.IMGPROXY_URL}/${signature}${path}`)).status
}

/** A signed address of an object, as imgproxy reads it. */
export const signedAddress = (key: string) =>
  getSignedUrl(signer, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn: 60 })

/** An upload as a route's body carries it. */
/** `type` may name what no kind takes, as a forged request would. */
export const upload = (bytes: Uint8Array, type: string, name = 'file') => ({
  name,
  type: type as FileType,
  data: Buffer.from(bytes).toString('base64'),
})

const account = (id: string): Account => ({
  id,
  email: `${id}@example.test`,
  firstName: null,
  lastName: null,
  nickname: null,
  nameOrder: 'nickname-middle' as const,
  locale: null,
  theme: null,
  mfaEnabled: false,
})

/** Runs `fn` in a request store of the account, as JwtAuthGuard leaves it. */
export const asAccount = <T>(
  context: TenantContextService,
  accountId: string,
  fn: () => Promise<T>,
) =>
  context.run(() => {
    context.setAccount(account(accountId))
    return fn()
  }, '127.0.0.1')

/** The tenant in the request store, as TenantTransactionInterceptor puts it. */
export function enterTenant(tenant: { id: string; slug: string }) {
  TenantContextService.store().tenant = {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.slug,
    defaultLocale: 'pl',
    timezone: 'Europe/Warsaw',
  }
}

/** Runs `fn` in the tenant's transaction, with the tenant in its store. */
export const inTenant = <T>(
  context: TenantContextService,
  tenant: { id: string; slug: string },
  fn: () => Promise<T>,
) =>
  context.withTenant(tenant.id, () => {
    enterTenant(tenant)
    return fn()
  })
