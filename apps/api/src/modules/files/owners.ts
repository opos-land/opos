import { type FileOwner } from './kinds'

const MB = 1024 * 1024

/**
 * The owners of files, the one list everything that differs between them hangs on: the name their
 * keys start with, the bytes they may hold and where their rows are
 * (docs/specs/0012-file-storage.md, D1 and K7). An edition's files count against its convention's
 * limit and lie under its keys.
 */
export const OWNERS = {
  account: { prefix: 'accounts', limit: 50 * MB, inTenant: false },
  convention: { prefix: 'tenants', limit: 5 * 1024 * MB, inTenant: true },
  edition: { prefix: 'tenants', limit: 5 * 1024 * MB, inTenant: true },
} as const satisfies Record<FileOwner, { prefix: string; limit: number; inTenant: boolean }>

/** The prefixes the bucket holds files under. */
export const PREFIXES = [...new Set(Object.values(OWNERS).map((owner) => owner.prefix))]

/**
 * Where a file's objects lie: the kind of its owner, the owner, the file, then the object's own
 * name. The owner comes from the context, never from a request.
 */
export const fileKey = (owner: FileOwner, ownerId: string, fileId: string) =>
  `${OWNERS[owner].prefix}/${ownerId}/${fileId}/`

/** The parts of an object's key, or null for a key the storage did not name. */
export function parseKey(key: string) {
  const match = /^([a-z]+)\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/([a-z0-9-]+)$/.exec(key)
  if (!match || !PREFIXES.includes(match[1] as (typeof PREFIXES)[number])) return null
  return { prefix: match[1]!, ownerId: match[2]!, fileId: match[3]!, object: match[4]! }
}

/**
 * The key of the transaction-level advisory lock that holds an owner's limit while a file is kept:
 * the leading bits of the owner's id in [2^61, 2^62), apart from a tenant's write lock and from
 * Supabase Auth's keys.
 */
export function fileLimitLockKey(ownerId: string): string {
  const leading = BigInt(`0x${ownerId.replace(/-/g, '').slice(0, 16)}`)
  return ((leading >> 3n) | (1n << 61n)).toString()
}
