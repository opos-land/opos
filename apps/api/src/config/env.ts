import { verifiedTls } from '@opos/db'
import { z } from 'zod'

/** A variable a template leaves empty counts as unset. */
const optionalUrl = z.preprocess((value) => (value === '' ? undefined : value), z.url().optional())

/** A key or a salt of imgproxy: hex, of at least 16 bytes, read into its bytes. */
const hexKey = z
  .string()
  .regex(/^(?:[0-9a-f]{2}){16,}$/i, 'hex of at least 16 bytes')
  .transform((value) => Buffer.from(value, 'hex'))

/** The runtime role each pool connects as (packages/db/src/roles.ts), never postgres. */
const POOL_ROLES = {
  DATABASE_URL: 'opos_app',
  DATABASE_GLOBAL_URL: 'opos_app_global',
  DATABASE_ADMIN_URL: 'opos_admin',
} as const

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // The one switch between environments: `NODE_ENV` is `production` on Dev too.
    OPOS_ENV: z.enum(['local', 'dev', 'production']),
    PORT: z.coerce.number().int().positive().default(3001),
    // The commit the deployment built, which every response names in X-Opos-Commit: Coolify's
    // SOURCE_COMMIT through the compose file, `unknown` where nothing names one.
    OPOS_COMMIT: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(/^[\w.-]{1,64}$/, 'a commit')
        .default('unknown'),
    ),
    DATABASE_URL: z.url(),
    DATABASE_GLOBAL_URL: z.url(),
    // The connection of opos_admin, which the admin routes alone use. Unset, with ADMIN_URL, where
    // this process serves no admin application: it then holds no admin route and no such role.
    DATABASE_ADMIN_URL: optionalUrl,
    // The project's CA certificate, which the image adds to Node's trust; required on Dev and
    // production, where every connection verifies the server against it.
    NODE_EXTRA_CA_CERTS: z.string().optional(),
    // The project's gateway, with Supabase Auth at /auth/v1.
    SUPABASE_URL: z.url(),
    // The project's secret key, sent as apikey with every Supabase Auth call.
    SUPABASE_SECRET_KEY: z.string().min(1),
    // GoTrue's hook secret format: a Standard Webhooks `whsec_` key behind the `v1,` version.
    SEND_EMAIL_HOOK_SECRET: z.string().regex(/^v1,whsec_[A-Za-z0-9+/]+={0,2}$/),
    // Signs organizer invitations; never the same as SUPABASE_SECRET_KEY.
    INVITE_SECRET: z.string().min(32),
    // Seals the credentials of a convention's payment provider account
    // (docs/specs/0002-shop-setup.md); never the same as another secret.
    PAYMENT_CREDENTIALS_KEY: z.string().min(32),
    // The API's own address, the one browsers and Supabase Auth reach it at.
    API_URL: z.url(),
    PANEL_URL: z.url(),
    PORTAL_URL: z.url(),
    // The admin application's address; set together with DATABASE_ADMIN_URL.
    ADMIN_URL: optionalUrl,
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive(),
    // Both empty in dev: Mailpit takes mail without authentication.
    SMTP_USER: z.string().default(''),
    SMTP_PASS: z.string().default(''),
    MAIL_FROM: z.string().min(1),
    // The bucket of uploaded files (docs/specs/0012-file-storage.md): its address, region and
    // name, and the key that opens it and nothing else.
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1),
    S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, 'a bucket name'),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    // The image server (docs/specs/0013-image-variants.md), its key and salt, and the bucket's
    // address as it reaches it, which is S3_ENDPOINT unless the two sit on different networks.
    IMGPROXY_URL: z.url(),
    IMGPROXY_KEY: hexKey,
    IMGPROXY_SALT: hexKey,
    IMGPROXY_BUCKET_ENDPOINT: optionalUrl,
    // Where Przelewy24 answers, in place of its own two addresses: for the tests of its module
    // alone, and only on local, where no real account is connected.
    PRZELEWY24_URL: optionalUrl,
    PRZELEWY24_SANDBOX_URL: optionalUrl,
    // The address the API calls a payment provider from, which never changes: a convention
    // enters it in its provider's panel, and the provider account's screen shows it.
    API_EGRESS_ADDRESS: z.union([z.ipv4(), z.ipv6()]).optional(),
    // Replaces the limit of every route that sets none of its own. Only the e2e
    // suite sets it, and only on local: a fast run spends the default of an address in seconds.
    RATE_LIMIT_DEFAULT: z.coerce.number().int().positive().optional(),
  })
  .refine((env) => env.RATE_LIMIT_DEFAULT === undefined || env.OPOS_ENV === 'local', {
    message: 'RATE_LIMIT_DEFAULT is allowed only when OPOS_ENV is local',
    path: ['RATE_LIMIT_DEFAULT'],
  })
  .refine((env) => env.PRZELEWY24_URL === undefined || env.OPOS_ENV === 'local', {
    message: 'PRZELEWY24_URL is allowed only when OPOS_ENV is local',
    path: ['PRZELEWY24_URL'],
  })
  .refine((env) => env.PRZELEWY24_SANDBOX_URL === undefined || env.OPOS_ENV === 'local', {
    message: 'PRZELEWY24_SANDBOX_URL is allowed only when OPOS_ENV is local',
    path: ['PRZELEWY24_SANDBOX_URL'],
  })
  .refine((env) => env.DATABASE_ADMIN_URL === undefined || env.ADMIN_URL !== undefined, {
    message: 'ADMIN_URL is required with DATABASE_ADMIN_URL',
    path: ['ADMIN_URL'],
  })
  .refine((env) => env.ADMIN_URL === undefined || env.DATABASE_ADMIN_URL !== undefined, {
    message: 'DATABASE_ADMIN_URL is required with ADMIN_URL',
    path: ['DATABASE_ADMIN_URL'],
  })
  // An application is told from another by its origin alone.
  .refine(
    (env) =>
      env.ADMIN_URL === undefined ||
      ![env.PANEL_URL, env.PORTAL_URL].some(
        (url) => new URL(url).origin === new URL(env.ADMIN_URL!).origin,
      ),
    { message: 'ADMIN_URL must differ from PANEL_URL and PORTAL_URL', path: ['ADMIN_URL'] },
  )
  // A deployed bucket is reached over TLS alone: its key signs every request.
  .refine((env) => env.OPOS_ENV === 'local' || new URL(env.S3_ENDPOINT).protocol === 'https:', {
    message: 'S3_ENDPOINT must be https on a deployed environment',
    path: ['S3_ENDPOINT'],
  })
  .refine((env) => env.INVITE_SECRET !== env.SUPABASE_SECRET_KEY, {
    message: 'INVITE_SECRET must differ from SUPABASE_SECRET_KEY',
    path: ['INVITE_SECRET'],
  })
  .refine((env) => env.PAYMENT_CREDENTIALS_KEY !== env.INVITE_SECRET, {
    message: 'PAYMENT_CREDENTIALS_KEY must differ from INVITE_SECRET',
    path: ['PAYMENT_CREDENTIALS_KEY'],
  })
  .refine((env) => env.PAYMENT_CREDENTIALS_KEY !== env.SUPABASE_SECRET_KEY, {
    message: 'PAYMENT_CREDENTIALS_KEY must differ from SUPABASE_SECRET_KEY',
    path: ['PAYMENT_CREDENTIALS_KEY'],
  })
  // On Dev and production, every pool reaches the project directly with verified TLS
  // (docs/adr/0013-connect-to-postgres-directly-with-verified-tls.md).
  .superRefine((env, context) => {
    const urls = {
      DATABASE_URL: env.DATABASE_URL,
      DATABASE_GLOBAL_URL: env.DATABASE_GLOBAL_URL,
      DATABASE_ADMIN_URL: env.DATABASE_ADMIN_URL,
    }
    for (const [key, url] of Object.entries(urls)) {
      if (url === undefined) continue
      // On a deployed environment a pool holds its own role alone: postgres would bypass RLS
      const role = POOL_ROLES[key as keyof typeof POOL_ROLES]
      if (env.OPOS_ENV !== 'local' && decodeURIComponent(new URL(url).username) !== role) {
        context.addIssue({
          code: 'custom',
          message: `${key} must name the role ${role}`,
          path: [key],
        })
        return
      }
      try {
        verifiedTls(key, url, {
          OPOS_ENV: env.OPOS_ENV,
          NODE_EXTRA_CA_CERTS: env.NODE_EXTRA_CA_CERTS,
        })
      } catch (error) {
        const message = (error as Error).message
        const path = message.startsWith('NODE_EXTRA_CA_CERTS') ? 'NODE_EXTRA_CA_CERTS' : key
        context.addIssue({ code: 'custom', message, path: [path] })
        return
      }
    }
  })

const withDefaults = envSchema.transform((env) => ({
  ...env,
  IMGPROXY_BUCKET_ENDPOINT: env.IMGPROXY_BUCKET_ENDPOINT ?? env.S3_ENDPOINT,
}))

export type Env = z.infer<typeof withDefaults>

export const ENV = Symbol('ENV')

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = withDefaults.safeParse(source)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment:\n${issues}`)
  }
  return result.data
}

/** Supabase Auth's address on the project's gateway. */
export const authUrl = (env: { SUPABASE_URL: string }) =>
  `${env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1`
