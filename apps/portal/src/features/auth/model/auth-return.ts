import { readStorage, removeStorage, writeStorage } from '../../../shared/lib/storage'
import { safeRedirect } from './redirect'

/**
 * The page a round trip through Supabase Auth started on (PLAN.md 7.5, 9): set before leaving for
 * Google or sending a confirmation link, read by `/auth/callback`. Kept in localStorage, since an
 * email link opens in another tab.
 */
export const AUTH_RETURN_STORAGE_KEY = 'opos-portal-auth-return'

export function rememberAuthReturn(path: string) {
  writeStorage(AUTH_RETURN_STORAGE_KEY, safeRedirect(path))
}

export function forgetAuthReturn() {
  removeStorage(AUTH_RETURN_STORAGE_KEY)
}

/** Where `/auth/callback` goes once it has a session: the page the round trip started on. */
export const authReturn = (): string => safeRedirect(readStorage(AUTH_RETURN_STORAGE_KEY))
