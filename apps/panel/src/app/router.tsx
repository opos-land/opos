import { createBrowserRouter, Outlet } from 'react-router'
import { AccountLocale } from '../features/account'
import {
  ConfirmPage,
  ForgotPasswordPage,
  InvitationPage,
  LoginPage,
  MfaGate,
  MfaPage,
  RequireSession,
} from '../features/auth'
import {
  ConventionEntryPage,
  EditionDashboardPage,
  EditionLayout,
  EditionSettingsPage,
  EditionsPage,
} from '../features/editions'
import { ProgramItemPage, ProgramPage } from '../features/program'
import { EditionAccessPage, TeamPage } from '../features/team'
import {
  AreaFrame,
  ConventionLayout,
  MembershipsGate,
  SettingsPage,
  TenantLayout,
  TenantPickerPage,
} from '../features/tenants'
import { NotFoundView } from '../shared/ui'

/** Pages for a signed-in member, with the permission store filled. */
function SignedIn() {
  return (
    <RequireSession>
      <AccountLocale />
      <MembershipsGate>
        <Outlet />
      </MembershipsGate>
    </RequireSession>
  )
}

/**
 * Every screen, with `MfaGate` leading the sign-in pages of a pending session to `/auth/mfa`
 * (PLAN.md 7.12).
 */
function Root() {
  return (
    <>
      <MfaGate />
      <Outlet />
    </>
  )
}

// The fixed top-level paths are reserved tenant slugs (PLAN.md 8), so /:tenantSlug never
// shadows them.
export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/auth/confirm', element: <ConfirmPage /> },
      { path: '/auth/mfa', element: <MfaPage /> },
      { path: '/invitation', element: <InvitationPage /> },
      {
        element: <SignedIn />,
        children: [
          { path: '/', element: <TenantPickerPage /> },
          {
            path: '/:tenantSlug',
            element: <TenantLayout />,
            children: [
              {
                // Entering the convention opens the member's edition.
                element: <AreaFrame />,
                children: [
                  { index: true, element: <ConventionEntryPage /> },
                  { path: '*', element: <NotFoundView /> },
                ],
              },
              {
                // The convention settings: what belongs to the whole convention.
                path: 'settings',
                element: <ConventionLayout />,
                children: [
                  { index: true, element: <SettingsPage /> },
                  { path: 'editions', element: <EditionsPage /> },
                  { path: 'team', element: <TeamPage /> },
                  { path: '*', element: <NotFoundView /> },
                ],
              },
              {
                // The edition area: everything about one edition, its settings included.
                path: 'editions/:editionSlug',
                element: <EditionLayout />,
                children: [
                  { index: true, element: <EditionDashboardPage /> },
                  { path: 'program', element: <ProgramPage /> },
                  { path: 'program/:programItemId', element: <ProgramItemPage /> },
                  { path: 'access', element: <EditionAccessPage /> },
                  { path: 'settings', element: <EditionSettingsPage /> },
                  { path: '*', element: <NotFoundView /> },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundView /> },
    ],
  },
])
