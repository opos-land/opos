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
import {
  ConventionPage,
  EditionPage,
  EditionProgramPage,
  ProgramItemPage,
} from '../features/conventions'
import { LandingPage, PrivacyPage, TermsPage } from '../features/landing'
import { MyProfilePage, ProfilePage, ReportProfilePage } from '../features/profile'
import { SchedulePage } from '../features/schedule'
import { CheckoutPage, OrderLinkPage, ResultPage, ShopPage } from '../features/shop'
import { NotFoundView } from '../shared/ui'
import { Layout } from './layout'

// Routes only mount a view from a feature.
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/privacy', element: <PrivacyPage /> },
      { path: '/terms', element: <TermsPage /> },
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
        path: '/account/profile',
        element: (
          <RequireSession>
            <MyProfilePage />
          </RequireSession>
        ),
      },
      { path: '/profiles/:profileId', element: <ProfilePage /> },
      { path: '/profiles/:profileId/report', element: <ReportProfilePage /> },
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
      { path: '/conventions/:tenantSlug/:editionSlug/program', element: <EditionProgramPage /> },
      {
        path: '/conventions/:tenantSlug/:editionSlug/program/:programItemId',
        element: <ProgramItemPage />,
      },
      { path: '/conventions/:tenantSlug/:editionSlug/shop', element: <ShopPage /> },
      { path: '/conventions/:tenantSlug/:editionSlug/shop/checkout', element: <CheckoutPage /> },
      {
        path: '/conventions/:tenantSlug/:editionSlug/shop/result/:orderId',
        element: <ResultPage />,
      },
      // An order opened by the link from its email: the token comes after the `#`.
      { path: '/order', element: <OrderLinkPage /> },
      { path: '*', element: <NotFoundView /> },
    ],
  },
])
