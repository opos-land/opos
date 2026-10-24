import { AuthClient } from '@supabase/auth-js'
import { env } from '../config/env'

/**
 * The panel's Supabase Auth client (PLAN.md 7.4): PKCE, the session in this origin's localStorage
 * under a key of its own, refreshed automatically. `/auth/callback` exchanges the code itself, so
 * the client never reads the URL.
 */
export const auth = new AuthClient({
  url: env.VITE_AUTH_URL,
  storageKey: 'opos-panel-auth',
  flowType: 'pkce',
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: false,
})
