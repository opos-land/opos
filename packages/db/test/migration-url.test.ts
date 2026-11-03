import { describe, expect, it } from 'vitest'
import { migrationUrl } from '../src/migration-url'

// Every db:* script connects through this variable, with no default: a missing one and a remote
// host without the OPOS_ENV of its environment both stop the script (PLAN.md 11).

const remote = 'postgres://postgres:s3cret@db.example.supabase.co:5432/postgres'

describe('migrationUrl', () => {
  it.each([{}, { DATABASE_MIGRATION_URL: '' }, { DATABASE_MIGRATION_URL: '  ' }])(
    'throws when DATABASE_MIGRATION_URL is unset: %o',
    (env) => {
      expect(() => migrationUrl(env)).toThrow(/DATABASE_MIGRATION_URL/)
    },
  )

  it('reads process.env by default', () => {
    const before = process.env.DATABASE_MIGRATION_URL
    process.env.DATABASE_MIGRATION_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'
    try {
      expect(migrationUrl()).toBe('postgres://postgres:postgres@127.0.0.1:54322/postgres')
    } finally {
      process.env.DATABASE_MIGRATION_URL = before
    }
  })

  it.each([undefined, '', 'local', 'staging'])(
    'refuses a remote host without OPOS_ENV dev or production: %s',
    (OPOS_ENV) => {
      expect(() => migrationUrl({ DATABASE_MIGRATION_URL: remote, OPOS_ENV })).toThrow(/OPOS_ENV/)
    },
  )

  it('names the host of a refused URL and never its password', () => {
    let message = ''
    try {
      migrationUrl({ DATABASE_MIGRATION_URL: remote })
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toContain('db.example.supabase.co')
    expect(message).not.toContain('s3cret')
  })

  it('refuses a URL it cannot read without repeating it', () => {
    let message = ''
    try {
      migrationUrl({ DATABASE_MIGRATION_URL: 'not a url with s3cret' })
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toMatch(/DATABASE_MIGRATION_URL/)
    expect(message).not.toContain('s3cret')
  })

  it.each(['dev', 'production'])('accepts a remote host with OPOS_ENV %s', (OPOS_ENV) => {
    expect(migrationUrl({ DATABASE_MIGRATION_URL: remote, OPOS_ENV })).toBe(remote)
  })

  it.each(['127.0.0.1', 'localhost', '[::1]'])('accepts %s without OPOS_ENV', (host) => {
    const url = `postgres://postgres:postgres@${host}:54322/postgres`

    expect(migrationUrl({ DATABASE_MIGRATION_URL: url })).toBe(url)
  })

  it('takes OPOS_ENV local on the loopback interface', () => {
    const url = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

    expect(migrationUrl({ DATABASE_MIGRATION_URL: url, OPOS_ENV: 'local' })).toBe(url)
  })
})
