import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { isNotFound } from '../../../shared/lib/errors'
import { usePageTitle } from '../../../shared/lib/page-title'
import { ErrorMessage, linkClass, LoadingView, NotFoundView, Page } from '../../../shared/ui'
import { conventionOptions, editionOptions } from '../api/conventions'
import { ConventionLogo } from '../components/convention-logo'
import { EditionSummary } from '../components/edition-summary'

/**
 * One published edition, past or coming: its convention with the logo, when and where it takes
 * place, and the way on to its programme.
 */
export function EditionPage() {
  const { tenantSlug = '', editionSlug = '' } = useParams()
  const convention = useQuery(conventionOptions(tenantSlug))
  const edition = useQuery(editionOptions(tenantSlug, editionSlug))
  usePageTitle(edition.data?.name ?? convention.data?.name)
  const base = `/conventions/${tenantSlug}`

  if (convention.isError || edition.isError) {
    const failed = convention.error ?? edition.error
    return isNotFound(failed) ? <NotFoundView /> : <ErrorMessage error={failed} />
  }
  if (convention.isPending || edition.isPending) return <LoadingView />

  return (
    <Page title={edition.data.name}>
      <p className="flex items-center gap-3">
        <ConventionLogo tenantSlug={tenantSlug} logo={convention.data.logo} variant="large" />
        <Link to={base} className={linkClass}>
          {convention.data.name}
        </Link>
      </p>
      <EditionSummary
        edition={edition.data}
        timeZone={convention.data.timezone}
        editionPath={`${base}/${editionSlug}`}
      />
    </Page>
  )
}
