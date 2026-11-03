import { describe, expect, it } from 'vitest'
import { authUrl, loadEnv } from './env'

const valid = {
  DATABASE_URL: 'postgres://opos_app:a@127.0.0.1:54322/postgres',
  DATABASE_GLOBAL_URL: 'postgres://opos_app_global:b@127.0.0.1:54322/postgres',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SECRET_KEY: 'sb_secret_local',
  SEND_EMAIL_HOOK_SECRET: `v1,whsec_${Buffer.alloc(32, 1).toString('base64')}`,
  INVITE_SECRET: 'c'.repeat(64),
  PANEL_URL: 'http://panel.opos.localhost:5173',
  PORTAL_URL: 'http://opos.localhost:5174',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '54325',
  MAIL_FROM: 'OPOS <no-reply@opos.localhost>',
}

describe('loadEnv', () => {
  it('takes the variables of PLAN.md 11', () => {
    expect(loadEnv(valid)).toMatchObject({
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SECRET_KEY: 'sb_secret_local',
      SMTP_PORT: 54325,
    })
  })

  it.each(['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'INVITE_SECRET', 'DATABASE_URL'])(
    'refuses a missing %s, naming it',
    (key) => {
      const source: Record<string, string | undefined> = { ...valid, [key]: undefined }

      expect(() => loadEnv(source)).toThrow(new RegExp(key))
    },
  )

  it('refuses a SUPABASE_URL that is not an address', () => {
    expect(() => loadEnv({ ...valid, SUPABASE_URL: 'not an address' })).toThrow(/SUPABASE_URL/)
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
