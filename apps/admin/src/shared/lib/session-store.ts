import { type Account } from '@opos/contract'
import { create } from 'zustand'

export interface SessionState {
  /**
   * `loading` until `GET /me` has answered; `unavailable` when it could not be asked, so the admin application
   * offers to try again and signs nobody out; `mfa-required` for a session below `aal2` on an
   * account with two-factor authentication, which is not signed in until the code screen is done.
   */
  status: 'loading' | 'ready' | 'unavailable' | 'mfa-required'
  /** The signed-in account; known only from the API's answers. */
  account: Account | null
}

export const useSession = create<SessionState>(() => ({ status: 'loading', account: null }))

/** What the other tabs of the admin application are told on an account change. */
export const SESSION_CHANNEL = 'opos-admin-session'

let channel: BroadcastChannel | null | undefined

/** The one channel of this tab, or null where there is no BroadcastChannel. */
export function sessionChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SESSION_CHANNEL)
  }
  return channel
}

/** Tells the other tabs which account this tab now shows, `null` for none. */
export function announceAccountChange(accountId: string | null) {
  sessionChannel()?.postMessage({ accountId })
}

/** This tab signed in: the account is known, and the other tabs are told. */
export function signedIn(account: Account) {
  useSession.setState({ status: 'ready', account })
  announceAccountChange(account.id)
}

/** This tab no longer shows an account; nothing is announced (the other tabs settle on their own). */
export function clearSession() {
  useSession.setState({ status: 'ready', account: null })
}

/**
 * The session waits for its code and shows no account. Where an account was shown, the other tabs
 * are told to drop it: the cookies now belong to whoever is signing in. A page load
 * that lands here, as a Google return does, holds no account yet and passes `always`.
 */
export function mfaRequired(always = false) {
  const hadAccount = useSession.getState().account !== null
  useSession.setState({ status: 'mfa-required', account: null })
  if (hadAccount || always) announceAccountChange(null)
}

/** The API could not be asked who is signed in; the screen offers to try again. */
export function sessionUnavailable() {
  useSession.setState({ status: 'unavailable', account: null })
}

const endListeners = new Set<() => void>()

/** Calls `listener` whenever a request of this tab ends the session; returns the way to stop. */
export function onSessionEnded(listener: () => void) {
  endListeners.add(listener)
  return () => void endListeners.delete(listener)
}

/**
 * The session is over, ended by a request of this tab; the other tabs are told only when there was
 * an account to lose.
 */
export function signedOut() {
  const hadAccount = useSession.getState().account !== null
  clearSession()
  for (const listener of endListeners) listener()
  if (hadAccount) announceAccountChange(null)
}
