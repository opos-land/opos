import { spawnSync } from 'node:child_process'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { type Database, migrationDb } from '../src/client'
import { migrationUrl } from '../src/migration-url'
import { SignInCodeError, signInCode } from '../src/sign-in-code'
import { totp } from '../src/totp'
import { addFactor, createUser, FACTOR_BASE32 } from './db'

// The code a developer signs in with on the local stack, read from the factor Supabase Auth
// stores. Anywhere else it would be a way around two-factor authentication, so it is refused, and
// the function reads OPOS_ENV itself: no caller hands the gate its own answer.

const db = migrationDb(migrationUrl(), { max: 2 })
afterAll(() => db.$client.end())
afterEach(() => vi.unstubAllEnvs())

// Seven seconds into a 30-second step.
const NOW = Date.UTC(2026, 10, 13, 12, 0, 7)

const refusal = (attempt: Promise<unknown>) =>
  attempt.then(
    () => 'no refusal',
    (error: unknown) => (error instanceof SignInCodeError ? error.code : error),
  )

describe('signInCode', () => {
  it("gives the code of the account's verified factor, and how long it lasts", async () => {
    vi.stubEnv('OPOS_ENV', 'local')
    const user = await createUser()
    await addFactor(user.id)

    expect(await signInCode(db, user.email, NOW)).toEqual({
      code: totp(FACTOR_BASE32, NOW),
      secondsLeft: 23,
    })
  })

  it('finds the account by its address in any case, with spaces around it', async () => {
    vi.stubEnv('OPOS_ENV', 'local')
    const user = await createUser()
    await addFactor(user.id)

    const { code } = await signInCode(db, `  ${user.email.toUpperCase()} `, NOW)
    expect(code).toBe(totp(FACTOR_BASE32, NOW))
  })

  it.each([['dev'], ['production'], [undefined]])(
    'refuses where OPOS_ENV is %s, before it reads anything',
    async (environment) => {
      vi.stubEnv('OPOS_ENV', environment)
      const execute = vi.fn()
      const untouched = { execute } as unknown as Database

      expect(await refusal(signInCode(untouched, 'anyone@example.test', NOW))).toBe(
        'environment.not-local',
      )
      expect(execute).not.toHaveBeenCalled()
    },
  )

  it('refuses an account whose factor is not verified', async () => {
    vi.stubEnv('OPOS_ENV', 'local')
    const user = await createUser()
    await addFactor(user.id, 'unverified')

    expect(await refusal(signInCode(db, user.email, NOW))).toBe('mfa.not-enabled')
  })

  it('refuses an account with two-factor authentication off', async () => {
    vi.stubEnv('OPOS_ENV', 'local')
    const user = await createUser()

    expect(await refusal(signInCode(db, user.email, NOW))).toBe('mfa.not-enabled')
  })

  // An address leads to an account only once confirmed (docs/ARCHITECTURE.md, Sessions and sign-in).
  it('finds no account by an address that is not confirmed', async () => {
    vi.stubEnv('OPOS_ENV', 'local')
    const user = await createUser({}, { confirmed: false })
    await addFactor(user.id)

    expect(await refusal(signInCode(db, user.email, NOW))).toBe('account.not-found')
  })

  it('refuses an address no account has', async () => {
    vi.stubEnv('OPOS_ENV', 'local')

    expect(await refusal(signInCode(db, 'nobody@example.test', NOW))).toBe('account.not-found')
  })
})

// Each case starts tsx in a process of its own, which takes seconds on a loaded machine.
describe('db:totp', { timeout: 60_000 }, () => {
  const run = (args: string[], environment: string | undefined) => {
    const rest = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => name !== 'OPOS_ENV'),
    )
    return spawnSync(process.execPath, ['--import', 'tsx', 'src/scripts/totp.ts', ...args], {
      env: environment === undefined ? rest : { ...rest, OPOS_ENV: environment },
      encoding: 'utf8',
    })
  }

  it('prints the code of the moment and how long it lasts', async () => {
    const user = await createUser()
    await addFactor(user.id)

    const before = Date.now()
    const result = run(['--email', user.email], 'local')
    const after = Date.now()

    expect(result.status, result.stderr).toBe(0)
    const [, code] = /^(\d{6}) \(for \d+ more seconds\)\n$/.exec(result.stdout) ?? []
    // The script takes seconds to start, so the step may have turned meanwhile.
    expect([totp(FACTOR_BASE32, before), totp(FACTOR_BASE32, after)]).toContain(code)
  })

  it.each([['dev'], ['production'], [undefined]])(
    'prints nothing where OPOS_ENV is %s, says why and fails',
    async (environment) => {
      const user = await createUser()
      await addFactor(user.id)

      const result = run(['--email', user.email], environment)

      expect(result.status).toBe(1)
      expect(result.stderr).toMatch(/^environment\.not-local: /)
      expect(result.stdout).toBe('')
    },
  )

  it('says why it refuses an account, by code, and fails', async () => {
    const user = await createUser()

    const result = run(['--email', user.email], 'local')

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/^mfa\.not-enabled: /)
    expect(result.stdout).toBe('')
  })

  it('asks for the address', () => {
    const result = run([], 'local')

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/Usage: pnpm db:totp --email <email>/)
  })
})
