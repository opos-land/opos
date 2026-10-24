import { readStorage, removeStorage, writeStorage } from '../../../shared/lib/storage'

/**
 * The invitation the panel is accepting (PLAN.md 7.7), kept in localStorage so it survives the
 * confirmation link opening in another tab of the same browser.
 */
export const INVITATION_STORAGE_KEY = 'opos-panel-invitation'

export interface StoredInvitation {
  token: string
  /** Set by an email sign-up or a password link: the account still has to choose its password. */
  awaitingPassword: boolean
}

export function storedInvitation(): StoredInvitation | null {
  const raw = readStorage(INVITATION_STORAGE_KEY)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<StoredInvitation>
    if (typeof value.token !== 'string' || !value.token) return null
    return { token: value.token, awaitingPassword: value.awaitingPassword === true }
  } catch {
    return null
  }
}

const store = (invitation: StoredInvitation) =>
  writeStorage(INVITATION_STORAGE_KEY, JSON.stringify(invitation))

/** Keeps the token from the link; the same token keeps its state, another one starts over. */
export function rememberInvitation(token: string): StoredInvitation {
  const current = storedInvitation()
  const invitation = current?.token === token ? current : { token, awaitingPassword: false }
  store(invitation)
  return invitation
}

export function setAwaitingPassword(awaitingPassword: boolean) {
  const current = storedInvitation()
  if (current) store({ ...current, awaitingPassword })
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

/**
 * The password an email sign-up is created with (PLAN.md 7.7, step 3): random, never shown and
 * never stored. The invitee chooses the real one once the address is confirmed.
 */
export function throwawayPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
}
