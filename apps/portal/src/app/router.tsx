import { createBrowserRouter } from 'react-router'
import { AccountPage } from '../features/account'
import {
  AuthCallbackPage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  RequireSession,
  ResetPasswordPage,
} from '../features/auth'
import { ConventionPage, EditionPage, ProgramItemPage } from '../features/conventions'
import { LandingPage, PrivacyPage } from '../features/landing'
import { NotFoundView } from '../shared/ui'
import { Layout } from './layout'

// Routes only mount a view from a feature (PLAN.md 3.2).
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/privacy', element: <PrivacyPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/auth/callback', element: <AuthCallbackPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      {
        path: '/account',
        element: (
          <RequireSession>
            <AccountPage />
          </RequireSession>
        ),
      },
      { path: '/conventions/:tenantSlug', element: <ConventionPage /> },
      { path: '/conventions/:tenantSlug/:editionSlug', element: <EditionPage /> },
      {
        path: '/conventions/:tenantSlug/:editionSlug/program/:programItemId',
        element: <ProgramItemPage />,
      },
      { path: '*', element: <NotFoundView /> },
    ],
  },
])
