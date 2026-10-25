import { AsyncLocalStorage } from 'node:async_hooks'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { type Account, type Tenant } from '@opos/contract'
import {
  type Database,
  permissionLevel,
  setTenantContext,
  tenantRole,
  type Transaction,
} from '@opos/db'
import { APP_DB } from '../database/tokens'

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

/** What one request knows about itself (PLAN.md 7.2); the guards and the interceptor fill it. */
export interface RequestStore {
  /** The client address, an IPv6 one by its /64, as the rate limit counts it (PLAN.md 7.9). */
  clientAddress?: string
  account?: Account
  /** The latest sign-in the access token records, in seconds since the epoch (PLAN.md 7.4). */
  signedInAt?: number
  tenant?: TenantInContext
  membership?: TenantMembership | null
  tx?: Transaction
  afterCommit?: (() => unknown)[]
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

  /** Runs `fn` with a fresh request store that knows only the client address. */
  run<T>(fn: () => T, clientAddress?: string): T {
    return storage.run({ clientAddress }, fn)
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

  setAccount(account: Account, signedInAt?: number) {
    const store = TenantContextService.store()
    store.account = account
    store.signedInAt = signedInAt
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

  /** Runs `fn` after the open tenant transaction commits; dropped when it rolls back. */
  afterCommit(fn: () => unknown) {
    const store = storage.getStore()
    if (!store?.tx || !store.afterCommit) throw new Error('No tenant transaction is open')
    store.afterCommit.push(fn)
  }

  /**
   * Opens a tenant context outside the X-Tenant-Slug flow (PLAN.md 7.2): transaction,
   * set_config, `fn`, commit or rollback, after-commit queue. `tenantId` comes from a lookup in
   * PLAN.md 4.6 or a verified token, never from the request.
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
    if (parent?.tx) throw new Error('A tenant transaction is already open')
    const store: RequestStore = { ...parent, afterCommit: [] }

    let result: T
    try {
      result = await storage
        .run(store, () =>
          this.db.transaction(async (tx) => {
            store.tx = tx
            await setTenantContext(tx, tenantId)
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
    for (const fn of store.afterCommit ?? []) {
      try {
        await fn()
      } catch (error) {
        this.logger.error(error)
      }
    }
    await sendDeferred(store)
    return result
  }
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
