import { AuthClient } from '@supabase/auth-js'
import { env } from '../config/env'

/**
 * The portal's Supabase Auth client (PLAN.md 7.4): PKCE, the session in this origin's localStorage
 * under a key of its own, never shared with the panel, refreshed automatically. `/auth/callback`
 * and `/reset-password` exchange the code themselves, so the client never reads the URL.
 */
export const auth = new AuthClient({
  url: env.VITE_AUTH_URL,
  storageKey: 'opos-portal-auth',
  flowType: 'pkce',
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: false,
})
