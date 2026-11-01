import { react } from '@opos/eslint-config/react'

export default react(import.meta.dirname, {
  // The auth-js client until sign-in moves to the API (AGENTS.md); nothing joins this list.
  legacyAuth: [
    'src/app/providers.test.tsx',
    'src/features/auth/components/choose-password-form.test.tsx',
    'src/features/auth/components/require-session.test.tsx',
    'src/features/auth/pages/auth-callback-page.test.tsx',
    'src/features/auth/pages/auth-callback-page.tsx',
    'src/shared/lib/auth.ts',
    'src/shared/lib/errors.test.ts',
    'src/shared/lib/errors.ts',
    'src/shared/lib/session.ts',
  ],
})
