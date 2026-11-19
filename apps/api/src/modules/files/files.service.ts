import { createHash, randomUUID } from 'node:crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { type FileType, MAX_FILE_SIZE, type StoredFile, type UploadedFile } from '@opos/contract'
import { accountFiles, type Database, uploadedFiles } from '@opos/db'
import { and, eq, sql, sum } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { APP_DB } from '../../common/database/tokens'
import { notFound } from '../../common/errors/api-error'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { answerFile, type OpenedFile } from './answer'
import { fileLimitReached, fileTooLarge, fileTypeRefused, storageUnavailable } from './errors'
import { FileStorage } from './file-storage'
import { ImageServer } from './image-server'
import { masterRequest, variantRequest } from './imgproxy'
import { type FileKind, isImageType } from './kinds'
import { fileKey, fileLimitLockKey, OWNERS } from './owners'
import { sniff } from './sniff'

/** The registry of the kinds the features declared, by name. */
export const FILE_KINDS = Symbol('FILE_KINDS')

/** The largest image imgproxy reads, in pixels (docs/specs/0013-image-variants.md, M4). */
export const MAX_IMAGE_PIXELS = 50_000_000

/** A file whose bytes are in the bucket, not yet kept: its row is written by `keep`. */
export interface ReceivedFile {
  id: string
  kind: string
  ownerId: string
  type: FileType
  size: number
  sha256: string
  name: string
  width: number | null
  height: number | null
}

type ImageType = Exclude<FileType, 'application/pdf'>

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/**
 * The name a file was chosen under, as a label alone: its last path segment, without control
 * characters, within 255 characters. Where it lies in the bucket the storage names.
 */
export function fileLabel(name: string) {
  const label = (name.split(/[\\/]/).pop() ?? '')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()
    .slice(0, 255)
  return label === '' ? 'file' : label
}

const toStored = (row: {
  id: string
  name: string
  contentType: string
  size: number
  width: number | null
  height: number | null
}): StoredFile => ({
  id: row.id,
  name: row.name,
  type: row.contentType as FileType,
  size: row.size,
  width: row.width,
  height: row.height,
})

/**
 * The storage of files (docs/specs/0012-file-storage.md): it knows who a file belongs to and nothing
 * of what it is for. A feature declares its kinds, owns its routes and calls this service: the
 * bytes are received outside every transaction, kept and released in the caller's, and opened
 * outside every transaction once the feature decided who reads.
 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name)

  constructor(
    @Inject(FILE_KINDS) private readonly kinds: ReadonlyMap<string, FileKind>,
    private readonly storage: FileStorage,
    private readonly images: ImageServer,
    private readonly context: TenantContextService,
    @Inject(APP_DB) private readonly db: Database,
    private readonly limiter: RouteRateLimiter,
  ) {}

  /** A kind the features declared; another name is a mistake of the code. */
  kind(name: string): FileKind {
    const kind = this.kinds.get(name)
    if (!kind) throw new Error(`No kind of file is named ${name}`)
    return kind
  }

  private outsideTransactions(operation: string) {
    const store = TenantContextService.peek()
    if (store?.tx || store?.accountTx)
      throw new Error(`${operation} runs outside every transaction`)
  }

  /**
   * Checks an upload against its kind and its bytes against its type, stores them under a new
   * identifier, an image as its master with the variants its kind makes with the upload, and
   * answers what it stored. Outside every transaction; the owner is the session's account for an
   * account's kind, else the tenant TenantTransactionInterceptor put in the store after the
   * route's requirement passed, never a request's input.
   */
  async receive(kindName: string, upload: UploadedFile): Promise<ReceivedFile> {
    this.outsideTransactions('receive')
    const kind = this.kind(kindName)
    const account = this.context.account()
    await this.limiter.consume('uploads', `account:${account.id}`)
    const ownerId = OWNERS[kind.owner].inTenant ? this.context.tenant().id : account.id

    if (!kind.types.includes(upload.type)) throw fileTypeRefused()
    const bytes = Buffer.from(upload.data, 'base64')
    if (bytes.length > (kind.maxSize ?? MAX_FILE_SIZE)) throw fileTooLarge()
    const sniffed = sniff(bytes)
    if (sniffed?.type !== upload.type) throw fileTypeRefused()

    const id = randomUUID()
    const key = fileKey(kind.owner, ownerId, id)
    const received = {
      id,
      kind: kind.name,
      ownerId,
      type: upload.type,
      name: fileLabel(upload.name),
    }
    if (!isImageType(upload.type)) {
      await this.storage.put(`${key}file`, bytes, upload.type)
      return { ...received, size: bytes.length, sha256: sha256(bytes), width: null, height: null }
    }
    if ((sniffed.width ?? 0) * (sniffed.height ?? 0) > MAX_IMAGE_PIXELS) throw fileTooLarge()
    return { ...received, ...(await this.storeImage(kind, key, bytes, upload.type)) }
  }

  /** The upload goes to imgproxy, which answers the master; the upload itself is not kept. */
  private async storeImage(kind: FileKind, key: string, bytes: Uint8Array, type: ImageType) {
    await this.storage.put(`${key}upload`, bytes, type)
    try {
      const master = await this.images.make(
        await this.storage.readUrl(`${key}upload`),
        masterRequest(type),
      )
      if (master.bytes.length > MAX_FILE_SIZE) throw fileTooLarge()
      await this.storage.put(`${key}master`, master.bytes, type)
      for (const [name, variant] of Object.entries(kind.variants ?? {})) {
        if (!variant.withUpload) continue
        const made = await this.images.make(
          await this.storage.readUrl(`${key}master`),
          variantRequest(variant),
        )
        await this.storage.put(`${key}${name}`, made.bytes, 'image/webp')
      }
      return {
        size: master.bytes.length,
        sha256: sha256(master.bytes),
        width: master.width,
        height: master.height,
      }
    } finally {
      // Left behind on a failure, the sweep removes it.
      await this.storage
        .remove([`${key}upload`])
        .catch((error: unknown) =>
          this.logger.warn(`An upload stayed in the bucket: ${String(error)}`),
        )
    }
  }

  /** The file a route that takes one received before its transaction opened. */
  received(): ReceivedFile {
    const received = TenantContextService.store().received as ReceivedFile | undefined
    if (!received) throw new Error('No file was received: the route is not marked @TakesFile')
    return received
  }

  /**
   * Writes the row of a file just received, in the caller's transaction, within its owner's limit;
   * an edition's file names its edition, which its row ties to the tenant.
   */
  async keep(received: ReceivedFile, editionId?: string): Promise<StoredFile> {
    const kind = this.kind(received.kind)
    const owner = OWNERS[kind.owner]
    if (kind.owner === 'edition' && !editionId) throw new Error(`${kind.name} needs its edition`)
    const row = {
      id: received.id,
      kind: kind.name,
      contentType: received.type,
      size: received.size,
      sha256: received.sha256,
      name: received.name,
      width: received.width,
      height: received.height,
    }
    if (!owner.inTenant) {
      const tx = this.context.accountTx()
      const accountId = this.context.account().id
      if (received.ownerId !== accountId)
        throw new Error('The file was received for another account')
      await tx.execute(sql`select pg_advisory_xact_lock(${fileLimitLockKey(accountId)}::bigint)`)
      const [used] = await tx
        .select({ bytes: sum(accountFiles.size).mapWith(Number) })
        .from(accountFiles)
        .where(eq(accountFiles.accountId, accountId))
      if ((used?.bytes ?? 0) + received.size > owner.limit) throw fileLimitReached()
      const [kept] = await tx
        .insert(accountFiles)
        .values({ ...row, accountId })
        .returning()
      return toStored(kept!)
    }
    const tx = this.context.tx()
    const tenantId = this.context.tenant().id
    if (received.ownerId !== tenantId) throw new Error('The file was received for another tenant')
    await tx.execute(sql`select pg_advisory_xact_lock(${fileLimitLockKey(tenantId)}::bigint)`)
    // RLS counts the files of the tenant in context alone, its editions' included.
    const [used] = await tx
      .select({ bytes: sum(uploadedFiles.size).mapWith(Number) })
      .from(uploadedFiles)
    if ((used?.bytes ?? 0) + received.size > owner.limit) throw fileLimitReached()
    const [kept] = await tx
      .insert(uploadedFiles)
      .values({ ...row, tenantId, editionId: kind.owner === 'edition' ? editionId : null })
      .returning()
    return toStored(kept!)
  }

  /**
   * Removes a file's row in the caller's transaction; its objects go after the commit. An
   * account's file only of the session's account, an edition's only of the edition the route's
   * path names. Answers whether the file was there.
   */
  async release(kindName: string, fileId: string, editionId?: string): Promise<boolean> {
    const kind = this.kind(kindName)
    let ownerId: string
    if (!OWNERS[kind.owner].inTenant) {
      ownerId = this.context.account().id
      const gone = await this.context
        .accountTx()
        .delete(accountFiles)
        .where(
          and(
            eq(accountFiles.id, fileId),
            eq(accountFiles.accountId, ownerId),
            eq(accountFiles.kind, kind.name),
          ),
        )
        .returning({ id: accountFiles.id })
      if (gone.length === 0) return false
    } else {
      const [gone] = await this.context
        .tx()
        .delete(uploadedFiles)
        .where(this.inOwner(kind, fileId, editionId))
        .returning({ tenantId: uploadedFiles.tenantId })
      if (!gone) return false
      ownerId = gone.tenantId
    }
    this.context.afterCommit(() => this.removeObjects(fileKey(kind.owner, ownerId, fileId)))
    return true
  }

  /**
   * In the transaction that deletes an edition, before it does: the objects of the edition's files
   * go after the commit, and stay when it rolls back. The rows go with the edition.
   */
  async forgetEdition(editionId: string) {
    const rows = await this.context
      .tx()
      .select({ id: uploadedFiles.id, tenantId: uploadedFiles.tenantId })
      .from(uploadedFiles)
      .where(eq(uploadedFiles.editionId, editionId))
    this.context.afterCommit(async () => {
      for (const row of rows) await this.removeObjects(fileKey('edition', row.tenantId, row.id))
    })
  }

  /** Once a tenant is deleted: the objects under its keys; the sweep removes what this leaves. */
  forgetTenant(tenantId: string) {
    return this.forget(`${OWNERS.convention.prefix}/${tenantId}/`)
  }

  /** Once an account is deleted: the objects under its keys. */
  forgetAccount(accountId: string) {
    return this.forget(`${OWNERS.account.prefix}/${accountId}/`)
  }

  private async forget(prefix: string) {
    try {
      await this.removeObjects(prefix)
    } catch (error) {
      this.logger.warn(
        `Objects stayed for the sweep: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  /** Removes every object under a prefix: a file's, a deleted tenant's or account's. */
  async removeObjects(prefix: string) {
    const keys: string[] = []
    for await (const object of this.storage.list(prefix)) keys.push(object.key)
    await this.storage.remove(keys)
  }

  /**
   * A kept file's bytes, for an image those of a declared variant, made by its first read. Outside
   * every transaction, once the feature has decided who reads: a convention's file in the tenant of
   * the context, an edition's in the edition the route's path names, an account's of the session's
   * account. A public route, which admits nobody to a tenant and so has none in its context, names
   * the tenant itself as `tenantId`, from the lookup of the address and never from a request's
   * input. A file of another owner is not found before the bucket is asked. Another account's
   * file is read through a tenant row that points at it, which no feature needs yet.
   */
  async open(
    kindName: string,
    fileId: string,
    {
      variant,
      editionId,
      tenantId,
    }: { variant?: string; editionId?: string; tenantId?: string } = {},
  ): Promise<OpenedFile> {
    this.outsideTransactions('open')
    const kind = this.kind(kindName)
    const columns = {
      name: uploadedFiles.name,
      contentType: uploadedFiles.contentType,
      size: uploadedFiles.size,
      sha256: uploadedFiles.sha256,
    }
    let row: { name: string; contentType: string; size: number; sha256: string } | undefined
    let ownerId: string
    if (!OWNERS[kind.owner].inTenant) {
      ownerId = this.context.account().id
      ;[row] = await this.db
        .select({
          name: accountFiles.name,
          contentType: accountFiles.contentType,
          size: accountFiles.size,
          sha256: accountFiles.sha256,
        })
        .from(accountFiles)
        .where(
          and(
            eq(accountFiles.id, fileId),
            eq(accountFiles.accountId, ownerId),
            eq(accountFiles.kind, kind.name),
          ),
        )
    } else {
      ownerId = tenantId ?? this.context.tenant().id
      ;[row] = await this.context.withTenant(ownerId, () =>
        this.context
          .tx()
          .select(columns)
          .from(uploadedFiles)
          .where(this.inOwner(kind, fileId, editionId)),
      )
    }
    if (!row) throw notFound('file')
    const type = row.contentType as FileType
    const key = fileKey(kind.owner, ownerId, fileId)

    if (!isImageType(type)) {
      const object = await this.storage.get(`${key}file`)
      if (!object) throw storageUnavailable('a kept file has no object')
      return { type, name: row.name, size: row.size, sha256: row.sha256, bytes: object.bytes }
    }
    // A browser gets a variant, never a master; an undeclared one is not found.
    const variants = kind.variants ?? {}
    const declared =
      variant !== undefined && Object.hasOwn(variants, variant) ? variants[variant] : undefined
    if (!declared) throw notFound('variant')
    const name = row.name.replace(/\.[^.]*$/, '') + '.webp'
    let bytes = (await this.storage.get(`${key}${variant}`))?.bytes
    if (!bytes) {
      const made = await this.images.make(
        await this.storage.readUrl(`${key}master`),
        variantRequest(declared),
      )
      // Two first reads at once make it twice, with the same bytes.
      await this.storage.put(`${key}${variant}`, made.bytes, 'image/webp')
      bytes = made.bytes
    }
    return { type: 'image/webp', name, size: bytes.length, sha256: sha256(bytes), bytes }
  }

  /** A convention's file of the kind, or an edition's of the kind in the edition the path names. */
  private inOwner(kind: FileKind, fileId: string, editionId?: string) {
    const conditions = [eq(uploadedFiles.id, fileId), eq(uploadedFiles.kind, kind.name)]
    if (kind.owner === 'edition') {
      if (!editionId) throw new Error(`${kind.name} is found in its edition`)
      conditions.push(eq(uploadedFiles.editionId, editionId))
    }
    return and(...conditions)
  }

  /** The answer of a route that serves the file, with the storage's headers. */
  answer(file: OpenedFile, options: { forEveryone: boolean }) {
    return answerFile(file, options)
  }
}
