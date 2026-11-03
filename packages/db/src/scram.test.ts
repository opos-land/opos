import { createHash, createHmac, pbkdf2Sync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { scramVerifier } from './scram'

/** Reads a verifier the way a server does: the salted password must reproduce both keys. */
function parse(verifier: string) {
  const match = /^SCRAM-SHA-256\$(\d+):([^$]+)\$([^:]+):(.+)$/.exec(verifier)
  if (!match) throw new Error('not a SCRAM-SHA-256 verifier')
  return {
    iterations: Number(match[1]),
    salt: match[2]!,
    storedKey: match[3]!,
    serverKey: match[4]!,
  }
}

describe('scramVerifier', () => {
  it('is a SCRAM-SHA-256 verifier from which the password is recomputed', () => {
    const parsed = parse(scramVerifier('s3cret'))
    const salted = pbkdf2Sync(
      's3cret',
      Buffer.from(parsed.salt, 'base64'),
      parsed.iterations,
      32,
      'sha256',
    )
    const clientKey = createHmac('sha256', salted).update('Client Key').digest()

    expect(parsed.iterations).toBe(4096)
    expect(createHash('sha256').update(clientKey).digest('base64')).toBe(parsed.storedKey)
    expect(createHmac('sha256', salted).update('Server Key').digest('base64')).toBe(
      parsed.serverKey,
    )
  })

  it('does not hold the password', () => {
    expect(scramVerifier('s3cretvalue')).not.toContain('s3cretvalue')
  })

  it('takes a fresh salt each time', () => {
    expect(scramVerifier('same')).not.toBe(scramVerifier('same'))
  })

  it('takes the salt it is given', () => {
    const salt = Buffer.alloc(16, 7)
    expect(scramVerifier('same', salt)).toBe(scramVerifier('same', salt))
    expect(parse(scramVerifier('same', salt)).salt).toBe(salt.toString('base64'))
  })
})
