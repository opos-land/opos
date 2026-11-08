import { type ReactNode, useId } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './card'

export const linkClass = 'text-primary underline underline-offset-4'

/** One screen of the portal: its heading, an optional lead and the content in one column. */
export function Page({
  title,
  lead,
  children,
}: {
  title: ReactNode
  lead?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-6 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {lead && <p className="text-muted-foreground">{lead}</p>}
      </header>
      {children}
    </section>
  )
}

/** A titled block of a page, on its own surface. */
export function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id={headingId}>{title}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
    </section>
  )
}
