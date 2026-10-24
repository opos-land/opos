import { Trans, useLingui } from '@lingui/react/macro'
import { type ReactNode } from 'react'
import { Link } from 'react-router'
import { describeError } from '../lib/errors'
import { linkClass } from './page'

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
    <div className="text-muted px-4 py-8 text-sm" role="status" aria-busy="true">
      <Trans>Loading…</Trans>
    </div>
  )
}

/** Unknown paths, and anything the portal cannot find (PLAN.md 9). */
export function NotFoundView() {
  return (
    <section className="flex flex-col gap-3 py-8">
      <h1 className="text-2xl font-semibold">
        <Trans>Page not found</Trans>
      </h1>
      <p className="text-muted">
        <Trans>We could not find what you are looking for.</Trans>
      </p>
      <Link to="/" className={linkClass}>
        <Trans>Go to the home page</Trans>
      </Link>
    </section>
  )
}
