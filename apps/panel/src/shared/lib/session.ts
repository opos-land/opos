import { type Session } from '@supabase/auth-js'
import { create } from 'zustand'
import { auth } from './auth'

interface SessionState {
  /** `loading` until getSession() has resolved; the panel shows a loading view until then. */
  status: 'loading' | 'ready'
  session: Session | null
}

export const useSession = create<SessionState>(() => ({ status: 'loading', session: null }))

/** Restores the stored session, refreshed when it has expired, and follows every later change. */
export async function startSession() {
  auth.onAuthStateChange((_event, session) => {
    useSession.setState({ session })
  })
  const { data } = await auth.getSession()
  useSession.setState({ status: 'ready', session: data.session })
}
