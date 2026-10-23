import { type Level, type TenantMembership } from '../als/tenant-context.service'

// The permission model of PRODUCT.md 5, implemented as PLAN.md 7.3 describes.

const rank: Record<Level, number> = { none: 0, read: 1, write: 2 }

export const tenantResources = {
  settings: 'settingsAccess',
  branding: 'brandingAccess',
  shop: 'shopConfigAccess',
} as const

export const editionResources = {
  program: 'programAccess',
  websiteContent: 'websiteContentAccess',
  tickets: 'ticketsAccess',
} as const

export type TenantResource = keyof typeof tenantResources
export type EditionResource = keyof typeof editionResources

export type EditionAccess = Record<(typeof editionResources)[EditionResource], Level>

export type Requirement =
  | { kind: 'tenant'; resource?: undefined; level?: undefined }
  | { kind: 'tenant'; resource: TenantResource; level: Level }
  | { kind: 'edition'; resource: EditionResource; level: Level; param: string }

export type Decision = 'allow' | 'forbidden'

/** A membership at all, or a tenant-level permission of at least `level`; a head passes. */
export function decideTenant(
  membership: TenantMembership | null,
  resource?: TenantResource,
  level: Level = 'read',
): Decision {
  if (!membership) return 'forbidden'
  if (membership.role === 'head' || !resource) return 'allow'
  return rank[membership[tenantResources[resource]]] >= rank[level] ? 'allow' : 'forbidden'
}

/** An edition-level permission of at least `level` in an edition of the tenant; a head passes. */
export function decideEdition(
  membership: TenantMembership | null,
  editionAccess: EditionAccess | null,
  resource: EditionResource,
  level: Level,
): Decision {
  if (!membership) return 'forbidden'
  if (membership.role === 'head') return 'allow'
  if (!editionAccess) return 'forbidden'
  return rank[editionAccess[editionResources[resource]]] >= rank[level] ? 'allow' : 'forbidden'
}
