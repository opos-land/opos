import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { SignJWT } from 'jose'

// Prints a service_role JWT for SUPABASE_SERVICE_ROLE_KEY (PLAN.md 10, Admin API), signed with
// JWT_SECRET, the secret Supabase Auth verifies it with. `pnpm --filter api auth:service-key`
// for an environment's JWT_SECRET; `... auth:service-key --dev` for the key in .env.example.

/** The flag that lets the script sign with the dev secret of `.env.example`. */
const DEV_FLAG = '--dev'

/**
 * The secret to sign with, or why the script refuses. Without `--dev` it takes only an explicit
 * JWT_SECRET that is not the committed dev one, so a forgotten variable never yields a key that a
 * production Supabase Auth rejects; with `--dev` it falls back to the dev secret.
 */
export function signingSecret(
  secret: string | undefined,
  devSecret: string,
  dev: boolean,
): { secret: string } | { error: string } {
  const chosen = secret ?? (dev ? devSecret : undefined)
  if (!chosen || chosen.length < 32) {
    return { error: 'Set JWT_SECRET, at least 32 characters, to sign the service role key.' }
  }
  if (chosen === devSecret && !dev) {
    return {
      error: `JWT_SECRET is the dev secret from .env.example; pass ${DEV_FLAG} to sign the dev key.`,
    }
  }
  return { secret: chosen }
}

if (import.meta.main) {
  const devSecret = parseEnv(
    readFileSync(new URL('../../.env.example', import.meta.url), 'utf8'),
  ).JWT_SECRET
  if (!devSecret) throw new Error('.env.example has no JWT_SECRET')

  const chosen = signingSecret(process.env.JWT_SECRET, devSecret, process.argv.includes(DEV_FLAG))
  if ('error' in chosen) {
    console.error(chosen.error)
    process.exit(1)
  }

  const key = await new SignJWT({ role: 'service_role' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('10y')
    .sign(new TextEncoder().encode(chosen.secret))

  console.log(key)
}
