import { type Member } from '@opos/contract'
import { atLeast, type TenantAccess } from '../../tenants'

/**
 * Whether the panel offers to change or remove the membership: at `settings=write`, never the
 * own one, and a head's only to a head (PRODUCT.md 5.2). The API stays the authority.
 */
export function canManage(
  access: Pick<TenantAccess, 'settings' | 'isHead'>,
  member: Pick<Member, 'role'>,
  isSelf: boolean,
) {
  return atLeast(access.settings, 'write') && !isSelf && (member.role === 'org' || access.isHead)
}

/** The member's name, or the email address when the account has none. */
export function memberName(member: Pick<Member, 'account'>) {
  const name = [member.account.firstName, member.account.lastName].filter(Boolean).join(' ')
  return name || member.account.email
}

export interface MemberFormValues {
  role: 'head' | 'org'
  settingsAccess: Member['settingsAccess']
  shopConfigAccess: Member['shopConfigAccess']
  /** The wall-clock time of the tenant's zone, or '' for no expiry. */
  expiresAt: string
}

export type MemberChange = Partial<{
  role: 'head' | 'org'
  settingsAccess: Member['settingsAccess']
  shopConfigAccess: Member['shopConfigAccess']
  expiresAt: string | null
}>

/**
 * The PATCH body for what the form changed, and nothing else: an unchanged field is never sent.
 * Promoting to head sends the role alone, since a head holds no levels and no expiry. Returns
 * null for an expiry that names no instant.
 */
export function memberChange(
  before: MemberFormValues,
  after: MemberFormValues,
  fromInput: (value: string) => string | null,
): MemberChange | null {
  if (after.role === 'head') return before.role === 'head' ? {} : { role: 'head' }
  const change: MemberChange = {}
  if (after.role !== before.role) change.role = after.role
  if (after.settingsAccess !== before.settingsAccess) change.settingsAccess = after.settingsAccess
  if (after.shopConfigAccess !== before.shopConfigAccess) {
    change.shopConfigAccess = after.shopConfigAccess
  }
  if (after.expiresAt !== before.expiresAt) {
    if (!after.expiresAt) change.expiresAt = null
    else {
      const expiresAt = fromInput(after.expiresAt)
      if (!expiresAt) return null
      change.expiresAt = expiresAt
    }
  }
  return change
}
