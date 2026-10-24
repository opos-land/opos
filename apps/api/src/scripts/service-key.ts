import { SignJWT } from 'jose'

// Prints a service_role JWT for SUPABASE_SERVICE_ROLE_KEY (PLAN.md 10, Admin API), signed with
// JWT_SECRET, the secret Supabase Auth verifies it with. `pnpm --filter api auth:service-key`.

const secret = process.env.JWT_SECRET
if (!secret || secret.length < 32) {
  console.error('Set JWT_SECRET, at least 32 characters, to sign the service role key.')
  process.exit(1)
}

const key = await new SignJWT({ role: 'service_role' })
  .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
  .setIssuedAt()
  .setExpirationTime('10y')
  .sign(new TextEncoder().encode(secret))

console.log(key)
