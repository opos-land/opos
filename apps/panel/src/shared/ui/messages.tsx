import { Trans, useLingui } from '@lingui/react/macro'
import { type ReactNode } from 'react'
import { describeError } from '../lib/errors'

/** An API or Supabase Auth error, shown by its code through the catalog (PLAN.md 6). */
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

/** The screen a `403` ends on (PLAN.md 8), and a page the member's permissions do not cover. */
export function NoPermissionView() {
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
