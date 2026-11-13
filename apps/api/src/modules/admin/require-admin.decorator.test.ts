import { type ExecutionContext } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { AdminGuard } from './require-admin.decorator'

const env = {
  PORTAL_URL: 'https://opos.land',
  PANEL_URL: 'https://panel.opos.land',
  ADMIN_URL: 'https://admin.opos.land',
}

interface Setup {
  origin?: string
  grant?: { mfaEnabled: boolean; bound: boolean }
  aal2?: boolean
  /** How long ago the session signed in, in seconds. */
  signedIn?: number
  fresh?: boolean | 'unset'
}

function guard({
  origin = 'https://admin.opos.land',
  grant = { mfaEnabled: true, bound: true },
  aal2 = true,
  signedIn = 0,
  fresh = false,
}: Setup & { grant?: Setup['grant'] | null } = {}) {
  const asked: string[] = []
  const admin = {
    grantOf: (accountId: string) => {
      asked.push(accountId)
      return Promise.resolve(grant ?? undefined)
    },
  }
  const context = {
    account: () => ({ id: 'account-1' }),
    sessionAtAal2: () => aal2,
    signedInWithin: (seconds: number) => signedIn < seconds,
  }
  const reflector = { get: () => (fresh === 'unset' ? undefined : { fresh }) }
  const ctx = {
    switchToHttp: () => ({ getRequest: () => ({ headers: { origin } }) }),
    getHandler: () => () => {},
  } as unknown as ExecutionContext
  const instance = new AdminGuard(admin as never, context as never, env, reflector as never)
  return { run: () => instance.canActivate(ctx), asked }
}

const refusal = (setup: Parameters<typeof guard>[0]) =>
  guard(setup)
    .run()
    .then(
      () => 'passed',
      (error: { code?: string; getStatus?: () => number }) =>
        `${error.getStatus?.()} ${error.code}`,
    )

describe('AdminGuard', () => {
  it('lets an admin through', async () => {
    expect(await refusal({})).toBe('passed')
  })

  it.each(['https://panel.opos.land', 'https://opos.land', 'https://evil.example', 'null', ''])(
    'refuses the Origin %j before it asks who the account is',
    async (origin) => {
      const { run, asked } = guard({ origin })

      await expect(run()).rejects.toMatchObject({ code: 'request.origin-denied' })
      expect(asked).toEqual([])
    },
  )

  it.each([
    ['an account with no grant', { grant: null }, '403 permission.denied'],
    [
      'an admin with two-factor authentication off',
      { grant: { mfaEnabled: false, bound: false }, aal2: false },
      '403 admin.mfa-not-enabled',
    ],
    [
      'an admin whose factor is not the one of the grant',
      { grant: { mfaEnabled: true, bound: false } },
      '403 admin.grant-outdated',
    ],
    // JwtAuthGuard holds an account with a second factor to aal2 on a read of its own; the admin
    // guard does not lean on it.
    ['a session that gave no code', { aal2: false }, '401 session.mfa-required'],
    ['a sign-in of 31 minutes ago', { signedIn: 31 * 60 }, '401 session.reauthentication-required'],
    [
      'a sign-in of 6 minutes ago on an action that cannot be undone',
      { signedIn: 6 * 60, fresh: true },
      '401 session.reauthentication-required',
    ],
    [
      'a sign-in of 6 minutes ago on a route whose requirement is missing',
      { signedIn: 6 * 60, fresh: 'unset' },
      '401 session.reauthentication-required',
    ],
  ] as const)('refuses %s', async (_, setup, expected) => {
    expect(await refusal(setup as never)).toBe(expected)
  })

  it('takes a sign-in of 6 minutes ago on a route that can be undone', async () => {
    expect(await refusal({ signedIn: 6 * 60 })).toBe('passed')
  })
})
