import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

// A value sealed with a key the API alone holds, such as the credentials of a convention's payment
// provider account (docs/specs/0002-shop-setup.md): AES-256-GCM, so a sealed value that was
// changed, or sealed with another key, does not open. A value is sealed for what it belongs to,
// and opens for that alone: one copied into another row opens nothing there. The seed seals the
// demo account's with the same key, which is why this sits beside the schema.

const VERSION = 'v1'

/** The 32 bytes that seal, derived from a secret of the environment of at least 32 characters. */
export function sealingKey(secret: string): Buffer {
  if (secret.length < 32) throw new Error('The sealing secret has at least 32 characters')
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), 'opos sealed value v1', 32))
}

/** What the credentials of a tenant's account with a provider are sealed for. */
export const providerAccountOf = (tenantId: string, provider: string) =>
  `payment-provider-account:${tenantId}:${provider}`

/**
 * Seals a text for what it belongs to: its version, a fresh nonce, the sealed bytes and their
 * tag, as text. `owner` is authenticated with it and stored nowhere.
 */
export function seal(key: Buffer, text: string, owner: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(owner, 'utf8'))
  const sealed = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return [VERSION, iv, sealed, cipher.getAuthTag()]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.')
}

/** Opens a sealed text; one changed since, sealed with another key or for another owner, throws. */
export function open(key: Buffer, value: string, owner: string): string {
  const [version, iv, sealed, tag, ...rest] = value.split('.')
  try {
    if (version !== VERSION || !iv || !sealed || !tag || rest.length > 0) throw new Error('shape')
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    decipher.setAAD(Buffer.from(owner, 'utf8'))
    return Buffer.concat([
      decipher.update(Buffer.from(sealed, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new Error('The sealed value could not be opened')
  }
}
