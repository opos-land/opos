import { createHash } from 'node:crypto'
import { Body, Controller, Get, Module, Param, Post } from '@nestjs/common'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { contract, type ContractMeta } from '@opos/contract'
import { type AnyContractRouter, isContractProcedure } from '@orpc/contract'
import { getTableName, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TenantContextService } from '../src/common/als/tenant-context.service'
import { GlobalDbService } from '../src/common/database/global-db.service'
import { RequireTenant } from '../src/common/decorators/require-tenant.decorator'
import { ApiError } from '../src/common/errors/api-error'
import { FilesService } from '../src/modules/files/files.service'
import { FILE_KINDS } from '../src/modules/files/kinds'
import { fileKey } from '../src/modules/files/owners'
import { sniff } from '../src/modules/files/sniff'
import { FileSweep } from '../src/modules/files/sweep.service'
import { ServesFile, TakesFile } from '../src/modules/files/takes-file.decorator'
import { createApp } from './app'
import { bindApi, createAccount, deleteCreatedAccounts, signedInAgent } from './auth'
import {
  asAccount,
  askImgproxy,
  asPostgres,
  convert,
  createHolders,
  dropHolders,
  enterTenant,
  inTenant,
  KINDS,
  objectBytes,
  objectKeys,
  point,
  putObject,
  signedAddress,
  upload,
} from './files'
import {
  animatedPng,
  cameraExif,
  exifTags,
  jpegHeader,
  pdf,
  png,
  pngChunks,
  withExif,
} from './pictures'
import { addEdition, deleteCreatedTenants, restore, suspend, tenantWithHead } from './tenants'

// File storage and image variants against the local Versity Gateway and imgproxy, through the
// service and the kinds declared for the tests (docs/specs/0012-file-storage.md,
// docs/specs/0013-image-variants.md). One file, so that the sweep never runs beside another test's
// upload.

const kinds = Object.values(KINDS)
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** Routes of a feature that take and serve a file of the tests, outside the contract. */
@Controller('files-test')
class FilesTestController {
  constructor(
    private readonly files: FilesService,
    private readonly context: TenantContextService,
  ) {}

  @Post('terms')
  @RequireTenant('settings', 'write')
  @TakesFile(KINDS.terms.name)
  async add(@Body() _body: unknown) {
    const file = await this.files.keep(this.files.received())
    // Inside the route's transaction: the store holds it.
    return { file, inTransaction: TenantContextService.peek()?.tx !== undefined }
  }

  @Get('terms/:id')
  @RequireTenant('settings', 'read')
  @ServesFile()
  async read(@Param('id') id: string) {
    const opened = await this.files.open(KINDS.terms.name, id)
    return {
      size: opened.size,
      tenant: this.context.tenant().id,
      inTransaction: TenantContextService.peek()?.tx !== undefined,
    }
  }
}

@Module({ controllers: [FilesTestController] })
class FilesTestModule {}

let app: NestExpressApplication
let files: FilesService
let context: TenantContextService
let sweep: FileSweep
/** The same API with the bucket out of reach, and with imgproxy out of reach. */
let noStorage: NestExpressApplication
let noImages: NestExpressApplication
let a: Awaited<ReturnType<typeof tenantWithHead>>
let b: Awaited<ReturnType<typeof tenantWithHead>>
let editionA: string

const serviceOf = (instance: NestExpressApplication) => instance.get(FilesService)
const contextOf = (instance: NestExpressApplication) => instance.get(TenantContextService)

/** Receives a file of a tenant's kind as its head, outside every transaction. */
const receive = (
  tenant: { id: string; slug: string; head: { id: string } },
  kind: string,
  body: ReturnType<typeof upload>,
  service = files,
  ctx = context,
) =>
  asAccount(ctx, tenant.head.id, () => {
    enterTenant(tenant)
    return service.receive(kind, body)
  })

/** Receives and keeps a file of a tenant, as a route that takes one does. */
async function kept(
  tenant: Awaited<ReturnType<typeof tenantWithHead>>,
  kind: string,
  body: ReturnType<typeof upload>,
  editionId?: string,
) {
  const received = await receive(tenant, kind, body)
  return asAccount(context, tenant.head.id, () =>
    inTenant(context, tenant, () => files.keep(received, editionId)),
  )
}

/**
 * Opens a file of a tenant outside every transaction, as a route that serves one does; a picture
 * in the edition of tenant a.
 */
const open = (
  tenant: { id: string; slug: string; head: { id: string } },
  kind: string,
  id: string,
  variant?: string,
  instance = app,
  editionId = kind === KINDS.pictures.name ? editionA : undefined,
) =>
  asAccount(contextOf(instance), tenant.head.id, () => {
    enterTenant(tenant)
    return serviceOf(instance).open(kind, id, { variant, editionId })
  })

/** The error a promise fails with. */
const failure = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected a failure')
}

const code = async (promise: Promise<unknown>) => ((await failure(promise)) as ApiError).code

beforeAll(async () => {
  await createHolders()
  app = await createApp({}, [], undefined, kinds)
  files = app.get(FilesService)
  context = app.get(TenantContextService)
  sweep = app.get(FileSweep)
  noStorage = await createApp({ S3_ENDPOINT: 'http://127.0.0.1:9' }, [], undefined, kinds)
  noImages = await createApp({ IMGPROXY_URL: 'http://127.0.0.1:9' }, [], undefined, kinds)
  ;[a, b] = await Promise.all([tenantWithHead(), tenantWithHead()])
  editionA = await addEdition(a.id)
})

afterAll(async () => {
  await Promise.all([app?.close(), noStorage?.close(), noImages?.close()])
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await dropHolders()
})

describe('the kinds the features declared', () => {
  // The sweep reads each pointing column across tenants: a column not granted would make it skip
  // that kind every day, and db:verify refuses a grant globalReads does not list
  // (docs/ARCHITECTURE.md, Tenant isolation).
  it('let opos_app_global read the column each kind points from', async () => {
    for (const kind of FILE_KINDS) {
      const table = `public.${getTableName(kind.pointer.table)}`
      const [row] = await asPostgres(
        sql`select has_column_privilege('opos_app_global', ${table}, ${kind.pointer.name}, 'SELECT') as readable`,
      )
      expect(row, kind.name).toEqual({ readable: true })
    }
  })
})

describe('a file received and kept', () => {
  it('lies under its owner with the bytes sent, and its row holds their size and checksum', async () => {
    const bytes = pdf()
    const file = await kept(a, KINDS.terms.name, upload(bytes, 'application/pdf', 'Terms.pdf'))

    expect(file).toMatchObject({ name: 'Terms.pdf', type: 'application/pdf', size: bytes.length })
    expect(await objectKeys(fileKey('convention', a.id, file.id))).toEqual([
      `${fileKey('convention', a.id, file.id)}file`,
    ])
    expect(await objectBytes(`${fileKey('convention', a.id, file.id)}file`)).toEqual(bytes)
    const [row] = await asPostgres(
      sql`select size, sha256, tenant_id from uploaded_files where id = ${file.id}`,
    )
    expect(row).toEqual({ size: bytes.length, sha256: sha256(bytes), tenant_id: a.id })
  })

  it('keeps the name as a label alone: no path, no control characters', async () => {
    const file = await kept(
      a,
      KINDS.terms.name,
      upload(pdf(), 'application/pdf', '../../etc/\u0007x.pdf'),
    )
    expect(file.name).toBe('x.pdf')
  })
})

describe('refusals', () => {
  it.each([
    ['a type outside the kind', upload(png(4, 4), 'image/png'), 'file.type-refused'],
    [
      'a type the storage keeps for no kind',
      upload(Buffer.from('<p>'), 'text/html'),
      'file.type-refused',
    ],
    [
      'a PDF whose content is no PDF',
      upload(Buffer.from('<html></html>'), 'application/pdf'),
      'file.type-refused',
    ],
    [
      'a file over its kind limit',
      upload(
        Buffer.concat([pdf(), Buffer.alloc(70 * 1024, 32), Buffer.from('\n%%EOF')]),
        'application/pdf',
      ),
      'file.too-large',
    ],
  ])('refuses %s, keeping nothing', async (_, body, expected) => {
    const before = await objectKeys(`tenants/${a.id}/`)
    expect(await code(receive(a, KINDS.terms.name, body))).toBe(expected)
    expect(await objectKeys(`tenants/${a.id}/`)).toEqual(before)
  })

  it.each([
    ['an HTML file declared as an image', Buffer.from('<!doctype html><script>alert(1)</script>')],
    ['an SVG declared as an image', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
  ])('refuses %s', async (_, bytes) => {
    expect(await code(receive(a, KINDS.pictures.name, upload(bytes, 'image/png')))).toBe(
      'file.type-refused',
    )
  })

  it("refuses a file once the convention's 5 GB are taken, its editions' counted", async () => {
    const tenant = await tenantWithHead()
    const edition = await addEdition(tenant.id)
    await asPostgres(sql`
      insert into uploaded_files (tenant_id, edition_id, kind, content_type, size, sha256, name)
      select ${tenant.id}, ${edition}, 'test-pictures', 'image/png', 15728640, repeat('0', 64), 'x.png'
      from generate_series(1, 341)
    `)
    await asPostgres(sql`
      insert into uploaded_files (tenant_id, kind, content_type, size, sha256, name)
      values (${tenant.id}, 'test-terms', 'application/pdf', ${5 * 1024 ** 3 - 341 * 15728640 - 100}, repeat('0', 64), 'x.pdf')
    `)
    expect(await code(kept(tenant, KINDS.terms.name, upload(pdf(), 'application/pdf')))).toBe(
      'file.limit-reached',
    )
  })

  it("refuses a file once the account's 50 MB are taken", async () => {
    const { id } = await createAccount()
    await asPostgres(sql`
      insert into account_files (account_id, kind, content_type, size, sha256, name)
      select ${id}, 'test-avatar', 'application/pdf', ${(50 * 1024 * 1024) / 4}, repeat('0', 64), 'x.pdf'
      from generate_series(1, 4)
    `)
    const received = await asAccount(context, id, () =>
      files.receive(KINDS.avatar.name, upload(pdf(), 'application/pdf')),
    )
    expect(
      await code(
        asAccount(context, id, () => context.accountTransaction(() => files.keep(received))),
      ),
    ).toBe('file.limit-reached')
  })
})

describe('the storage out of reach', () => {
  it('refuses an upload as unavailable and keeps nothing', async () => {
    const error = await failure(
      receive(
        a,
        KINDS.terms.name,
        upload(pdf(), 'application/pdf'),
        serviceOf(noStorage),
        contextOf(noStorage),
      ),
    )
    expect(error).toMatchObject({ code: 'storage.unavailable', status: 503 })
  })

  it('answers a kept file as unavailable', async () => {
    const file = await kept(a, KINDS.terms.name, upload(pdf(), 'application/pdf'))
    expect(await code(open(a, KINDS.terms.name, file.id, undefined, noStorage))).toBe(
      'storage.unavailable',
    )
  })

  it('finds no file of another tenant, before the bucket is asked', async () => {
    const file = await kept(a, KINDS.terms.name, upload(pdf(), 'application/pdf'))
    expect(await code(open(b, KINDS.terms.name, file.id, undefined, noStorage))).toBe(
      'request.not-found',
    )
    expect(await code(open(b, KINDS.terms.name, file.id))).toBe('request.not-found')
  })
})

describe("an account's file", () => {
  it('is kept and released for the session account alone', async () => {
    const [owner, other] = await Promise.all([createAccount(), createAccount()])
    const received = await asAccount(context, owner.id, () =>
      files.receive(KINDS.avatar.name, upload(pdf(), 'application/pdf')),
    )
    expect(received.ownerId).toBe(owner.id)
    await expect(
      asAccount(context, other.id, () => context.accountTransaction(() => files.keep(received))),
    ).rejects.toThrow(/another account/)
    const file = await asAccount(context, owner.id, () =>
      context.accountTransaction(() => files.keep(received)),
    )
    expect(
      await asAccount(context, other.id, () =>
        context.accountTransaction(() => files.release(KINDS.avatar.name, file.id)),
      ),
    ).toBe(false)
    expect(await objectKeys(fileKey('account', owner.id, file.id))).toHaveLength(1)
    expect(
      await asAccount(context, owner.id, () =>
        context.accountTransaction(() => files.release(KINDS.avatar.name, file.id)),
      ),
    ).toBe(true)
    expect(await objectKeys(fileKey('account', owner.id, file.id))).toEqual([])
  })
})

describe('releasing', () => {
  it('removes the row with the transaction and the objects after the commit', async () => {
    const file = await kept(a, KINDS.terms.name, upload(pdf(), 'application/pdf'))
    const key = fileKey('convention', a.id, file.id)
    await asAccount(context, a.head.id, () =>
      inTenant(context, a, async () => {
        expect(await files.release(KINDS.terms.name, file.id)).toBe(true)
        // Not before the commit
        expect(await objectKeys(key)).toHaveLength(1)
      }),
    )
    expect(await objectKeys(key)).toEqual([])
    expect(await asPostgres(sql`select 1 from uploaded_files where id = ${file.id}`)).toHaveLength(
      0,
    )
  })

  it('keeps both when the transaction rolls back', async () => {
    const file = await kept(a, KINDS.terms.name, upload(pdf(), 'application/pdf'))
    await asAccount(context, a.head.id, () =>
      inTenant(context, a, async () => {
        await files.release(KINDS.terms.name, file.id)
        throw new Error('rolled back')
      }),
    ).catch(() => {})
    expect(await objectKeys(fileKey('convention', a.id, file.id))).toHaveLength(1)
    expect(await asPostgres(sql`select 1 from uploaded_files where id = ${file.id}`)).toHaveLength(
      1,
    )
  })
})

describe('a route that takes or serves a file', () => {
  let routes: NestExpressApplication

  beforeAll(async () => {
    routes = await createApp({}, [FilesTestModule], undefined, kinds)
  })

  afterAll(() => routes?.close())

  it('receives the file after the requirement, and keeps it in its own transaction', async () => {
    bindApi(routes.getHttpServer())
    const agent = await signedInAgent('panel', a.head.email)
    const response = await agent
      .post('/files-test/terms')
      .set('x-tenant-slug', a.slug)
      .send({ file: upload(pdf(), 'application/pdf', 'rules.pdf') })
    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ file: { name: 'rules.pdf' }, inTransaction: true })

    const { file } = response.body as { file: { id: string } }
    const read = await agent.get(`/files-test/terms/${file.id}`).set('x-tenant-slug', a.slug)
    expect(read.body).toEqual({ size: pdf().length, tenant: a.id, inTransaction: false })
  })

  it('serves no file to an account outside the tenant, and no file of another tenant', async () => {
    bindApi(routes.getHttpServer())
    const file = await kept(a, KINDS.terms.name, upload(pdf(), 'application/pdf'))
    const ofB = await kept(b, KINDS.terms.name, upload(pdf(), 'application/pdf'))
    const outsider = await signedInAgent('panel', b.head.email)
    expect(
      (await outsider.get(`/files-test/terms/${file.id}`).set('x-tenant-slug', a.slug)).status,
    ).toBe(403)
    const head = await signedInAgent('panel', a.head.email)
    const foreign = await head.get(`/files-test/terms/${ofB.id}`).set('x-tenant-slug', a.slug)
    expect(foreign.status).toBe(404)
  })

  it('refuses a member without the permission before anything is received', async () => {
    bindApi(routes.getHttpServer())
    const agent = await signedInAgent('panel', b.head.email)
    const before = await objectKeys(`tenants/${a.id}/`)
    const response = await agent
      .post('/files-test/terms')
      .set('x-tenant-slug', a.slug)
      .send({ file: upload(pdf(), 'application/pdf') })
    expect(response.status).toBe(403)
    expect(await objectKeys(`tenants/${a.id}/`)).toEqual(before)
  })

  it('answers a type the storage keeps for no kind as refused, and a malformed file as invalid', async () => {
    bindApi(routes.getHttpServer())
    const agent = await signedInAgent('panel', a.head.email)
    const send = (file: unknown) =>
      agent.post('/files-test/terms').set('x-tenant-slug', a.slug).send({ file })

    const gif = await send({ name: 'x.gif', type: 'image/gif', data: 'R0lG' })
    expect(gif.status).toBe(422)
    expect(gif.body).toMatchObject({ code: 'file.type-refused' })
    const missing = await send({ name: 'x.pdf', type: 'application/pdf' })
    expect(missing.status).toBe(400)
    expect(missing.body).toMatchObject({ code: 'request.invalid', params: { field: 'file' } })
  })

  // A feature's route carries the storage's shape only with its own requirement
  // (docs/specs/0012-file-storage.md, Tenant isolation and permissions).
  it('marks no contract route as taking or serving a file but a tenant or account route', () => {
    const marked = (router: AnyContractRouter): ContractMeta[] =>
      Object.values(router).flatMap((value: AnyContractRouter) =>
        isContractProcedure(value)
          ? [value['~orpc'].meta as ContractMeta].filter(
              (meta) => meta.takesFile || meta.servesFile,
            )
          : marked(value),
      )
    for (const meta of marked(contract)) expect(meta.admin).not.toBe(true)
  })
})

describe('the objects of what goes', () => {
  let routes: NestExpressApplication

  beforeAll(async () => {
    routes = await createApp({}, [], undefined, kinds)
    bindApi(routes.getHttpServer())
  })

  afterAll(() => routes?.close())

  it("go after the commit of an edition's deletion, and stay when it is refused", async () => {
    const tenant = await tenantWithHead()
    const [edition, active] = await Promise.all([
      addEdition(tenant.id),
      addEdition(tenant.id, { isActive: true }),
    ])
    const [ofEdition, ofActive] = await Promise.all([
      kept(tenant, KINDS.pictures.name, upload(png(8, 8), 'image/png'), edition),
      kept(tenant, KINDS.pictures.name, upload(png(8, 8), 'image/png'), active),
    ])
    const agent = await signedInAgent('panel', tenant.head.email)

    expect(
      (await agent.delete(`/editions/${active}`).set('x-tenant-slug', tenant.slug)).status,
    ).toBe(409)
    expect(await objectKeys(fileKey('edition', tenant.id, ofActive.id))).not.toEqual([])
    expect(
      (await agent.delete(`/editions/${edition}`).set('x-tenant-slug', tenant.slug)).status,
    ).toBe(204)
    expect(await objectKeys(fileKey('edition', tenant.id, ofEdition.id))).toEqual([])
  })

  it("go once an account's deletion went through", async () => {
    const owner = await createAccount()
    const file = await asAccount(context, owner.id, async () => {
      const received = await files.receive(KINDS.avatar.name, upload(pdf(), 'application/pdf'))
      return context.accountTransaction(() => files.keep(received))
    })
    const agent = await signedInAgent('portal', owner.email)

    expect((await agent.delete('/me')).status).toBe(204)
    expect(await objectKeys(fileKey('account', owner.id, file.id))).toEqual([])
  })

  it("go with a deleted tenant's keys", async () => {
    const tenant = await tenantWithHead()
    const file = await kept(tenant, KINDS.terms.name, upload(pdf(), 'application/pdf'))
    await asPostgres(sql`delete from tenants where id = ${tenant.id}`)

    await files.forgetTenant(tenant.id)
    expect(await objectKeys(fileKey('convention', tenant.id, file.id))).toEqual([])
  })
})

describe('a master', () => {
  it('is upright, cleaned of what the camera wrote, in its format, and replaces the upload', async () => {
    const photo = withExif(
      await convert(png(300, 200, { alpha: false }), 'rs:fit:4096:4096:0', 'jpg'),
      cameraExif(6),
    )
    expect(exifTags(photo)).toEqual(
      expect.arrayContaining([0x8825, 0x8298, 0x013b, 0x0132, 0x010f]),
    )

    const file = await kept(
      a,
      KINDS.pictures.name,
      upload(photo, 'image/jpeg', 'photo.jpg'),
      editionA,
    )
    const key = fileKey('edition', a.id, file.id)
    const master = await objectBytes(`${key}master`)

    expect(sniff(master)).toEqual({ type: 'image/jpeg', width: 200, height: 300 })
    expect(file).toMatchObject({ type: 'image/jpeg', width: 200, height: 300, size: master.length })
    const tags = exifTags(master)
    for (const tag of [0x8825, 0x8298, 0x013b, 0x0132, 0x010f, 0x0110, -1]) {
      expect(tags, `tag ${tag}`).not.toContain(tag)
    }
    expect(await objectKeys(key)).toEqual([`${key}master`, `${key}thumb`])
  })

  it('keeps the transparency of a PNG and a single frame of an animation', async () => {
    const clear = await kept(a, KINDS.pictures.name, upload(png(40, 30), 'image/png'), editionA)
    const master = await objectBytes(`${fileKey('edition', a.id, clear.id)}master`)
    expect(master[25]).toBe(6)

    const animated = await kept(
      a,
      KINDS.pictures.name,
      upload(animatedPng(20, 20), 'image/png'),
      editionA,
    )
    const frame = await objectBytes(`${fileKey('edition', a.id, animated.id)}master`)
    expect(pngChunks(frame)).not.toContain('acTL')
    expect(pngChunks(frame)).not.toContain('fdAT')
  })

  it('is refused, with nothing kept, for content imgproxy cannot read and above 50 megapixels', async () => {
    const broken = png(20, 20)
    broken.fill(0, 40, 60)
    const before = await objectKeys(`tenants/${a.id}/`)
    expect(await code(receive(a, KINDS.pictures.name, upload(broken, 'image/png')))).toBe(
      'file.type-refused',
    )
    expect(
      await code(receive(a, KINDS.pictures.name, upload(jpegHeader(8000, 7000), 'image/jpeg'))),
    ).toBe('file.too-large')
    expect(await objectKeys(`tenants/${a.id}/`)).toEqual(before)
  })
})

describe('variants', () => {
  let picture: Awaited<ReturnType<typeof kept>>
  let key: string

  beforeAll(async () => {
    picture = await kept(
      a,
      KINDS.pictures.name,
      upload(png(300, 200), 'image/png', 'cat.png'),
      editionA,
    )
    key = fileKey('edition', a.id, picture.id)
  })

  it('makes one with the upload where its kind says so, cropped from the middle to fill its box', async () => {
    expect(await objectKeys(key)).toContain(`${key}thumb`)
    const thumb = await open(a, KINDS.pictures.name, picture.id, 'thumb')
    expect(thumb.type).toBe('image/webp')
    expect(sniff(thumb.bytes)).toEqual({ type: 'image/webp', width: 100, height: 100 })
    expect(thumb.name).toBe('cat.webp')
    expect(exifTags(Buffer.from(thumb.bytes))).toEqual([])
  })

  it('makes any other by its first read, fitted and never enlarged, then answers it from the bucket', async () => {
    expect(await objectKeys(key)).not.toContain(`${key}large`)
    const [first, second] = await Promise.all([
      open(a, KINDS.pictures.name, picture.id, 'large'),
      open(a, KINDS.pictures.name, picture.id, 'large'),
    ])
    expect(sniff(first.bytes)).toEqual({ type: 'image/webp', width: 300, height: 200 })
    expect(second.bytes).toEqual(first.bytes)
    expect(await objectKeys(key)).toContain(`${key}large`)
    // VP8X with the alpha flag: the transparency of the PNG stays.
    expect(Buffer.from(first.bytes).subarray(12, 16).toString()).toBe('VP8X')
    expect(first.bytes[20]! & 0x10).toBe(0x10)
    const again = await open(a, KINDS.pictures.name, picture.id, 'large', noImages)
    expect(again.bytes).toEqual(first.bytes)
  })

  it('finds no master, no undeclared variant and no variant of another tenant or edition, asking imgproxy nothing', async () => {
    for (const variant of [undefined, 'master', 'huge', 'constructor', '__proto__']) {
      expect(await code(open(a, KINDS.pictures.name, picture.id, variant, noImages))).toBe(
        'request.not-found',
      )
    }
    expect(await code(open(b, KINDS.pictures.name, picture.id, 'large', noImages))).toBe(
      'request.not-found',
    )
    const otherEdition = await addEdition(a.id)
    expect(
      await code(open(a, KINDS.pictures.name, picture.id, 'large', noImages, otherEdition)),
    ).toBe('request.not-found')
  })
})

describe('the image server out of reach', () => {
  it('refuses an image, keeping nothing, and keeps a PDF all the same', async () => {
    const before = await objectKeys(`tenants/${a.id}/`)
    expect(
      await code(
        receive(
          a,
          KINDS.pictures.name,
          upload(png(10, 10), 'image/png'),
          serviceOf(noImages),
          contextOf(noImages),
        ),
      ),
    ).toBe('images.unavailable')
    expect(await objectKeys(`tenants/${a.id}/`)).toEqual(before)
    const received = await receive(
      a,
      KINDS.terms.name,
      upload(pdf(), 'application/pdf'),
      serviceOf(noImages),
      contextOf(noImages),
    )
    expect(received.size).toBe(pdf().length)
  })

  it('serves a kept variant and answers one not yet made as unavailable, naming no address', async () => {
    const picture = await kept(a, KINDS.pictures.name, upload(png(50, 50), 'image/png'), editionA)
    expect(
      (await open(a, KINDS.pictures.name, picture.id, 'thumb', noImages)).bytes.length,
    ).toBeGreaterThan(0)
    const error = (await failure(
      open(a, KINDS.pictures.name, picture.id, 'large', noImages),
    )) as ApiError
    expect(error.code).toBe('images.unavailable')
    expect(error.logLine).not.toMatch(/X-Amz|http|127\.0\.0\.1/)
  })

  it('refuses a request the API did not sign, and a source outside the bucket', async () => {
    const source = await signedAddress('tenants/none/none/master')
    expect(await askImgproxy(source, false)).toBe(403)
    expect(await askImgproxy('http://example.com/opos/x.png', true)).toBe(404)
  })
})

describe('the sweep', () => {
  const later = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000)

  it('removes the bytes of an upload never kept once they are older than 24 hours', async () => {
    const received = await receive(a, KINDS.terms.name, upload(pdf(), 'application/pdf'))
    const key = fileKey('convention', a.id, received.id)
    await sweep.sweep(later(23))
    expect(await objectKeys(key)).toHaveLength(1)
    await sweep.sweep(later(25))
    expect(await objectKeys(key)).toEqual([])
  })

  it('removes a row nothing points at, and keeps a pointed one with its objects', async () => {
    const [loose, pointed] = await Promise.all([
      kept(a, KINDS.terms.name, upload(pdf(), 'application/pdf')),
      kept(a, KINDS.terms.name, upload(pdf(), 'application/pdf')),
    ])
    await point('convention', pointed.id)
    await sweep.sweep(later(25))
    expect(await asPostgres(sql`select 1 from uploaded_files where id = ${loose.id}`)).toHaveLength(
      0,
    )
    expect(
      await asPostgres(sql`select 1 from uploaded_files where id = ${pointed.id}`),
    ).toHaveLength(1)
    // The objects of the loose row go with the next pass over the bucket.
    await sweep.sweep(later(25))
    expect(await objectKeys(fileKey('convention', a.id, loose.id))).toEqual([])
    expect(await objectKeys(fileKey('convention', a.id, pointed.id))).toHaveLength(1)
  })

  it("removes an account's row nothing points at, and keeps a pointed one", async () => {
    const owner = await createAccount()
    const keep = () =>
      asAccount(context, owner.id, async () => {
        const received = await files.receive(KINDS.avatar.name, upload(pdf(), 'application/pdf'))
        return context.accountTransaction(() => files.keep(received))
      })
    const [loose, pointed] = [await keep(), await keep()]
    await point('account', pointed.id)
    await sweep.sweep(later(25))
    expect(await asPostgres(sql`select 1 from account_files where id = ${loose.id}`)).toHaveLength(
      0,
    )
    expect(
      await asPostgres(sql`select 1 from account_files where id = ${pointed.id}`),
    ).toHaveLength(1)
  })

  it('leaves the rows of a suspended tenant until it is restored', async () => {
    const tenant = await tenantWithHead()
    const file = await kept(tenant, KINDS.terms.name, upload(pdf(), 'application/pdf'))
    await suspend(tenant.id)
    expect(await sweep.sweep(later(25))).not.toBeNull()
    expect(await asPostgres(sql`select 1 from uploaded_files where id = ${file.id}`)).toHaveLength(
      1,
    )
    await restore(tenant.id)
    await sweep.sweep(later(25))
    expect(await asPostgres(sql`select 1 from uploaded_files where id = ${file.id}`)).toHaveLength(
      0,
    )
  })

  it('removes the objects of a deleted edition, a deleted tenant and a deleted account', async () => {
    const tenant = await tenantWithHead()
    const edition = await addEdition(tenant.id)
    const ofEdition = await kept(
      tenant,
      KINDS.pictures.name,
      upload(png(8, 8), 'image/png'),
      edition,
    )
    const other = await tenantWithHead()
    const ofTenant = await kept(other, KINDS.terms.name, upload(pdf(), 'application/pdf'))
    const owner = await createAccount()
    const ofAccount = await asAccount(context, owner.id, async () => {
      const received = await files.receive(KINDS.avatar.name, upload(pdf(), 'application/pdf'))
      return context.accountTransaction(() => files.keep(received))
    })
    for (const id of [ofEdition.id, ofTenant.id, ofAccount.id]) {
      await point(
        id === ofAccount.id ? 'account' : id === ofTenant.id ? 'convention' : 'edition',
        id,
      )
    }
    await asPostgres(sql`delete from editions where id = ${edition}`)
    await asPostgres(sql`delete from tenants where id = ${other.id}`)
    await asPostgres(sql`delete from accounts where id = ${owner.id}`)

    await sweep.sweep(later(25))
    expect(await objectKeys(fileKey('edition', tenant.id, ofEdition.id))).toEqual([])
    expect(await objectKeys(fileKey('convention', other.id, ofTenant.id))).toEqual([])
    expect(await objectKeys(fileKey('account', owner.id, ofAccount.id))).toEqual([])
  })

  it('removes a variant no kind declares and keeps the declared ones', async () => {
    const picture = await kept(a, KINDS.pictures.name, upload(png(30, 30), 'image/png'), editionA)
    await point('edition', picture.id)
    const key = fileKey('edition', a.id, picture.id)
    await putObject(`${key}old-size`, Buffer.from('x'), 'image/webp')
    await sweep.sweep(later(25))
    expect(await objectKeys(key)).toEqual([`${key}master`, `${key}thumb`])
  })

  it('runs in one process at a time', async () => {
    const other = noImages.get(FileSweep)
    const whileHeld = await app.get(GlobalDbService).whileSweepLocked(() => other.sweep(later(1)))
    expect(whileHeld).toBeNull()
    expect(await other.sweep(later(1))).not.toBeNull()
  })
})
