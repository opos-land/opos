import { createBrowserRouter, Outlet } from 'react-router'
import { AccountLocale } from '../features/account'
import {
  ConfirmPage,
  InvitationPage,
  LoginPage,
  MfaGate,
  MfaPage,
  RequireSession,
} from '../features/auth'
import { EditionPage, EditionsPage } from '../features/editions'
import { ProgramItemPage, ProgramPage } from '../features/program'
import { EditionAccessPage, TeamPage } from '../features/team'
import {
  DashboardPage,
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
              { index: true, element: <DashboardPage /> },
              { path: 'editions', element: <EditionsPage /> },
              { path: 'editions/:editionSlug', element: <EditionPage /> },
              { path: 'editions/:editionSlug/access', element: <EditionAccessPage /> },
              { path: 'editions/:editionSlug/program', element: <ProgramPage /> },
              {
                path: 'editions/:editionSlug/program/:programItemId',
                element: <ProgramItemPage />,
              },
              { path: 'team', element: <TeamPage /> },
              { path: 'settings', element: <SettingsPage /> },
              { path: '*', element: <NotFoundView /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundView /> },
    ],
  },
])
