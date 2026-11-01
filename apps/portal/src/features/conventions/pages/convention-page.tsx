import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { isNotFound } from '../../../shared/lib/errors'
import {
  ErrorMessage,
  linkClass,
  LoadingView,
  NotFoundView,
  Page,
  Section,
} from '../../../shared/ui'
import {
  activeEditionOptions,
  conventionOptions,
  editionsOptions,
  programItemsOptions,
} from '../api/conventions'
import { ProgramList } from '../components/program-list'
import { useConventionTime } from '../hooks/use-convention-time'

/** A convention's page (PLAN.md 9): the active edition's programme and the other editions. */
export function ConventionPage() {
  const { tenantSlug = '' } = useParams()
  const convention = useQuery(conventionOptions(tenantSlug))
  const active = useQuery(activeEditionOptions(tenantSlug))
  const editions = useQuery(editionsOptions(tenantSlug))
  const items = useQuery({
    ...programItemsOptions(tenantSlug, active.data?.slug ?? ''),
    enabled: Boolean(active.data),
  })
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

  const { name, timezone } = convention.data
  const others = editions.data?.filter((edition) => !edition.isActive) ?? []
  return (
    <Page title={name}>
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
        <Section title={active.data.name}>
          <p className="text-muted text-sm">
            {time.dates(active.data.startsAt, active.data.endsAt)}
          </p>
          {items.isPending ? (
            <LoadingView />
          ) : items.isError ? (
            <ErrorMessage error={items.error} />
          ) : (
            <ProgramList
              items={items.data}
              timeZone={timezone}
              editionPath={`${base}/${active.data.slug}`}
            />
          )}
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
                <span className="text-muted text-sm">
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
