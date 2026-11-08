import { Trans } from '@lingui/react/macro'
import { Navigate } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import { ErrorMessage, LoadingView, PageHeader } from '../../../shared/ui'
import { useCurrentTenant } from '../../tenants'
import { useEditions } from '../hooks/use-editions'
import { defaultEdition } from '../model/default-edition'

/**
 * Entering a convention opens the member's edition. With no edition to open, the
 * convention settings open on their editions, or the member learns there is nothing for them yet.
 */
export function ConventionEntryPage() {
  const { tenant, access } = useCurrentTenant()
  usePageTitle(tenant.name)
  const editions = useEditions()

  if (editions.isPending) return <LoadingView />
  if (editions.isError) return <ErrorMessage error={editions.error} />

  const edition = defaultEdition(editions.data ?? [])
  if (edition) return <Navigate to={`/${tenant.slug}/editions/${edition.slug}`} replace />
  if (access.seesConventionSettings) {
    return <Navigate to={`/${tenant.slug}/settings/editions`} replace />
  }

  return (
    <>
      <PageHeader title={tenant.name} />
      <p className="max-w-xl text-sm">
        <Trans>
          You have no access to any edition of this convention yet. A head organizer can give it to
          you.
        </Trans>
      </p>
    </>
  )
}
