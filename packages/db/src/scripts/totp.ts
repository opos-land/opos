import { parseArgs } from 'node:util'
import { migrationDb } from '../client'
import { migrationUrl } from '../migration-url'
import { signInCode, SignInCodeError } from '../sign-in-code'

const usage = 'Usage: pnpm db:totp --email <email>'

const { values } = parseArgs({ options: { email: { type: 'string' } } })

if (!values.email) {
  console.error(usage)
  process.exit(1)
}

const db = migrationDb(migrationUrl())

try {
  const { code, secondsLeft } = await signInCode(db, values.email)
  console.log(`${code} (for ${secondsLeft} more seconds)`)
} catch (error) {
  if (!(error instanceof SignInCodeError)) throw error
  console.error(`${error.code}: ${error.message}`)
  process.exitCode = 1
} finally {
  await db.$client.end()
}
