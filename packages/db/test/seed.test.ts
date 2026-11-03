import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

// The seed refuses before it opens a connection: it runs where OPOS_ENV is local or dev, and a
// missing variable stops it (PLAN.md 11, 14).

const seed = (env: Record<string, string | undefined>) =>
  spawnSync(process.execPath, ['--import', 'tsx', 'src/seed.ts'], {
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
  })

describe('db:seed', () => {
  it.each([{}, { OPOS_ENV: 'production' }, { OPOS_ENV: 'staging' }])(
    'refuses where OPOS_ENV is not local or dev: %o',
    (env) => {
      const { status, stderr } = seed(env)

      expect(status).toBe(1)
      expect(stderr).toMatch(/OPOS_ENV/)
    },
  )

  it('ignores the old flag on production', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'src/seed.ts', '--i-know-what-i-am-doing'],
      { env: { PATH: process.env.PATH, OPOS_ENV: 'production' }, encoding: 'utf8' },
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/OPOS_ENV/)
  })

  it.each([
    [{ OPOS_ENV: 'local' }, /SUPABASE_URL/],
    [{ OPOS_ENV: 'local', SUPABASE_URL: 'http://127.0.0.1:54321' }, /SUPABASE_SECRET_KEY/],
    [
      {
        OPOS_ENV: 'local',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_SECRET_KEY: 'sb_secret_x',
      },
      /DATABASE_MIGRATION_URL/,
    ],
  ])('stops on a missing variable: %o', (env, missing) => {
    const { status, stderr } = seed(env)

    expect(status).not.toBe(0)
    expect(stderr).toMatch(missing)
    expect(stderr).not.toContain('sb_secret_x')
  })
})
