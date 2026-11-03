import { readStorage, removeStorage, writeStorage } from '../../../shared/lib/storage'
import { safeRedirect } from './redirect'

/**
 * The page a round trip by email started on (PLAN.md 9): set before sending a link, read by
 * `/auth/confirm`. Kept in localStorage, since an email link opens in another tab.
 */
export const AUTH_RETURN_STORAGE_KEY = 'opos-portal-auth-return'

export function rememberAuthReturn(path: string) {
  writeStorage(AUTH_RETURN_STORAGE_KEY, safeRedirect(path))
}

export function forgetAuthReturn() {
  removeStorage(AUTH_RETURN_STORAGE_KEY)
}

/** Where `/auth/confirm` goes once the password is saved: the page the round trip started on, or the account. */
export const authReturn = (): string => safeRedirect(readStorage(AUTH_RETURN_STORAGE_KEY))
