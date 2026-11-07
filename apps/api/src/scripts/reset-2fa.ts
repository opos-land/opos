import { migrationDb, migrationUrl } from '@opos/db'
import { z } from 'zod'
import { AuthAdminClient } from '../modules/auth/auth-admin.client'
import { SupabaseAuthFactory } from '../modules/auth/supabase-auth.factory'
import { MailService } from '../modules/mail/mail.service'
import { reportReset, ResetError, resetTwoFactor } from './reset-two-factor'

// `pnpm db:account:reset-2fa <email>`: the entry of the reset. It reads what `tools`
// is given: the `postgres` role's URL, the Supabase Auth address and secret key, and
// the mail settings.

const usage = 'Usage: pnpm db:account:reset-2fa <email>'

const env = z
  .object({
    OPOS_ENV: z.enum(['local', 'dev', 'production']),
    SUPABASE_URL: z.url(),
    SUPABASE_SECRET_KEY: z.string().min(1),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive(),
    SMTP_USER: z.string().default(''),
    SMTP_PASS: z.string().default(''),
    MAIL_FROM: z.string().min(1),
  })
  .parse(process.env)

const [email, ...rest] = process.argv.slice(2)
if (!email || rest.length > 0) {
  console.error(usage)
  process.exit(1)
}

const db = migrationDb(migrationUrl())
try {
  const result = await resetTwoFactor(
    { db, admin: new AuthAdminClient(new SupabaseAuthFactory(env)), mail: new MailService(env) },
    email,
  )
  process.exitCode = reportReset(result, console)
} catch (error) {
  if (!(error instanceof ResetError)) throw error
  console.error(`${error.code}: ${error.message}`)
  process.exitCode = 1
} finally {
  await db.$client.end()
}
