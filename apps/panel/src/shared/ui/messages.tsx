import { Trans, useLingui } from '@lingui/react/macro'
import { type ReactNode } from 'react'
import { errorMessage } from '@opos/i18n/errors'
import { describeError } from '../lib/errors'
import { useScreenTitle } from '../lib/page-title'
import { Alert, AlertTitle } from './alert'
import { Button } from './button'

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
    <div className="text-muted-foreground p-8 text-sm" role="status" aria-busy="true">
      <Trans>Loading…</Trans>
    </div>
  )
}

/** Shown when the account could not be asked for: nobody is signed out meanwhile. */
export function UnavailableView({ onRetry }: { onRetry: () => void }) {
  const { i18n } = useLingui()
  return (
    <section className="flex max-w-xl flex-col items-start gap-3 p-8">
      <p role="alert" className="text-sm">
        {i18n._(errorMessage('server.unavailable'))}
      </p>
      <Button variant="outline" onClick={onRetry}>
        <Trans>Try again</Trans>
      </Button>
    </section>
  )
}

/** The screen a `403` ends on, and a page the member's permissions do not cover. */
export function NoPermissionView() {
  const { t } = useLingui()
  useScreenTitle(t`No permissions`)
  return (
    <section className="flex max-w-xl flex-col gap-2 p-8">
      <h1 className="text-xl font-semibold">
        <Trans>No permissions</Trans>
      </h1>
      <p className="text-muted-foreground text-sm">
        <Trans>
          You do not have permission to see this page. If you need access, ask a head organizer of
          the convention.
        </Trans>
      </p>
    </section>
  )
}

/**
 * All a suspended convention shows its organizers: the admin took it off the platform, and
 * nothing of it opens until it is restored.
 */
export function SuspendedView() {
  const { t, i18n } = useLingui()
  useScreenTitle(t`This convention is suspended`)
  return (
    <section className="flex max-w-xl flex-col gap-2 p-8">
      <h1 className="text-xl font-semibold">
        <Trans>This convention is suspended</Trans>
      </h1>
      <p className="text-muted-foreground text-sm">{i18n._(errorMessage('tenant.suspended'))}</p>
    </section>
  )
}

export function NotFoundView() {
  const { t } = useLingui()
  useScreenTitle(t`Page not found`)
  return (
    <section className="flex max-w-xl flex-col gap-2 p-8">
      <h1 className="text-xl font-semibold">
        <Trans>Page not found</Trans>
      </h1>
      <p className="text-muted-foreground text-sm">
        <Trans>We could not find what you are looking for.</Trans>
      </p>
    </section>
  )
}
