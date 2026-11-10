import { createBrowserRouter, Outlet } from 'react-router'
import { AccountLocale, AccountPage } from '../features/account'
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
  NewEditionPage,
} from '../features/editions'
import { ProgramItemPage, ProgramPage } from '../features/program'
import { EditionAccessPage, InvitePage, MemberPage, TeamPage } from '../features/team'
import {
  AreaFrame,
  ConventionLayout,
  MembershipsGate,
  PlatformLayout,
  SettingsPage,
  TenantLayout,
  TenantPickerPage,
} from '../features/tenants'
import { NotFoundView, SidebarProvider, TooltipProvider } from '../shared/ui'

/**
 * Pages for a signed-in member, with the permission store filled. Each frames itself in the
 * sidebar, whose open or collapsed state is held here, across pages and areas.
 */
function SignedIn() {
  return (
    <RequireSession>
      <AccountLocale />
      <MembershipsGate>
        <TooltipProvider>
          <SidebarProvider>
            <Outlet />
          </SidebarProvider>
        </TooltipProvider>
      </MembershipsGate>
    </RequireSession>
  )
}

/**
 * Every screen, with `MfaGate` leading the sign-in pages of a pending session to `/auth/mfa`.
 */
function Root() {
  return (
    <>
      <MfaGate />
      <Outlet />
    </>
  )
}

// The fixed top-level paths are reserved tenant slugs, so /:tenantSlug never
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
          {
            // Above any convention; `account` is a reserved tenant slug.
            element: <PlatformLayout />,
            children: [
              { path: '/', element: <TenantPickerPage /> },
              { path: '/account', element: <AccountPage /> },
            ],
          },
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
                  { path: 'editions/new', element: <NewEditionPage /> },
                  { path: 'team', element: <TeamPage /> },
                  { path: 'team/invite', element: <InvitePage /> },
                  { path: 'team/:membershipId', element: <MemberPage /> },
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
