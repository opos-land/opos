import { type InviteMember } from '@opos/contract'
import { type InvitationGrant } from './anti-escalation'
import { type InvitationClaims } from './invitation-token'

/**
 * What an invitation request grants, with the defaults of an omitted field: an `org` with every
 * permission `none` and no expiry. A head holds every permission already, so a head invitation
 * carries no levels, no expiry and no edition rows.
 */
export function grantOf(body: InviteMember): InvitationGrant {
  if (body.role === 'head') {
    return {
      role: 'head',
      settingsAccess: 'none',
      brandingAccess: 'none',
      shopConfigAccess: 'none',
      expiresAt: null,
      editions: [],
    }
  }
  return {
    role: 'org',
    settingsAccess: body.settingsAccess ?? 'none',
    brandingAccess: body.brandingAccess ?? 'none',
    shopConfigAccess: body.shopConfigAccess ?? 'none',
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    editions: body.editions ?? [],
  }
}

/** The claims of the token that carries `grant` to `email` (PLAN.md 7.7). */
export const claimsOf = (
  tenantId: string,
  email: string,
  { role, settingsAccess, brandingAccess, shopConfigAccess, expiresAt, editions }: InvitationGrant,
): InvitationClaims => ({
  tenantId,
  email,
  role,
  tenantPermissions: { settingsAccess, brandingAccess, shopConfigAccess },
  editionPermissions: editions,
  expiresAt: expiresAt?.toISOString() ?? null,
})

/** The grant a verified token carries, the reverse of claimsOf. */
export const grantFromClaims = ({
  role,
  tenantPermissions,
  editionPermissions,
  expiresAt,
}: InvitationClaims): InvitationGrant => ({
  role,
  ...tenantPermissions,
  expiresAt: expiresAt ? new Date(expiresAt) : null,
  editions: editionPermissions,
})
