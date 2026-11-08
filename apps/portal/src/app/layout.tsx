import { Trans } from '@lingui/react/macro'
import { Link, Outlet, useLocation } from 'react-router'
import { AccountLocale } from '../features/account'
import { MFA_PATH, MfaGate, mfaPath, mfaReturnFor } from '../features/auth'
import { PRIVACY_PATH } from '../shared/config/routes'
import { useSession } from '../shared/lib/session'
import { linkClass } from '../shared/ui'

const holdsToken = (search: string) => new URLSearchParams(search).has('token_hash')

/**
 * The frame of every portal screen, laid out for a 360 px phone first: the platform's
 * name, the way to the account or to sign-in, the content in one column and the privacy policy in
 * the footer.
 */
export function Layout() {
  const status = useSession((state) => state.status)
  const account = useSession((state) => state.account)
  const location = useLocation()

  return (
    <div className="flex min-h-screen flex-col">
      {account && <AccountLocale />}
      <MfaGate />
      <header className="border-line bg-surface border-b">
        <nav className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="text-lg font-semibold tracking-wide">
            <Trans>OPOS</Trans>
          </Link>
          {status !== 'loading' &&
            (account ? (
              <div className="flex items-center gap-4">
                <Link to="/schedule" className={linkClass}>
                  <Trans>My schedule</Trans>
                </Link>
                <Link to="/account" className={linkClass}>
                  <Trans>Account</Trans>
                </Link>
              </div>
            ) : status === 'mfa-required' ? (
              // A session that waits for its code is not signed in; the way on is the code screen.
              // On a link's page the token is unspent and its own button leads there.
              location.pathname !== MFA_PATH &&
              !(location.pathname === '/auth/confirm' && holdsToken(location.search)) && (
                <Link to={mfaPath(mfaReturnFor(location))} className={linkClass}>
                  <Trans>Finish signing in</Trans>
                </Link>
              )
            ) : (
              <Link to="/login" className={linkClass}>
                <Trans>Sign in</Trans>
              </Link>
            ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4">
        <Outlet />
      </main>
      <footer className="border-line text-muted border-t">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm">
          <p>
            <Trans>OPOS is free for conventions.</Trans>
          </p>
          <Link to={PRIVACY_PATH} className={linkClass}>
            <Trans>Privacy policy</Trans>
          </Link>
        </div>
      </footer>
    </div>
  )
}
