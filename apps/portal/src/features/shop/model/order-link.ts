/**
 * The token of an order link (docs/specs/0009-buyer-self-service.md, K1), which comes after the
 * `#` of the portal's address: a browser sends that part to no server, so no access log and no
 * referrer holds it. Null for an address that carries none, or something that is no token.
 */
export const tokenFromHash = (hash: string): string | null => {
  const token = hash.replace(/^#/, '')
  return /^[A-Za-z0-9_-]{20,200}$/.test(token) ? token : null
}
