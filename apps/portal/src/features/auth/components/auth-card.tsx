import { type ReactNode } from 'react'
import { Page } from '../../../shared/ui'

/** The frame of the screens around sign-in: a heading and one surface of content. */
export function AuthCard({
  title,
  lead,
  children,
}: {
  title: ReactNode
  lead?: ReactNode
  children: ReactNode
}) {
  return (
    <Page title={title} lead={lead}>
      <div className="rounded-box border-line bg-surface flex flex-col gap-4 border p-4">
        {children}
      </div>
    </Page>
  )
}
