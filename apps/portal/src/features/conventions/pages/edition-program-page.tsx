import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { isNotFound } from '../../../shared/lib/errors'
import { usePageTitle } from '../../../shared/lib/page-title'
import { ErrorMessage, linkClass, LoadingView, NotFoundView, Page } from '../../../shared/ui'
import { conventionOptions, editionOptions, programItemsOptions } from '../api/conventions'
import { ProgramList } from '../components/program-list'

/** The programme of one published edition, past or coming, day by day. */
export function EditionProgramPage() {
  const { t } = useLingui()
  const { tenantSlug = '', editionSlug = '' } = useParams()
  const convention = useQuery(conventionOptions(tenantSlug))
  const edition = useQuery(editionOptions(tenantSlug, editionSlug))
  usePageTitle(t`Programme`, edition.data?.name ?? convention.data?.name)
  const items = useQuery({
    ...programItemsOptions(tenantSlug, editionSlug),
    enabled: Boolean(edition.data),
  })
  const editionPath = `/conventions/${tenantSlug}/${editionSlug}`

  if (convention.isError || edition.isError) {
    const failed = convention.error ?? edition.error
    return isNotFound(failed) ? <NotFoundView /> : <ErrorMessage error={failed} />
  }
  if (convention.isPending || edition.isPending) return <LoadingView />

  const editionName = edition.data.name
  return (
    <Page title={<Trans>Programme</Trans>} lead={editionName}>
      <p>
        <Link to={editionPath} className={linkClass}>
          <Trans>Back to {editionName}</Trans>
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
          editionPath={editionPath}
        />
      )}
    </Page>
  )
}
