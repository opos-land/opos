import { type ReactNode } from 'react'
import { Card, CardContent, Page } from '../../../shared/ui'

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
      <Card>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
    </Page>
  )
}
