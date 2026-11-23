import { AsyncLocalStorage } from 'node:async_hooks'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { type Account, type SignInMethod, type Tenant } from '@opos/contract'
import {
  type Database,
  permissionLevel,
  setTenantContext,
  tenantRole,
  tenants,
  type Transaction,
} from '@opos/db'
import { eq } from 'drizzle-orm'
import { mailFailure } from '../../modules/mail/mail-failure'
import { APP_DB } from '../database/tokens'
import { tenantSuspended } from '../errors/api-error'

export type Level = (typeof permissionLevel.enumValues)[number]

/** The account's membership in the tenant of the request; never an expired one. */
export interface TenantMembership {
  id: string
  role: (typeof tenantRole.enumValues)[number]
  settingsAccess: Level
  brandingAccess: Level
  shopConfigAccess: Level
  expiresAt: Date | null
}

export type TenantInContext = Tenant

/** What one request knows about itself; the guards and the interceptor fill it. */
/** A scanner as a request names it: found across tenants by the hash of its device's token. */
export interface ScannerInContext {
  id: string
  tenantId: string
  tokenHash: string
}

export interface RequestStore {
  /** The client address, an IPv6 one by its /64, as the rate limit counts it. */
  clientAddress?: string
  /** The client address in full, IPv4-mapped reduced to IPv4: `Sb-Forwarded-For`. */
  clientIp?: string
  account?: Account
  /** The latest sign-in the access token records, in seconds since the epoch. */
  signedInAt?: number
  /** The sign-in methods the access token names. */
  signInMethods?: SignInMethod[]
  /** Whether the access token is at `aal2`: its session gave the code of a second factor. */
  aal2?: boolean
  tenant?: TenantInContext
  membership?: TenantMembership | null
  /**
   * The scanner a device's token named, its tenant and the hash of that token: a caller with no
   * account and no membership (modules/scanner). Whether it still stands, and still holds the
   * token, is judged in its tenant's transaction.
   */
  scanner?: ScannerInContext
  tx?: Transaction
  /** A transaction on opos_app for the session's own global rows, outside every tenant. */
  accountTx?: Transaction
  afterCommit?: (() => unknown)[]
  /** The file a route that takes one received before its transaction (modules/files). */
  received?: unknown
  /** What a route marked @Prepares did before its transaction (decorators/prepares.decorator). */
  prepared?: unknown
  /** The response oRPC is ready to send, held until the tenant transaction ends. */
  deferredResponse?: { status: number; send: () => unknown }
}

const storage = new AsyncLocalStorage<RequestStore>()

/** Thrown inside the transaction callback to roll back without an error reaching the caller. */
class Rollback<T> extends Error {
  constructor(readonly value: T) {
    super('rollback')
  }
}

@Injectable()
export class TenantContextService {
  private readonly logger = new Logger(TenantContextService.name)

  constructor(@Inject(APP_DB) private readonly db: Database) {}

  /** Runs `fn` with a fresh request store that knows only the client address, in both forms. */
  run<T>(fn: () => T, clientAddress?: string, clientIp?: string): T {
    return storage.run({ clientAddress, clientIp }, fn)
  }

  /** The client address of the request. */
  clientAddress(): string {
    const { clientAddress } = TenantContextService.store()
    if (!clientAddress) throw new Error('No client address in the request store')
    return clientAddress
  }

  /** The request store, or nothing outside a request. */
  static peek(): RequestStore | undefined {
    return storage.getStore()
  }

  static store(): RequestStore {
    const store = storage.getStore()
    if (!store) throw new Error('No request store: TenantContextMiddleware did not run')
    return store
  }

  setAccount(
    account: Account,
    signedInAt?: number,
    signInMethods: SignInMethod[] = [],
    aal2 = false,
  ) {
    const store = TenantContextService.store()
    store.account = account
    store.signedInAt = signedInAt
    store.signInMethods = signInMethods
    store.aal2 = aal2
  }

  /** Whether the session of the verified account gave the code of a second factor. */
  sessionAtAal2(): boolean {
    return TenantContextService.store().aal2 === true
  }

  /** The sign-in methods of the verified account; only behind JwtAuthGuard. */
  signInMethods(): SignInMethod[] {
    return TenantContextService.store().signInMethods ?? []
  }

  /** Whether the access token records a sign-in within the last `seconds`; behind JwtAuthGuard. */
  signedInWithin(seconds: number, now = Date.now()): boolean {
    const { signedInAt } = TenantContextService.store()
    return signedInAt !== undefined && now / 1000 - signedInAt < seconds
  }

  /** The verified account; only behind JwtAuthGuard. */
  account(): Account {
    const { account } = TenantContextService.store()
    if (!account) throw new Error('No account in the request store: JwtAuthGuard did not run')
    return account
  }

  setScanner(scanner: ScannerInContext) {
    TenantContextService.store().scanner = scanner
  }

  /** The scanner the request's token named; only behind ScannerGuard. */
  scanner(): ScannerInContext {
    const { scanner } = TenantContextService.store()
    if (!scanner) throw new Error('No scanner in the request store: ScannerGuard did not run')
    return scanner
  }

  /** The open tenant transaction; repositories never query a pool directly. */
  tx(): Transaction {
    const tx = storage.getStore()?.tx
    if (!tx) throw new Error('No tenant transaction is open')
    return tx
  }

  /** The tenant of a request that carried X-Tenant-Slug. */
  tenant(): TenantInContext {
    const { tenant } = TenantContextService.store()
    if (!tenant) throw new Error('No tenant in the request store: not a tenant route')
    return tenant
  }

  membership(): TenantMembership | null {
    return TenantContextService.store().membership ?? null
  }

  /** What the preparation of a route marked @Prepares answered, before the route's transaction. */
  prepared<T>(): T {
    const store = TenantContextService.store()
    if (!('prepared' in store))
      throw new Error('Nothing was prepared: the route is not marked @Prepares')
    return store.prepared as T
  }

  /** Runs `fn` after the open tenant or account transaction commits; dropped when it rolls back. */
  afterCommit(fn: () => unknown) {
    const store = storage.getStore()
    if (!(store?.tx || store?.accountTx) || !store.afterCommit) {
      throw new Error('No tenant or account transaction is open')
    }
    store.afterCommit.push(fn)
  }

  /** The open account transaction. */
  accountTx(): Transaction {
    const tx = storage.getStore()?.accountTx
    if (!tx) throw new Error('No account transaction is open')
    return tx
  }

  /**
   * A transaction on opos_app for the signed-in account's own global rows, such as its files,
   * outside every tenant; its after-commit queue runs once it commits.
   */
  async accountTransaction<T>(fn: () => Promise<T>): Promise<T> {
    const parent = TenantContextService.store()
    if (parent.tx || parent.accountTx) throw new Error('A transaction is already open')
    this.account()
    const store: RequestStore = { ...parent, afterCommit: [] }
    const result = await storage.run(store, () =>
      this.db.transaction(async (tx) => {
        store.accountTx = tx
        try {
          return await fn()
        } finally {
          store.accountTx = undefined
        }
      }),
    )
    await this.runAfterCommit(store)
    return result
  }

  private async runAfterCommit(store: RequestStore) {
    for (const fn of store.afterCommit ?? []) {
      try {
        await fn()
      } catch (error) {
        this.logger.error(`An after-commit step failed: ${mailFailure(error)}`)
      }
    }
  }

  /**
   * Opens a tenant context outside the X-Tenant-Slug flow: transaction, set_config, `fn`, commit
   * or rollback, after-commit queue. `tenantId` comes from an allowed cross-tenant lookup or a
   * verified token, never from the request.
   */
  withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return this.transaction(tenantId, fn)
  }

  /**
   * The tenant transaction itself; `commit` decides from the result whether to keep it. `ended`
   * runs once the transaction has committed or rolled back, before the after-commit queue and the
   * held response.
   */
  async transaction<T>(
    tenantId: string,
    fn: () => Promise<T>,
    commit: (result: T) => boolean = () => true,
    ended: () => void = () => {},
  ): Promise<T> {
    const parent = storage.getStore()
    if (parent?.tx || parent?.accountTx) throw new Error('A transaction is already open')
    const store: RequestStore = { ...parent, afterCommit: [] }

    let result: T
    try {
      result = await storage
        .run(store, () =>
          this.db.transaction(async (tx) => {
            store.tx = tx
            await setTenantContext(tx, tenantId)
            await refuseSuspended(tx, tenantId)
            const value = await fn()
            if (!commit(value)) throw new Rollback(value)
            return value
          }),
        )
        .finally(ended)
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
      await sendDeferred(store)
      return error.value as T
    } finally {
      store.tx = undefined
    }

    // Outbound I/O runs here, after the commit; a failure is logged, the response stands.
    await this.runAfterCommit(store)
    await sendDeferred(store)
    return result
  }
}

/**
 * A suspended tenant is off for everyone but the admin
 * (docs/adr/0031-suspend-a-tenant-before-deleting-it.md): no tenant transaction goes on, wherever
 * its tenant came from, the request's header, a token or an address. The check sits here, where
 * every such transaction opens, so a route built later keeps the rule by working in one.
 */
async function refuseSuspended(tx: Transaction, tenantId: string) {
  const [tenant] = await tx
    .select({ suspendedAt: tenants.suspendedAt })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
  if (tenant?.suspendedAt) throw tenantSuspended()
}

/**
 * The response oRPC held inside the transaction (defer-response.ts) goes out once the transaction
 * has ended; after a failed COMMIT it never does, and the error answers instead.
 */
async function sendDeferred(store: RequestStore) {
  const deferred = store.deferredResponse
  store.deferredResponse = undefined
  if (deferred) await deferred.send()
}
