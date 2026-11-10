import { Fragment } from 'react'
import { usePageTrail } from '../lib/page-title'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './breadcrumb'

/** Where the page stands, as its tab title names it: what it belongs to, then the page itself. */
export function PageBreadcrumb() {
  const trail = usePageTrail()
  if (trail.length === 0) return null

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {trail.slice(0, -1).map((part, index) => (
          <Fragment key={`${index}:${part}`}>
            <BreadcrumbItem className="hidden md:block">{part}</BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
          </Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>{trail.at(-1)}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
