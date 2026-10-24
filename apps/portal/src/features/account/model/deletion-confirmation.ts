import { readStorage, removeStorage, writeStorage } from '../../../shared/lib/storage'

/**
 * The account that left for Google to confirm its deletion (PLAN.md 9). `/account?confirm=deletion`
 * offers the deletion only to that account, and only once.
 */
export const DELETION_CONFIRMATION_STORAGE_KEY = 'opos-portal-deletion-confirmation'

export function rememberDeletionConfirmation(userId: string) {
  writeStorage(DELETION_CONFIRMATION_STORAGE_KEY, userId)
}

export function forgetDeletionConfirmation() {
  removeStorage(DELETION_CONFIRMATION_STORAGE_KEY)
}

export const startedDeletionConfirmation = () => readStorage(DELETION_CONFIRMATION_STORAGE_KEY)

/**
 * What a return from Google to `/account?confirm=deletion` means for the signed-in account:
 * `confirmed` when this account started the confirmation, `other-account` when Google signed in
 * another one, `none` when no confirmation was started in this browser (a reload, a copied link).
 */
export type GoogleReturn = 'none' | 'confirmed' | 'other-account'

export function googleReturn(started: string | null, userId: string): GoogleReturn {
  if (!started) return 'none'
  return started === userId ? 'confirmed' : 'other-account'
}
