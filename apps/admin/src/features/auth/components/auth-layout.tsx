import { Trans } from '@lingui/react/macro'
import { type ReactNode } from 'react'
import { Card, CardContent } from '../../../shared/ui'
import { ThemeToggle } from '../../theme'

/** The frame of the screens before sign-in: the admin application's name, the theme toggle and one column of content. */
export function AuthLayout({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
          <Trans>OPOS administration</Trans>
        </p>
        <ThemeToggle />
      </div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <Card>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
    </main>
  )
}
