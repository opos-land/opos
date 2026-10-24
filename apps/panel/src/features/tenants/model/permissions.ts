import { type Membership } from '@opos/contract'
import { create } from 'zustand'

export type Level = 'none' | 'read' | 'write'

const rank: Record<Level, number> = { none: 0, read: 1, write: 2 }

/** A level passes a requirement with that level or a higher one (PLAN.md 7.3). */
export const atLeast = (level: Level, required: Level) => rank[level] >= rank[required]

export interface EditionAccess {
  program: Level
  websiteContent: Level
  tickets: Level
}

const NO_EDITION_ACCESS: EditionAccess = {
  program: 'none',
  websiteContent: 'none',
  tickets: 'none',
}
const HEAD_EDITION_ACCESS: EditionAccess = {
  program: 'write',
  websiteContent: 'write',
  tickets: 'write',
}

/**
 * What the member may do in one tenant, as the UI reads it: hide what is `none`, disable saving at
 * `read`. The API stays the authority; this only keeps the panel from offering what it refuses.
 */
export interface TenantAccess {
  isHead: boolean
  settings: Level
  shop: Level
  edition(editionId: string): EditionAccess
  /** A head and a member who reads the settings see every edition; others only their own. */
  seesEdition(editionId: string): boolean
}

/** The member's access in the tenant of `membership`; a head passes every check, on both levels. */
export function tenantAccess(membership: Membership): TenantAccess {
  const isHead = membership.role === 'head'
  const settings: Level = isHead ? 'write' : membership.settingsAccess
  const shop: Level = isHead ? 'write' : membership.shopConfigAccess

  const edition = (editionId: string): EditionAccess => {
    if (isHead) return HEAD_EDITION_ACCESS
    const row = membership.editions.find((e) => e.editionId === editionId)
    return row
      ? {
          program: row.programAccess,
          websiteContent: row.websiteContentAccess,
          tickets: row.ticketsAccess,
        }
      : NO_EDITION_ACCESS
  }

  return {
    isHead,
    settings,
    shop,
    edition,
    seesEdition: (editionId) =>
      atLeast(settings, 'read') ||
      ((e) => [e.program, e.websiteContent, e.tickets])(edition(editionId)).some((level) =>
        atLeast(level, 'read'),
      ),
  }
}

interface PermissionState {
  /** `null` until GET /me/memberships has answered after sign-in. */
  memberships: Membership[] | null
}

/** The permission store (PLAN.md 8), filled from GET /me/memberships after sign-in. */
export const usePermissionStore = create<PermissionState>(() => ({ memberships: null }))

export const setMemberships = (memberships: Membership[] | null) =>
  usePermissionStore.setState({ memberships })

/** The membership in the tenant with `slug`; undefined when the account is not in its team. */
export const membershipFor = (memberships: Membership[] | null, slug: string | undefined) =>
  memberships?.find((m) => m.tenant.slug === slug)
