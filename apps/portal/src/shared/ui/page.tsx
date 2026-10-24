import { type ReactNode, useId } from 'react'

export const linkClass = 'text-accent underline underline-offset-2'

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
        {lead && <p className="text-muted">{lead}</p>}
      </header>
      {children}
    </section>
  )
}

/** A titled block of a page, on its own surface. */
export function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-box border-line bg-surface flex flex-col gap-4 border p-4"
    >
      <h2 id={headingId} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}
