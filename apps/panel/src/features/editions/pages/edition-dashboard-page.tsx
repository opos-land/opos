import { Trans, useLingui } from '@lingui/react/macro'
import { useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  ErrorMessage,
  LoadingView,
  NoPermissionView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { useCurrentTenant, useTenantTime } from '../../tenants'
import { EditionStatus } from '../components/edition-status'
import { useEditionBySlug } from '../hooks/use-editions'

/** The edition's dashboard: its dates, and whether it is active and shown in the portal. */
export function EditionDashboardPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant } = useCurrentTenant()
  const time = useTenantTime()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(edition?.name ?? tenant.name)

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition) return <NoPermissionView />

  return (
    <>
      <PageHeader
        title={edition.name}
        description={time.range(edition.startsAt, edition.endsAt)}
        actions={<EditionStatus edition={edition} />}
      />
      <Section title={<Trans>Status</Trans>}>
        <div className="flex flex-col gap-2 text-sm">
          <p>
            {edition.isActive
              ? t`This is the convention's active edition.`
              : t`This edition is not the convention's active one.`}
          </p>
          <p>
            {edition.isPublished ? (
              <Trans>The edition is published: the portal shows it to everyone.</Trans>
            ) : (
              <Trans>The edition is not published: the portal does not show it.</Trans>
            )}
          </p>
        </div>
      </Section>
    </>
  )
}
