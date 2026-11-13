import { createBrowserRouter, Outlet } from 'react-router'
import { AccountLocale, AdminFrame, AdminGate, AdminNavigation } from '../features/access'
import { TwoFactorResetPage } from '../features/accounts'
import { LoginPage, MfaGate, MfaPage, RequireSession } from '../features/auth'
import { ConventionPage, ConventionsPage, NewConventionPage } from '../features/conventions'
import { LogPage } from '../features/log'
import { AccountTheme } from '../features/theme'
import { useSession } from '../shared/lib/session'
import { NotFoundView } from '../shared/ui'

/**
 * The screens behind sign-in. The frame, with its sign-out, is there for every signed-in account;
 * the navigation and the screens only for an admin, whom AdminGate lets through.
 */
function SignedIn() {
  return (
    <RequireSession>
      <AccountLocale />
      <AdminFrame>
        <AdminGate>
          <AdminNavigation />
          <Outlet />
        </AdminGate>
      </AdminFrame>
    </RequireSession>
  )
}

/**
 * Every screen, with `MfaGate` leading the sign-in page of a pending session to `/auth/mfa`, in
 * the signed-in account's theme on any page.
 */
function Root() {
  const account = useSession((state) => state.account)
  return (
    <>
      {account && <AccountTheme />}
      <MfaGate />
      <Outlet />
    </>
  )
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/auth/mfa', element: <MfaPage /> },
      {
        element: <SignedIn />,
        children: [
          { path: '/', element: <ConventionsPage /> },
          { path: '/conventions/new', element: <NewConventionPage /> },
          { path: '/conventions/:conventionId', element: <ConventionPage /> },
          { path: '/two-factor-reset', element: <TwoFactorResetPage /> },
          { path: '/log', element: <LogPage /> },
          { path: '*', element: <NotFoundView /> },
        ],
      },
    ],
  },
])
