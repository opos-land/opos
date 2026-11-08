import { Trans, useLingui } from '@lingui/react/macro'
import { errorMessage } from '@opos/i18n/errors'
import { type ReactNode } from 'react'
import { Link } from 'react-router'
import { describeError } from '../lib/errors'
import { useScreenTitle } from '../lib/page-title'
import { Alert, AlertTitle } from './alert'
import { Button } from './button'
import { linkClass } from './page'

/** An API error, shown by its code through the catalog. */
export function ErrorMessage({ error }: { error: unknown }) {
  const { i18n } = useLingui()
  if (!error) return null
  const { message, values } = describeError(error)
  return (
    <Alert variant="destructive">
      <AlertTitle>{i18n._({ ...message, values })}</AlertTitle>
    </Alert>
  )
}

/** The result of an action that succeeded, announced politely. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <Alert role="status">
      <AlertTitle>{children}</AlertTitle>
    </Alert>
  )
}

export function LoadingView() {
  return (
    <div className="text-muted-foreground px-4 py-8 text-sm" role="status" aria-busy="true">
      <Trans>Loading…</Trans>
    </div>
  )
}

/**
 * Shown by a page that needs the account when it could not be asked for: nobody is
 * signed out meanwhile.
 */
export function UnavailableView({ onRetry }: { onRetry: () => void }) {
  const { i18n } = useLingui()
  return (
    <section className="flex flex-col items-start gap-3 py-8">
      <p role="alert" className="text-sm">
        {i18n._(errorMessage('server.unavailable'))}
      </p>
      <Button variant="outline" onClick={onRetry}>
        <Trans>Try again</Trans>
      </Button>
    </section>
  )
}

/** Unknown paths, and anything the portal cannot find. */
export function NotFoundView() {
  const { t } = useLingui()
  useScreenTitle(t`Page not found`)
  return (
    <section className="flex flex-col gap-3 py-8">
      <h1 className="text-2xl font-semibold">
        <Trans>Page not found</Trans>
      </h1>
      <p className="text-muted-foreground">
        <Trans>We could not find what you are looking for.</Trans>
      </p>
      <Link to="/" className={linkClass}>
        <Trans>Go to the home page</Trans>
      </Link>
    </section>
  )
}
