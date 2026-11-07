import { describe, expect, it } from 'vitest'
import { authUrl, loadEnv } from './env'

const valid = {
  OPOS_ENV: 'local',
  DATABASE_URL: 'postgres://opos_app:a@127.0.0.1:54322/postgres',
  DATABASE_GLOBAL_URL: 'postgres://opos_app_global:b@127.0.0.1:54322/postgres',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SECRET_KEY: 'sb_secret_local',
  SEND_EMAIL_HOOK_SECRET: `v1,whsec_${Buffer.alloc(32, 1).toString('base64')}`,
  INVITE_SECRET: 'c'.repeat(64),
  API_URL: 'http://api.opos.localhost:3001',
  PANEL_URL: 'http://panel.opos.localhost:5173',
  PORTAL_URL: 'http://opos.localhost:5174',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '54325',
  MAIL_FROM: 'OPOS <no-reply@opos.localhost>',
}

describe('loadEnv', () => {
  it('takes a valid environment', () => {
    expect(loadEnv(valid)).toMatchObject({
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SECRET_KEY: 'sb_secret_local',
      SMTP_PORT: 54325,
    })
  })

  describe('RATE_LIMIT_DEFAULT', () => {
    it('is unset by default', () => {
      expect(loadEnv(valid).RATE_LIMIT_DEFAULT).toBeUndefined()
    })

    it('is a positive integer on local', () => {
      expect(loadEnv({ ...valid, RATE_LIMIT_DEFAULT: '5000' }).RATE_LIMIT_DEFAULT).toBe(5000)
    })

    it.each(['dev', 'production'])('is refused on %s, naming it', (OPOS_ENV) => {
      expect(() => loadEnv({ ...valid, OPOS_ENV, RATE_LIMIT_DEFAULT: '5000' })).toThrow(
        /RATE_LIMIT_DEFAULT/,
      )
    })

    it.each(['0', '-1', '1.5', 'many'])('refuses %s', (value) => {
      expect(() => loadEnv({ ...valid, RATE_LIMIT_DEFAULT: value })).toThrow(/RATE_LIMIT_DEFAULT/)
    })
  })

  it.each([
    'SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'INVITE_SECRET',
    'DATABASE_URL',
    'OPOS_ENV',
    'API_URL',
  ])('refuses a missing %s, naming it', (key) => {
    const source: Record<string, string | undefined> = { ...valid, [key]: undefined }

    expect(() => loadEnv(source)).toThrow(new RegExp(key))
  })

  it('refuses a SUPABASE_URL that is not an address', () => {
    expect(() => loadEnv({ ...valid, SUPABASE_URL: 'not an address' })).toThrow(/SUPABASE_URL/)
  })

  it('refuses an OPOS_ENV that names no environment', () => {
    expect(() => loadEnv({ ...valid, OPOS_ENV: 'staging' })).toThrow(/OPOS_ENV/)
  })

  it.each(['local', 'dev', 'production'])('takes OPOS_ENV %s', (OPOS_ENV) => {
    expect(loadEnv({ ...valid, OPOS_ENV })).toMatchObject({ OPOS_ENV })
  })

  it('refuses an INVITE_SECRET equal to the secret key, naming no value', () => {
    const secret = 'd'.repeat(64)

    let message = ''
    try {
      loadEnv({ ...valid, INVITE_SECRET: secret, SUPABASE_SECRET_KEY: secret })
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toMatch(/INVITE_SECRET must differ from SUPABASE_SECRET_KEY/)
    expect(message).not.toContain(secret)
  })

  it('ignores the variables of the old stack', () => {
    const env = loadEnv({ ...valid, AUTH_URL: 'http://old', JWT_SECRET: 'x' })

    expect(env).not.toHaveProperty('AUTH_URL')
    expect(env).not.toHaveProperty('JWT_SECRET')
  })
})

describe('authUrl', () => {
  it.each(['http://127.0.0.1:54321', 'http://127.0.0.1:54321/', 'http://127.0.0.1:54321//'])(
    'places Supabase Auth under the gateway at %s',
    (SUPABASE_URL) => {
      expect(authUrl({ SUPABASE_URL })).toBe('http://127.0.0.1:54321/auth/v1')
    },
  )
})
