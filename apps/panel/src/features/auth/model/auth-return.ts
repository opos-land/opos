import { readStorage, removeStorage, writeStorage } from '../../../shared/lib/storage'
import { storedInvitation } from './invitation-storage'
import { safeRedirect } from './redirect'

/**
 * The page a round trip through Supabase Auth started on (PLAN.md 7.5, 7.7): set before leaving
 * for Google or sending a link, read by `/auth/callback`. Kept in localStorage, since an email link
 * opens in another tab.
 */
export const AUTH_RETURN_STORAGE_KEY = 'opos-panel-auth-return'

export const INVITATION_PATH = '/invitation'

export function rememberAuthReturn(path: string) {
  writeStorage(AUTH_RETURN_STORAGE_KEY, safeRedirect(path))
}

export function forgetAuthReturn() {
  removeStorage(AUTH_RETURN_STORAGE_KEY)
}

/**
 * Where `/auth/callback` goes once it has a session: the page the round trip started on. Without
 * one, an invitation still waiting for its password link returns to `/invitation`, anything else
 * to the start page.
 */
export function authReturn(): string {
  const stored = readStorage(AUTH_RETURN_STORAGE_KEY)
  if (stored) return safeRedirect(stored)
  return storedInvitation()?.awaitingPassword ? INVITATION_PATH : '/'
}
