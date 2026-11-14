import { verifiedTls } from '@opos/db'
import { z } from 'zod'

/** A variable a template leaves empty counts as unset. */
const optionalUrl = z.preprocess((value) => (value === '' ? undefined : value), z.url().optional())

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
    // Replaces the limit of every route that sets none of its own. Only the e2e
    // suite sets it, and only on local: a fast run spends the default of an address in seconds.
    RATE_LIMIT_DEFAULT: z.coerce.number().int().positive().optional(),
  })
  .refine((env) => env.RATE_LIMIT_DEFAULT === undefined || env.OPOS_ENV === 'local', {
    message: 'RATE_LIMIT_DEFAULT is allowed only when OPOS_ENV is local',
    path: ['RATE_LIMIT_DEFAULT'],
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
  .refine((env) => env.INVITE_SECRET !== env.SUPABASE_SECRET_KEY, {
    message: 'INVITE_SECRET must differ from SUPABASE_SECRET_KEY',
    path: ['INVITE_SECRET'],
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

export type Env = z.infer<typeof envSchema>

export const ENV = Symbol('ENV')

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment:\n${issues}`)
  }
  return result.data
}

/** Supabase Auth's address on the project's gateway. */
export const authUrl = (env: { SUPABASE_URL: string }) =>
  `${env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1`
