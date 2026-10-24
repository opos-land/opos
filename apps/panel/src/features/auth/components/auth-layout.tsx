import { Trans } from '@lingui/react/macro'
import { type ReactNode } from 'react'

/** The frame of the screens before sign-in: the panel's name and one column of content. */
export function AuthLayout({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <p className="text-muted text-sm font-semibold tracking-wide uppercase">
        <Trans>OPOS panel</Trans>
      </p>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="rounded-box border-line bg-surface flex flex-col gap-4 border p-6">
        {children}
      </div>
    </main>
  )
}
