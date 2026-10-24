import { createBrowserRouter, Outlet } from 'react-router'
import { AccountLocale } from '../features/account'
import { AuthCallbackPage, InvitationPage, LoginPage, RequireSession } from '../features/auth'
import { EditionPage, EditionsPage } from '../features/editions'
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

// The fixed top-level paths are reserved tenant slugs (PLAN.md 8), so /:tenantSlug never
// shadows them.
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
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
          { path: 'team', element: <TeamPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: '*', element: <NotFoundView /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundView /> },
])
