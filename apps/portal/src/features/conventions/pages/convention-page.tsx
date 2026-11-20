import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { isNotFound } from '../../../shared/lib/errors'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  ErrorMessage,
  linkClass,
  LoadingView,
  NotFoundView,
  Page,
  Section,
} from '../../../shared/ui'
import { MyOrders } from '../../shop'
import { activeEditionOptions, conventionOptions, editionsOptions } from '../api/conventions'
import { ConventionLogo } from '../components/convention-logo'
import { EditionSummary } from '../components/edition-summary'
import { useConventionTime } from '../hooks/use-convention-time'
import { otherEditions } from '../model/edition-order'

/**
 * A convention's page: its name and logo, for a signed-in account its orders in the convention,
 * its active edition as that edition's own page shows it, and its other published editions, the
 * coming ones first.
 */
export function ConventionPage() {
  const { tenantSlug = '' } = useParams()
  const convention = useQuery(conventionOptions(tenantSlug))
  usePageTitle(convention.data?.name)
  const active = useQuery(activeEditionOptions(tenantSlug))
  const editions = useQuery(editionsOptions(tenantSlug))
  const time = useConventionTime(convention.data?.timezone ?? 'UTC')
  const base = `/conventions/${tenantSlug}`

  if (convention.isPending) return <LoadingView />
  if (convention.isError) {
    return isNotFound(convention.error) ? (
      <NotFoundView />
    ) : (
      <ErrorMessage error={convention.error} />
    )
  }

  const { name, timezone, logo } = convention.data
  const others = otherEditions(editions.data ?? [])
  return (
    <Page
      title={
        <span className="flex items-center gap-3">
          <ConventionLogo tenantSlug={tenantSlug} logo={logo} variant="large" />
          {name}
        </span>
      }
    >
      <MyOrders tenantSlug={tenantSlug} timeZone={timezone} />
      {active.isPending ? (
        <LoadingView />
      ) : active.isError ? (
        isNotFound(active.error) ? (
          <p>
            <Trans>No edition of this convention is active.</Trans>
          </p>
        ) : (
          <ErrorMessage error={active.error} />
        )
      ) : (
        <Section
          title={
            <Link to={`${base}/${active.data.slug}`} className={linkClass}>
              {active.data.name}
            </Link>
          }
        >
          <EditionSummary
            edition={active.data}
            timeZone={timezone}
            editionPath={`${base}/${active.data.slug}`}
          />
        </Section>
      )}
      {editions.isError && !isNotFound(editions.error) && <ErrorMessage error={editions.error} />}
      {others.length > 0 && (
        <Section title={<Trans>Other editions</Trans>}>
          <ul className="flex flex-col gap-3">
            {others.map((edition) => (
              <li key={edition.id} className="flex flex-col gap-1">
                <Link to={`${base}/${edition.slug}`} className={linkClass}>
                  {edition.name}
                </Link>
                <span className="text-muted-foreground text-sm">
                  {time.dates(edition.startsAt, edition.endsAt)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Page>
  )
}
