import { type Database, migrationDb } from '@opos/db'
import { expect, test as base } from '@playwright/test'
import { type Account, createAuthUser, deleteAuthUser, freshEmail } from './auth-admin'
import { type PageRequest, requestsOutside } from './boundary'
import { deleteMail } from './mailpit'
import { stack } from './stack'
import { accountIds, TenantFactory } from './tenants'

/** Accounts made for one scenario and the addresses it used, all removed after it. */
export interface Accounts {
  /** An account made through the admin API, confirmed unless told otherwise. */
  create(options?: Parameters<typeof createAuthUser>[0]): Promise<Account>
  /** A fresh address for a sign-up through the UI; its account goes after the scenario too. */
  freshEmail(prefix?: string): string
}

interface ScenarioFixtures {
  accounts: Accounts
  tenants: TenantFactory
  /** Fails the scenario whose pages request anything outside the applications and the API. */
  boundary: void
}

interface WorkerFixtures {
  db: Database
}

// Scenarios share no data: each one makes its own accounts and tenants, and
// leaves nothing behind in the database or in Mailpit.
export const test = base.extend<ScenarioFixtures, WorkerFixtures>({
  // The BFF boundary: the browser talks to the panel, the portal and the API alone.
  // A request to Supabase or to anything else, from any page of the scenario, fails it; so does a
  // panel page requesting the portal, or the other way round, unless it is a navigation.
  boundary: [
    async ({ context }, use) => {
      const requests: PageRequest[] = []
      context.on('request', (request) => {
        // A request of a service worker has no frame: it counts as one of no origin.
        let frameOrigin: string | null = null
        try {
          const origin = new URL(request.frame().url()).origin
          frameOrigin = origin === 'null' ? null : origin
        } catch {
          // no frame, or none with a URL
        }
        requests.push({
          url: request.url(),
          frameOrigin,
          navigation: request.isNavigationRequest(),
        })
      })
      await use()
      expect(
        requestsOutside(requests, {
          api: new URL(stack.api).origin,
          applications: [stack.panel, stack.portal].map((url) => new URL(url).origin),
        }),
        'requests outside the origin of their page and the API',
      ).toEqual([])
    },
    { auto: true },
  ],

  db: [
    // Playwright reads a fixture's dependencies from the first parameter's pattern.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const db = migrationDb(stack.databaseUrl)
      await use(db)
      await db.$client.end()
    },
    { scope: 'worker' },
  ],

  accounts: async ({ db }, use) => {
    const ids: string[] = []
    const emails: string[] = []
    await use({
      async create(options = {}) {
        const account = await createAuthUser({ email: freshEmail(), ...options })
        ids.push(account.id)
        emails.push(account.email)
        return account
      },
      freshEmail(prefix) {
        const email = freshEmail(prefix)
        emails.push(email)
        return email
      },
    })
    const all = new Set([...ids, ...(await accountIds(db, emails))])
    await Promise.all([...all].map(deleteAuthUser))
    await Promise.all(emails.map(deleteMail))
  },

  // Depends on accounts, so its tenants are removed before the accounts heading them.
  tenants: async ({ db, accounts: _accounts }, use) => {
    const factory = new TenantFactory(db)
    await use(factory)
    await factory.cleanup()
  },
})

export { expect } from '@playwright/test'
