import { Webhook } from 'standardwebhooks'

const HEADERS = ['webhook-id', 'webhook-timestamp', 'webhook-signature'] as const

/**
 * Verifies a Standard Webhooks request from Supabase Auth and returns its parsed JSON body, or
 * `undefined` when the signature is missing, wrong or older than five minutes. `secret` is in
 * GoTrue's format, `v1,whsec_<base64 key>`.
 */
export function verifyHookSignature(
  secret: string,
  rawBody: Buffer | undefined,
  headers: Record<string, string | string[] | undefined>,
): unknown {
  const signed: Record<string, string> = {}
  for (const name of HEADERS) {
    const value = headers[name]
    if (typeof value !== 'string') return undefined
    signed[name] = value
  }
  if (!rawBody) return undefined
  try {
    return new Webhook(secret.replace(/^v1,/, '')).verify(rawBody, signed)
  } catch {
    return undefined
  }
}
