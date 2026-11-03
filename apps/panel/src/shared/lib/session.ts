import { accountClient } from './api'
import { isSessionInvalid } from './errors'
import {
  announceAccountChange,
  clearSession,
  onSessionEnded,
  type SessionState,
  sessionChannel,
  signedIn,
  signedOut,
  useSession,
} from './session-store'

export { announceAccountChange, signedIn, signedOut, useSession }
export type { SessionState }

/**
 * Asks who is signed in and shows the answer. `announce` tells the other tabs which account was
 * found (a Google return is a page load, PLAN.md 7.4); a tab following an announcement does not.
 * A `401` that stands is a session that is over only when a request of this tab ended it; one the
 * refresh could not settle is `unavailable`.
 */
async function load(announce: boolean) {
  let ended = false
  const stop = onSessionEnded(() => (ended = true))
  useSession.setState({ status: 'loading' })
  try {
    const shown = useSession.getState().account?.id
    const account = await accountClient.me.get()
    useSession.setState({ status: 'ready', account })
    if (announce && account.id !== shown) announceAccountChange(account.id)
  } catch (error) {
    if (isSessionInvalid(error) && ended) clearSession()
    else useSession.setState({ status: 'unavailable' })
  } finally {
    stop()
  }
}

/**
 * Application start (PLAN.md 8): `GET /me`, with the API link's one refresh on a `401`. It ends
 * `ready`, with the account or without one, or `unavailable` when the answer could not be had; a
 * failed refresh does not sign anyone out. Calling it again retries. An account it finds is
 * announced to the other tabs; finding none is not.
 */
export function startSession() {
  followOtherTabs()
  return load(true)
}

let following = false

/** Follows the account changes the other tabs announce (PLAN.md 7.4). */
function followOtherTabs() {
  const channel = sessionChannel()
  if (following || !channel) return
  following = true
  channel.addEventListener('message', (event: MessageEvent<unknown>) => {
    void applyAnnouncement(event.data)
  })
}

async function applyAnnouncement(message: unknown) {
  if (typeof message !== 'object' || message === null || !('accountId' in message)) return
  const { accountId } = message
  if (accountId === null) return clearSession()
  if (typeof accountId !== 'string' || accountId === useSession.getState().account?.id) return
  // The old account's data goes at once, not when the new account's answer arrives.
  useSession.setState({ status: 'loading', account: null })
  await load(false)
}
