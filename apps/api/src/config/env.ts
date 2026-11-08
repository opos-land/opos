import { z } from 'zod'

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // The one switch between environments: `NODE_ENV` is `production` on Dev too.
    OPOS_ENV: z.enum(['local', 'dev', 'production']),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.url(),
    DATABASE_GLOBAL_URL: z.url(),
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
  .refine((env) => env.INVITE_SECRET !== env.SUPABASE_SECRET_KEY, {
    message: 'INVITE_SECRET must differ from SUPABASE_SECRET_KEY',
    path: ['INVITE_SECRET'],
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
