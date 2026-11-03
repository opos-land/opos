import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'

const ITERATIONS = 4096

/**
 * The SCRAM-SHA-256 verifier Postgres stores for a password (RFC 5802, RFC 7677). A statement
 * that sets a verifier leaves the password out of the server's log and `pg_stat_statements`;
 * Postgres stores a verifier as it is. The password is not passed through SASLprep, which is
 * the identity for the ASCII passwords the roles use.
 */
export function scramVerifier(password: string, salt: Buffer = randomBytes(16)): string {
  const salted = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256')
  const clientKey = createHmac('sha256', salted).update('Client Key').digest()
  const storedKey = createHash('sha256').update(clientKey).digest('base64')
  const serverKey = createHmac('sha256', salted).update('Server Key').digest('base64')
  return `SCRAM-SHA-256$${ITERATIONS}:${salt.toString('base64')}$${storedKey}:${serverKey}`
}
