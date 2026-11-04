import { afterEach, describe, expect, it, vi } from 'vitest'
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

  // postgres.js cuts the authority at the first @ and new URL at the last, so a second @ would make
  // the guard and the clients read different hosts; the guard names no fragment of such a URL.
  it.each([
    'postgres://u:p@ss,word@localhost:54322/postgres',
    'postgres://u:hunter2@sec,ret@db.remote.example:5432/postgres',
    'postgres://x:y@localhost,localhost:@db.remote.example:5432/postgres',
    'postgres://u:p@db.remote.example,x@localhost:54322/postgres',
    'postgres://u:p@ss@localhost:54322/postgres',
    'postgres://u@db.remote.example:5432@localhost:54322/postgres',
  ])('asks for a percent-encoded password when the authority holds a second @: %s', (url) => {
    for (const OPOS_ENV of [undefined, 'local', 'dev']) {
      let message = ''
      try {
        migrationUrl({ DATABASE_MIGRATION_URL: url, OPOS_ENV })
      } catch (error) {
        message = (error as Error).message
      }

      expect(message).toBe(
        'DATABASE_MIGRATION_URL holds more than one @ in its authority; percent-encode an @ in the password as %40',
      )
    }
  })

  it('accepts an @ in a query or a path, and an encoded @ in the password', () => {
    const url = 'postgres://u:p%40ss%2Cword@localhost:54322/postgres?options=a@b'

    expect(migrationUrl({ DATABASE_MIGRATION_URL: url })).toBe(url)
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

  // postgres.js reads the authority itself and takes the first host it can reach, so the guard asks
  // it: each URL here holds a host a URL parser never sees, or fails to read at all.
  it.each([
    ['postgres://u:p@db.remote.example,localhost:54322/postgres', 'db.remote.example'],
    ['postgres://localhost#@db.remote.example,x:5432/postgres', 'db.remote.example'],
    ['postgres://u:p@localhost:1#,db.remote.example:5432/postgres', 'db.remote.example'],
    ['postgres://u:p@localhost%2Cdb.remote.example:5432/postgres', 'db.remote.example'],
    ['postgres://u:p@[2001:db8::1]:5432/postgres', '[2001:db8::1]'],
  ])('refuses %s, naming the host and not the URL', (url, host) => {
    let message = ''
    try {
      migrationUrl({ DATABASE_MIGRATION_URL: url })
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toContain(`DATABASE_MIGRATION_URL names the remote host ${host}`)
    expect(message).not.toContain(url)
    expect(message).not.toContain(':p@')
  })

  it.each([
    'postgres://u:a,b@localhost:54322/postgres',
    'postgres://u:p@localhost:54322/postgres?host=db.remote.example',
    'postgres://u:p@localhost,127.0.0.1:54322/postgres',
  ])('accepts %s, whose every host postgres.js reads is local', (url) => {
    expect(migrationUrl({ DATABASE_MIGRATION_URL: url })).toBe(url)
  })

  describe('a URL naming no host', () => {
    const url = 'postgres:///postgres'

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('refuses it when PGHOST names a remote host', () => {
      vi.stubEnv('PGHOST', 'db.remote.example')

      expect(() => migrationUrl({ DATABASE_MIGRATION_URL: url })).toThrow(
        /DATABASE_MIGRATION_URL names the remote host db\.remote\.example/,
      )
    })

    it.each(['127.0.0.1', ''])('accepts it when PGHOST is %j', (PGHOST) => {
      vi.stubEnv('PGHOST', PGHOST)

      expect(migrationUrl({ DATABASE_MIGRATION_URL: url })).toBe(url)
    })
  })

  it('takes a host list on OPOS_ENV dev, where a remote host is allowed', () => {
    const url = 'postgres://u:p@db.remote.example,x:5432/postgres'

    expect(migrationUrl({ DATABASE_MIGRATION_URL: url, OPOS_ENV: 'dev' })).toBe(url)
  })

  it.each(['postgres://u:p@/postgres', 'postgres://u:p@%zz/postgres'])(
    'refuses %s, which postgres.js cannot read, on OPOS_ENV dev too',
    (url) => {
      const refused = () => migrationUrl({ DATABASE_MIGRATION_URL: url, OPOS_ENV: 'dev' })

      expect(refused).toThrow('DATABASE_MIGRATION_URL is not a URL')
    },
  )

  it('leaves nothing open behind it, so a script still exits', () => {
    const open = () => process.getActiveResourcesInfo().filter((name) => name !== 'TTYWrap')
    const before = open()

    for (let i = 0; i < 20; i++) {
      migrationUrl({ DATABASE_MIGRATION_URL: 'postgres://u:p@localhost:54322/postgres' })
    }

    expect(open()).toEqual(before)
  })
})

describe('reachableUrl', () => {
  it('reads the host as fetch reads it', () => {
    expect(reachableUrl('SUPABASE_URL', 'http://u:a,b@localhost:54321', {})).toBe(
      'http://u:a,b@localhost:54321',
    )
    expect(() =>
      reachableUrl('SUPABASE_URL', 'http://a@auth.example.co@localhost', {}),
    ).not.toThrow()
    expect(() => reachableUrl('SUPABASE_URL', 'http://localhost@auth.example.co', {})).toThrow(
      /names the remote host auth\.example\.co/,
    )
    expect(() => reachableUrl('SUPABASE_URL', 'nonsense', {})).toThrow('SUPABASE_URL is not a URL')
  })

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
