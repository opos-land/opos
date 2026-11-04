import { describe, expect, it } from 'vitest'
import * as root from '../src/index'
import { migrationUrl, reachableUrl } from '../src/migration-url'

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

  it('is exported from the package root, so tests and fixtures read the URL through the guard', () => {
    expect(root.migrationUrl).toBe(migrationUrl)
  })

  // postgres.js takes the text after the first @ of the authority as the host list and connects to
  // its first entry, while new URL() reads the last @ and the whole list as one host name.
  it.each([
    'postgres://u:p@db.remote.example,x@localhost:54322/postgres',
    'postgres://u:p@db.remote.example,localhost:54322/postgres',
    'postgres://u@db.remote.example:5432@localhost:54322/postgres',
  ])('refuses a URL whose host postgres.js reads differently: %s', (url) => {
    let message = ''
    try {
      migrationUrl({ DATABASE_MIGRATION_URL: url })
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toMatch(/DATABASE_MIGRATION_URL/)
    expect(message).not.toContain('db.remote.example:5432')
    expect(message).not.toContain(':p@')
  })

  it('keeps the guard when OPOS_ENV is dev: a host list is refused there too', () => {
    expect(() =>
      migrationUrl({
        DATABASE_MIGRATION_URL: 'postgres://u:p@db.remote.example,x@localhost:54322/postgres',
        OPOS_ENV: 'dev',
      }),
    ).toThrow(/DATABASE_MIGRATION_URL/)
  })
})

describe('reachableUrl', () => {
  it('applies the rule of the database URL to any named variable', () => {
    expect(() => reachableUrl('SUPABASE_URL', 'https://auth.example.co', {})).toThrow(
      /SUPABASE_URL names the remote host auth\.example\.co/,
    )
    expect(reachableUrl('SUPABASE_URL', 'https://auth.example.co', { OPOS_ENV: 'dev' })).toBe(
      'https://auth.example.co',
    )
    expect(reachableUrl('SUPABASE_URL', 'http://127.0.0.1:54321', { OPOS_ENV: 'local' })).toBe(
      'http://127.0.0.1:54321',
    )
  })
})
