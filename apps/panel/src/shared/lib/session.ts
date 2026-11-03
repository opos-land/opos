import { accountClient } from './api'
import { isSessionInvalid } from './errors'
import {
  announceAccountChange,
  type SessionState,
  sessionChannel,
  signedIn,
  signedOut,
  useSession,
} from './session-store'

export { announceAccountChange, signedIn, signedOut, useSession }
export type { SessionState }

/** Asks the API who is signed in: the account, or null for a session that is over. */
async function loadAccount() {
  try {
    return await accountClient.me.get()
  } catch (error) {
    // A 401 that stands is a session that is over; one the refresh could not settle is not.
    if (isSessionInvalid(error) && useSession.getState().status === 'ready') return null
    throw error
  }
}

/**
 * Application start (PLAN.md 8): `GET /me`, with the API link's one refresh on a `401`. It ends
 * `ready`, with the account or without one, or `unavailable` when the answer could not be had; a
 * failed refresh does not sign anyone out. Calling it again retries.
 */
export async function startSession() {
  followOtherTabs()
  useSession.setState({ status: 'loading' })
  try {
    const account = await loadAccount()
    useSession.setState({ status: 'ready', account })
  } catch {
    useSession.setState({ status: 'unavailable' })
  }
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
  if (accountId === null) return signedOut()
  if (typeof accountId !== 'string' || accountId === useSession.getState().account?.id) return
  try {
    useSession.setState({ status: 'ready', account: await accountClient.me.get() })
  } catch {
    // The next request settles who is signed in; until then the screen keeps what it shows.
  }
}
