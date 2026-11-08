import { readStorage, removeStorage, writeStorage } from '../../../shared/lib/storage'

/**
 * The invitation the panel is accepting, kept in localStorage so it survives the
 * confirmation link opening in another tab of the same browser.
 */
export const INVITATION_STORAGE_KEY = 'opos-panel-invitation'

export interface StoredInvitation {
  token: string
}

export function storedInvitation(): StoredInvitation | null {
  const raw = readStorage(INVITATION_STORAGE_KEY)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<StoredInvitation>
    if (typeof value.token !== 'string' || !value.token) return null
    return { token: value.token }
  } catch {
    return null
  }
}

/** Keeps the token from the link, replacing any other one. */
export function rememberInvitation(token: string): StoredInvitation {
  const invitation = { token }
  writeStorage(INVITATION_STORAGE_KEY, JSON.stringify(invitation))
  return invitation
}

export function forgetInvitation() {
  removeStorage(INVITATION_STORAGE_KEY)
}

/** Codes after which the stored invitation can never be accepted, by this account or any other. */
const FINAL_CODES = new Set([
  'invitation.invalid',
  'invitation.expired',
  'invitation.used',
  'invitation.revoked',
  'invitation.already-member',
])

/**
 * Whether an error of the preview or of the acceptance ends the invitation. An email mismatch does
 * not: the invitee can still sign in with the invited address.
 */
export const endsInvitation = (code: string | undefined) =>
  code !== undefined && FINAL_CODES.has(code)
