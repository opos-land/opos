import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { accountFiles, type Database, uploadedFiles } from '@opos/db'
import { and, eq, inArray, lt, notExists, sql } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { GlobalDbService } from '../../common/database/global-db.service'
import { APP_DB } from '../../common/database/tokens'
import { ApiError } from '../../common/errors/api-error'
import { FileStorage, type ListedObject } from './file-storage'
import { FILE_KINDS } from './files.service'
import { type FileKind, isImageType } from './kinds'
import { OWNERS, parseKey, PREFIXES } from './owners'

/** How old something must be before the sweep takes it for left behind. */
export const SWEEP_AGE_MS = 24 * 60 * 60 * 1000
/** How often the sweep runs, and how long after the start it first does. */
const SWEEP_EVERY_MS = 24 * 60 * 60 * 1000
const FIRST_SWEEP_MS = 10 * 60 * 1000

/** Identifiers in lists of at most a thousand, for the statements of one sweep. */
export const batches = <T>(items: readonly T[], size = 1000): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  )

/** What one sweep removed. */
export interface SweepResult {
  rows: number
  objects: number
}

/**
 * The API's first job (docs/specs/0012-file-storage.md, X2): once a day it removes a file's row
 * nothing points at and an object no file's row explains, each once it is older than 24 hours,
 * and a variant no kind declares. A lock keeps it to one API process at a time.
 */
@Injectable()
export class FileSweep implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(FileSweep.name)
  private timer?: NodeJS.Timeout

  constructor(
    @Inject(FILE_KINDS) private readonly kinds: ReadonlyMap<string, FileKind>,
    private readonly storage: FileStorage,
    private readonly global: GlobalDbService,
    private readonly context: TenantContextService,
    @Inject(APP_DB) private readonly db: Database,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return
    const run = () => {
      this.sweep().catch((error: unknown) =>
        this.logger.error(`The sweep failed: ${String(error)}`),
      )
      this.timer = setTimeout(run, SWEEP_EVERY_MS).unref()
    }
    this.timer = setTimeout(run, FIRST_SWEEP_MS).unref()
  }

  onApplicationShutdown() {
    clearTimeout(this.timer)
  }

  /** One sweep; null when another process holds the lock. */
  sweep(now = new Date()): Promise<SweepResult | null> {
    return this.global.whileSweepLocked(async () => {
      const before = new Date(now.getTime() - SWEEP_AGE_MS)
      const rows = await this.removeUnpointed(before)
      const objects = await this.removeUnexplained(before)
      return { rows, objects }
    })
  }

  /**
   * The rows nothing points at, kind by kind, each removed in its owner's context. A kind that
   * fails, such as one whose pointing column opos_app_global cannot read, is logged and leaves the
   * others and the pass over the bucket to run.
   */
  private async removeUnpointed(before: Date): Promise<number> {
    let removed = 0
    for (const kind of this.kinds.values()) {
      try {
        removed += await this.removeUnpointedOf(kind, before)
      } catch (error) {
        this.logger.error(`The sweep skipped the kind ${kind.name}: ${String(error)}`)
      }
    }
    // Their objects have no row now; the pass over the bucket removes them.
    return removed
  }

  /**
   * The delete repeats the condition of the query that found the rows, so a file pointed at since
   * stays: a tenant's inside its transaction, where RLS scopes the pointing table too.
   */
  private async removeUnpointedOf(kind: FileKind, before: Date): Promise<number> {
    const files = await this.global.unpointedFiles(kind, before)
    let removed = 0
    if (!OWNERS[kind.owner].inTenant) {
      for (const ids of batches(files.map((file) => file.id))) {
        const gone = await this.db
          .delete(accountFiles)
          .where(
            and(
              inArray(accountFiles.id, ids),
              eq(accountFiles.kind, kind.name),
              lt(accountFiles.createdAt, before),
            ),
          )
          .returning({ id: accountFiles.id })
        removed += gone.length
      }
      return removed
    }
    const byTenant = Map.groupBy(files, (file) => file.tenantId!)
    for (const [tenantId, ofTenant] of byTenant) {
      try {
        for (const ids of batches(ofTenant.map((file) => file.id))) {
          const gone = await this.context.run(() =>
            this.context.withTenant(tenantId, () =>
              this.context
                .tx()
                .delete(uploadedFiles)
                .where(
                  and(
                    inArray(uploadedFiles.id, ids),
                    eq(uploadedFiles.kind, kind.name),
                    lt(uploadedFiles.createdAt, before),
                    notExists(
                      this.context
                        .tx()
                        .select({ one: sql`1` })
                        .from(kind.pointer.table)
                        .where(eq(kind.pointer, uploadedFiles.id)),
                    ),
                  ),
                )
                .returning({ id: uploadedFiles.id }),
            ),
          )
          removed += gone.length
        }
      } catch (error) {
        // A suspended tenant keeps its files until it is restored or deleted with them.
        if (error instanceof ApiError && error.code === 'tenant.suspended') continue
        throw error
      }
    }
    return removed
  }

  /**
   * The objects no row explains: the bytes of an upload that did not end in a kept file, and
   * those of a removed file, edition, tenant or account whose own removal did not happen; and a
   * kept file's object its kind does not name, such as a variant no longer declared.
   */
  private async removeUnexplained(before: Date): Promise<number> {
    const byFile = new Map<string, ListedObject[]>()
    for (const prefix of PREFIXES) {
      for await (const object of this.storage.list(`${prefix}/`)) {
        const parts = parseKey(object.key)
        const file = parts ? `${parts.prefix}/${parts.ownerId}/${parts.fileId}/` : object.key
        byFile.set(file, [...(byFile.get(file) ?? []), object])
      }
    }
    const ids = [...byFile.keys()]
      .map((file) => parseKey(`${file}x`)?.fileId)
      .filter((id) => id !== undefined)
    const kinds = await this.global.fileKinds(ids)
    const stale: string[] = []
    for (const [file, objects] of byFile) {
      const old = objects.filter((object) => object.lastModified < before)
      const fileId = parseKey(`${file}x`)?.fileId
      const kindName = fileId === undefined ? undefined : kinds.get(fileId)
      if (kindName === undefined) {
        stale.push(...old.map((object) => object.key))
        continue
      }
      const named = this.objectsOf(kindName)
      stale.push(
        ...old
          .filter((object) => !named.has(parseKey(object.key)!.object))
          .map((object) => object.key),
      )
    }
    await this.storage.remove(stale)
    return stale.length
  }

  /** The objects a kept file of a kind may have. */
  private objectsOf(kindName: string): Set<string> {
    const kind = this.kinds.get(kindName)
    // A kind no longer declared keeps its files' objects until their rows go.
    if (!kind) return new Set(['file', 'master', 'upload'])
    const images = kind.types.some(isImageType)
    return new Set([
      ...(kind.types.some((type) => !isImageType(type)) ? ['file'] : []),
      ...(images ? ['master', ...Object.keys(kind.variants ?? {})] : []),
    ])
  }
}
