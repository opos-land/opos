import { createBrowserRouter } from 'react-router'
import { AccountPage } from '../features/account'
import {
  ConfirmPage,
  ForgotPasswordPage,
  LoginPage,
  MfaPage,
  RegisterPage,
  RequireSession,
} from '../features/auth'
import { ConventionPage, EditionPage, ProgramItemPage } from '../features/conventions'
import { LandingPage, PrivacyPage } from '../features/landing'
import { SchedulePage } from '../features/schedule'
import { NotFoundView } from '../shared/ui'
import { Layout } from './layout'

// Routes only mount a view from a feature.
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/privacy', element: <PrivacyPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/auth/confirm', element: <ConfirmPage /> },
      { path: '/auth/mfa', element: <MfaPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      {
        path: '/account',
        element: (
          <RequireSession>
            <AccountPage />
          </RequireSession>
        ),
      },
      {
        path: '/schedule',
        element: (
          <RequireSession>
            <SchedulePage />
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
