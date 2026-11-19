import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

// A value sealed with a key the API alone holds, such as the credentials of a convention's payment
// provider account (docs/specs/0002-shop-setup.md): AES-256-GCM, so a sealed value that was
// changed, or sealed with another key, does not open. The seed seals the demo account's with the
// same key, which is why this sits beside the schema.

const VERSION = 'v1'

/** The 32 bytes that seal, derived from a secret of the environment of at least 32 characters. */
export function sealingKey(secret: string): Buffer {
  if (secret.length < 32) throw new Error('The sealing secret has at least 32 characters')
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), 'opos sealed value v1', 32))
}

/** Seals a text: its version, a fresh nonce, the sealed bytes and their tag, as text. */
export function seal(key: Buffer, text: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const sealed = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return [VERSION, iv, sealed, cipher.getAuthTag()]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.')
}

/** Opens a sealed text; one changed since, or sealed with another key, throws. */
export function open(key: Buffer, value: string): string {
  const [version, iv, sealed, tag, ...rest] = value.split('.')
  try {
    if (version !== VERSION || !iv || !sealed || !tag || rest.length > 0) throw new Error('shape')
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(sealed, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new Error('The sealed value could not be opened')
  }
}
