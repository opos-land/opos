import { AsyncLocalStorage } from 'node:async_hooks'
import { Injectable } from '@nestjs/common'
import { type Account } from '@opos/contract'

/** What one request knows about itself (PLAN.md 7.2); the guards and the interceptor fill it. */
export interface RequestStore {
  account?: Account
}

const storage = new AsyncLocalStorage<RequestStore>()

@Injectable()
export class TenantContextService {
  /** Runs `fn` with a fresh, empty request store. */
  run<T>(fn: () => T): T {
    return storage.run({}, fn)
  }

  static store(): RequestStore {
    const store = storage.getStore()
    if (!store) throw new Error('No request store: TenantContextMiddleware did not run')
    return store
  }

  setAccount(account: Account) {
    TenantContextService.store().account = account
  }

  /** The verified account; only behind JwtAuthGuard. */
  account(): Account {
    const { account } = TenantContextService.store()
    if (!account) throw new Error('No account in the request store: JwtAuthGuard did not run')
    return account
  }
}
