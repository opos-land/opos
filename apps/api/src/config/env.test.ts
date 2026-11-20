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
  PAYMENT_CREDENTIALS_KEY: 'e'.repeat(64),
  API_URL: 'http://api.opos.localhost:3001',
  PANEL_URL: 'http://panel.opos.localhost:5173',
  PORTAL_URL: 'http://opos.localhost:5174',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '54325',
  MAIL_FROM: 'OPOS <no-reply@opos.localhost>',
  S3_ENDPOINT: 'http://127.0.0.1:54330',
  S3_REGION: 'local',
  S3_BUCKET: 'opos',
  S3_ACCESS_KEY_ID: 'a1b2c3',
  S3_SECRET_ACCESS_KEY: 'd'.repeat(64),
  IMGPROXY_URL: 'http://127.0.0.1:54331',
  IMGPROXY_KEY: 'e'.repeat(64),
  IMGPROXY_SALT: 'f'.repeat(64),
}

describe('loadEnv', () => {
  it('takes a valid environment', () => {
    expect(loadEnv(valid)).toMatchObject({
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SECRET_KEY: 'sb_secret_local',
      SMTP_PORT: 54325,
    })
  })

  describe('the bucket and the image server', () => {
    it('reads the bucket and the image server, the key and salt as bytes', () => {
      const env = loadEnv(valid)
      expect(env.S3_BUCKET).toBe('opos')
      expect(env.IMGPROXY_KEY).toEqual(Buffer.from('e'.repeat(64), 'hex'))
      expect(env.IMGPROXY_SALT).toEqual(Buffer.from('f'.repeat(64), 'hex'))
    })

    it('has imgproxy read the bucket at its own address unless told another', () => {
      expect(loadEnv(valid).IMGPROXY_BUCKET_ENDPOINT).toBe('http://127.0.0.1:54330')
      expect(
        loadEnv({ ...valid, IMGPROXY_BUCKET_ENDPOINT: 'http://s3:7070' }).IMGPROXY_BUCKET_ENDPOINT,
      ).toBe('http://s3:7070')
      expect(loadEnv({ ...valid, IMGPROXY_BUCKET_ENDPOINT: '' }).IMGPROXY_BUCKET_ENDPOINT).toBe(
        'http://127.0.0.1:54330',
      )
    })

    it.each([
      'S3_ENDPOINT',
      'S3_REGION',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      'IMGPROXY_URL',
      'IMGPROXY_KEY',
      'IMGPROXY_SALT',
    ])('refuses to start without %s, naming it', (key) => {
      expect(() => loadEnv({ ...valid, [key]: '' })).toThrow(new RegExp(key))
    })

    it.each(['not hex', 'abc', 'e'.repeat(15)])('refuses an imgproxy key of %s', (value) => {
      expect(() => loadEnv({ ...valid, IMGPROXY_KEY: value })).toThrow(/IMGPROXY_KEY/)
    })

    it('refuses a bucket name S3 would not take', () => {
      expect(() => loadEnv({ ...valid, S3_BUCKET: 'Opos_Files' })).toThrow(/S3_BUCKET/)
    })

    it.each(['dev', 'production'])('refuses a bucket over plain http on %s', (OPOS_ENV) => {
      const deployed = {
        ...valid,
        OPOS_ENV,
        NODE_EXTRA_CA_CERTS: '/ca.crt',
        DATABASE_URL: 'postgres://opos_app:a@db.x.supabase.co:5432/postgres?sslmode=verify-full',
        DATABASE_GLOBAL_URL:
          'postgres://opos_app_global:b@db.x.supabase.co:5432/postgres?sslmode=verify-full',
      }
      expect(() => loadEnv(deployed)).toThrow(/S3_ENDPOINT/)
      expect(() =>
        loadEnv({ ...deployed, S3_ENDPOINT: 'https://s3.fr-par.scw.cloud' }),
      ).not.toThrow(/S3_ENDPOINT/)
    })
  })

  // Przelewy24 answers at two addresses of its own. Another address stands in for them in the
  // tests of its module alone: never where real money is taken or a real account is connected.
  describe('PRZELEWY24_URL and PRZELEWY24_SANDBOX_URL', () => {
    it('are unset by default, and take an address on local', () => {
      expect(loadEnv(valid).PRZELEWY24_URL).toBeUndefined()
      expect(loadEnv(valid).PRZELEWY24_SANDBOX_URL).toBeUndefined()
      const replaced = loadEnv({
        ...valid,
        PRZELEWY24_URL: 'http://127.0.0.1:9001',
        PRZELEWY24_SANDBOX_URL: 'http://127.0.0.1:9002',
      })
      expect(replaced).toMatchObject({
        PRZELEWY24_URL: 'http://127.0.0.1:9001',
        PRZELEWY24_SANDBOX_URL: 'http://127.0.0.1:9002',
      })
    })

    it.each(['dev', 'production'])('are refused where OPOS_ENV is %s', (OPOS_ENV) => {
      for (const name of ['PRZELEWY24_URL', 'PRZELEWY24_SANDBOX_URL']) {
        expect(() => loadEnv({ ...valid, OPOS_ENV, [name]: 'http://127.0.0.1:9001' })).toThrow(
          new RegExp(name),
        )
      }
    })
  })

  // The address the API calls a payment provider from, which a convention enters in the
  // provider's panel: shown on the provider account's screen where it is set.
  describe('API_EGRESS_ADDRESS', () => {
    it('is unset by default, and is an address when set', () => {
      expect(loadEnv(valid).API_EGRESS_ADDRESS).toBeUndefined()
      expect(loadEnv({ ...valid, API_EGRESS_ADDRESS: '203.0.113.7' }).API_EGRESS_ADDRESS).toBe(
        '203.0.113.7',
      )
      expect(() => loadEnv({ ...valid, API_EGRESS_ADDRESS: 'not an address' })).toThrow(
        /API_EGRESS_ADDRESS/,
      )
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
    'PAYMENT_CREDENTIALS_KEY',
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

  it('takes OPOS_ENV local', () => {
    expect(loadEnv(valid)).toMatchObject({ OPOS_ENV: 'local' })
  })

  it('refuses a PAYMENT_CREDENTIALS_KEY shorter than 32 characters', () => {
    expect(() => loadEnv({ ...valid, PAYMENT_CREDENTIALS_KEY: 'short' })).toThrow(
      /PAYMENT_CREDENTIALS_KEY/,
    )
  })

  it.each(['INVITE_SECRET', 'SUPABASE_SECRET_KEY'])(
    'refuses a PAYMENT_CREDENTIALS_KEY equal to %s, naming no value',
    (other) => {
      const secret = 'f'.repeat(64)

      let message = ''
      try {
        loadEnv({ ...valid, PAYMENT_CREDENTIALS_KEY: secret, [other]: secret })
      } catch (error) {
        message = (error as Error).message
      }

      expect(message).toMatch(new RegExp(`PAYMENT_CREDENTIALS_KEY must differ from ${other}`))
      expect(message).not.toContain(secret)
    },
  )

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

  describe('the admin application', () => {
    const admin = {
      ADMIN_URL: 'http://admin.opos.localhost:5175',
      DATABASE_ADMIN_URL: 'postgres://opos_admin:c@127.0.0.1:54322/postgres',
    }

    it('is not served by default', () => {
      const env = loadEnv(valid)

      expect(env.ADMIN_URL).toBeUndefined()
      expect(env.DATABASE_ADMIN_URL).toBeUndefined()
    })

    it('is served with its address and the connection of opos_admin', () => {
      expect(loadEnv({ ...valid, ...admin })).toMatchObject(admin)
    })

    it.each(Object.keys(admin))('refuses %s alone, naming the other', (key) => {
      const other = Object.keys(admin).find((name) => name !== key)!

      expect(() => loadEnv({ ...valid, [key]: admin[key as keyof typeof admin] })).toThrow(
        new RegExp(other),
      )
    })

    it.each(['PANEL_URL', 'PORTAL_URL'])('refuses the address of %s', (key) => {
      expect(() =>
        loadEnv({ ...valid, ...admin, ADMIN_URL: valid[key as 'PANEL_URL' | 'PORTAL_URL'] }),
      ).toThrow(/ADMIN_URL/)
    })

    it('takes an empty value as unset, as a template leaves it', () => {
      const env = loadEnv({ ...valid, ADMIN_URL: '', DATABASE_ADMIN_URL: '' })

      expect(env.ADMIN_URL).toBeUndefined()
      expect(env.DATABASE_ADMIN_URL).toBeUndefined()
    })
  })

  it('ignores the variables of the old stack', () => {
    const env = loadEnv({ ...valid, AUTH_URL: 'http://old', JWT_SECRET: 'x' })

    expect(env).not.toHaveProperty('AUTH_URL')
    expect(env).not.toHaveProperty('JWT_SECRET')
  })
  // A deployed environment reaches its project directly, with TLS verified against the CA the
  // image trusts (docs/adr/0013-connect-to-postgres-directly-with-verified-tls.md).
  describe('on a deployed environment', () => {
    const host = 'db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full'
    const deployed = {
      ...valid,
      OPOS_ENV: 'dev',
      NODE_ENV: 'production',
      NODE_EXTRA_CA_CERTS: '/etc/ssl/supabase/ca.crt',
      DATABASE_URL: `postgres://opos_app:a@${host}`,
      DATABASE_GLOBAL_URL: `postgres://opos_app_global:b@${host}`,
      DATABASE_ADMIN_URL: `postgres://opos_admin:c@${host}`,
      ADMIN_URL: 'https://admin.dev.opos.land',
      S3_ENDPOINT: 'https://s3.fr-par.scw.cloud',
    }

    it.each(['dev', 'production'])('takes OPOS_ENV %s with verified connections', (OPOS_ENV) => {
      expect(loadEnv({ ...deployed, OPOS_ENV })).toMatchObject({
        OPOS_ENV,
        DATABASE_ADMIN_URL: deployed.DATABASE_ADMIN_URL,
      })
    })

    it.each(['DATABASE_URL', 'DATABASE_GLOBAL_URL', 'DATABASE_ADMIN_URL'])(
      'refuses %s without verification, naming it and no part of it',
      (key) => {
        const unverified = deployed[key as keyof typeof deployed].replace('verify-full', 'require')

        expect(() => loadEnv({ ...deployed, [key]: unverified })).toThrow(
          `${key}: ${key} must ask for sslmode=verify-full on OPOS_ENV dev`,
        )
      },
    )

    it.each([
      ['DATABASE_URL', 'postgres'],
      ['DATABASE_URL', 'opos_admin'],
      ['DATABASE_GLOBAL_URL', 'opos_app'],
      ['DATABASE_ADMIN_URL', 'postgres'],
    ])('refuses %s naming the role %s instead of its own', (key, role) => {
      const url = deployed[key as keyof typeof deployed].replace(
        /^postgres:\/\/\w+:/,
        `postgres://${role}:`,
      )

      expect(() => loadEnv({ ...deployed, [key]: url })).toThrow(
        `${key}: ${key} must name the role`,
      )
    })

    it('refuses a pooler', () => {
      const pooler = deployed.DATABASE_URL.replace(':5432/', ':6543/')

      expect(() => loadEnv({ ...deployed, DATABASE_URL: pooler })).toThrow(
        'DATABASE_URL names a connection pooler',
      )
    })

    it('refuses to start without the CA', () => {
      expect(() => loadEnv({ ...deployed, NODE_EXTRA_CA_CERTS: undefined })).toThrow(
        /NODE_EXTRA_CA_CERTS must name the project's CA certificate/,
      )
    })
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
