import { createHash, randomBytes } from 'node:crypto'

/** How many recovery codes `enable` hands out. */
export const RECOVERY_CODE_COUNT = 10

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** 10 random bytes are 80 bits, which base32 writes in exactly 16 characters. */
function base32(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += ALPHABET[(value >>> bits) & 31]
    }
  }
  return out
}

/** Ten new recovery codes, each 16 base32 characters from `crypto.randomBytes`. */
export function newRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => base32(randomBytes(10)))
}

/** A code as it is stored and compared: no spaces or hyphens, upper case. */
export const normalizeRecoveryCode = (typed: string) => typed.replace(/[\s-]/g, '').toUpperCase()

/** The SHA-256 of the code in lowercase hex, which is all the database keeps of it. */
export const hashRecoveryCode = (typed: string) =>
  createHash('sha256').update(normalizeRecoveryCode(typed)).digest('hex')
