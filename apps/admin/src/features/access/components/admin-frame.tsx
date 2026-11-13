import { Trans, useLingui } from '@lingui/react/macro'
import { type ReactNode, useState } from 'react'
import { NavLink } from 'react-router'
import { useSession } from '../../../shared/lib/session'
import { Button, ErrorMessage } from '../../../shared/ui'
import { cn } from '../../../shared/lib/utils'
import { signOut } from '../../auth'
import { ThemeToggle } from '../../theme'

/**
 * The frame of every screen behind sign-in: the application's name, the signed-in account, the
 * theme toggle and the sign-out, which an account with no access needs as much as an admin.
 */
export function AdminFrame({ children }: { children: ReactNode }) {
  const account = useSession((state) => state.account)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const leave = async () => {
    setError(null)
    setLeaving(true)
    const failure = await signOut()
    setLeaving(false)
    if (failure) setError(failure)
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b py-4">
        <p className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
          <Trans>OPOS administration</Trans>
        </p>
        <div className="flex items-center gap-2">
          {account && <span className="text-muted-foreground text-sm">{account.email}</span>}
          <ThemeToggle />
          <Button variant="outline" disabled={leaving} onClick={() => void leave()}>
            <Trans>Sign out</Trans>
          </Button>
        </div>
      </header>
      <ErrorMessage error={error} />
      {children}
    </div>
  )
}

/** The screens of an admin, shown only behind AdminGate. */
export function AdminNavigation() {
  const { t } = useLingui()
  const links = [{ to: '/', label: t`Conventions`, end: true }]

  return (
    <nav aria-label={t`Administration`} className="flex flex-wrap gap-1 border-b py-2">
      {links.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'rounded-md px-3 py-1.5 text-sm font-medium',
              isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
            )
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
