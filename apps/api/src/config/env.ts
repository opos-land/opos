import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.url(),
  DATABASE_GLOBAL_URL: z.url(),
  AUTH_URL: z.url(),
  JWT_SECRET: z.string().min(32),
  // GoTrue's hook secret format: a Standard Webhooks `whsec_` key behind the `v1,` version.
  SEND_EMAIL_HOOK_SECRET: z.string().regex(/^v1,whsec_[A-Za-z0-9+/]+={0,2}$/),
  PANEL_URL: z.url(),
  PORTAL_URL: z.url(),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  // Both empty in dev: Mailpit takes mail without authentication.
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().min(1),
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
