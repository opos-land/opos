import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { isNotFound } from '../../../shared/lib/errors'
import { ErrorMessage, linkClass, LoadingView, NotFoundView, Page } from '../../../shared/ui'
import { conventionOptions, editionOptions, programItemsOptions } from '../api/conventions'
import { ProgramList } from '../components/program-list'
import { useConventionTime } from '../hooks/use-convention-time'

/** One published edition's programme, past or active (PLAN.md 9). */
export function EditionPage() {
  const { tenantSlug = '', editionSlug = '' } = useParams()
  const convention = useQuery(conventionOptions(tenantSlug))
  const edition = useQuery(editionOptions(tenantSlug, editionSlug))
  const items = useQuery({
    ...programItemsOptions(tenantSlug, editionSlug),
    enabled: Boolean(edition.data),
  })
  const time = useConventionTime(convention.data?.timezone ?? 'UTC')
  const base = `/conventions/${tenantSlug}`

  if (convention.isError || edition.isError) {
    const failed = convention.error ?? edition.error
    return isNotFound(failed) ? <NotFoundView /> : <ErrorMessage error={failed} />
  }
  if (convention.isPending || edition.isPending) return <LoadingView />

  const conventionName = convention.data.name
  return (
    <Page title={edition.data.name} lead={time.dates(edition.data.startsAt, edition.data.endsAt)}>
      <p>
        <Link to={base} className={linkClass}>
          <Trans>Back to {conventionName}</Trans>
        </Link>
      </p>
      {items.isPending ? (
        <LoadingView />
      ) : items.isError ? (
        <ErrorMessage error={items.error} />
      ) : (
        <ProgramList
          items={items.data}
          timeZone={convention.data.timezone}
          editionPath={`${base}/${editionSlug}`}
        />
      )}
    </Page>
  )
}
