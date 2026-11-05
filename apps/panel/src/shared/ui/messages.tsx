import { Trans, useLingui } from '@lingui/react/macro'
import { type ReactNode } from 'react'
import { errorMessage } from '@opos/i18n/errors'
import { describeError } from '../lib/errors'
import { useScreenTitle } from '../lib/page-title'
import { Button } from './button'

/** An API error, shown by its code through the catalog (PLAN.md 6). */
export function ErrorMessage({ error }: { error: unknown }) {
  const { i18n } = useLingui()
  if (!error) return null
  const { message, values } = describeError(error)
  return (
    <p role="alert" className="rounded-box border-danger text-danger border px-3 py-2 text-sm">
      {i18n._({ ...message, values })}
    </p>
  )
}

/** The result of an action that succeeded, announced politely. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-box border-success text-success border px-3 py-2 text-sm">
      {children}
    </p>
  )
}

export function LoadingView() {
  return (
    <div className="text-muted p-8 text-sm" role="status" aria-busy="true">
      <Trans>Loading…</Trans>
    </div>
  )
}

/** Shown when the account could not be asked for (PLAN.md 8): nobody is signed out meanwhile. */
export function UnavailableView({ onRetry }: { onRetry: () => void }) {
  const { i18n } = useLingui()
  return (
    <section className="flex max-w-xl flex-col items-start gap-3 p-8">
      <p role="alert" className="text-sm">
        {i18n._(errorMessage('server.unavailable'))}
      </p>
      <Button variant="secondary" onClick={onRetry}>
        <Trans>Try again</Trans>
      </Button>
    </section>
  )
}

/** The screen a `403` ends on (PLAN.md 8), and a page the member's permissions do not cover. */
export function NoPermissionView() {
  const { t } = useLingui()
  useScreenTitle(t`No permissions`)
  return (
    <section className="flex max-w-xl flex-col gap-2 p-8">
      <h1 className="text-xl font-semibold">
        <Trans>No permissions</Trans>
      </h1>
      <p className="text-muted text-sm">
        <Trans>
          You do not have permission to see this page. If you need access, ask a head organizer of
          the convention.
        </Trans>
      </p>
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
      <p className="text-muted text-sm">
        <Trans>We could not find what you are looking for.</Trans>
      </p>
    </section>
  )
}
