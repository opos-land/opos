import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ErrorMessage, LoadingView, PageHeader, Section } from '../../../shared/ui'
import { useCurrentTenant } from '../components/tenant-context'
import { useTenantTime } from '../hooks/use-tenant-time'
import { atLeast } from '../model/permissions'

export function DashboardPage() {
  const { tenant, access, api } = useCurrentTenant()
  const time = useTenantTime()
  const editions = useQuery(api.editions.list.queryOptions())
  const visible = editions.data?.filter((e) => access.seesEdition(e.id)) ?? []
  const active = visible.find((e) => e.isActive)
  const base = `/${tenant.slug}`

  return (
    <>
      <PageHeader
        title={tenant.name}
        description={
          access.isHead ? (
            <Trans>You are a head organizer.</Trans>
          ) : (
            <Trans>You are an organizer.</Trans>
          )
        }
      />
      <Section title={<Trans>Active edition</Trans>}>
        {editions.isPending ? (
          <LoadingView />
        ) : editions.isError ? (
          <ErrorMessage error={editions.error} />
        ) : active ? (
          <div className="flex flex-col gap-1 text-sm">
            <Link
              to={`${base}/editions/${active.slug}`}
              className="text-accent font-medium underline"
            >
              {active.name}
            </Link>
            <span className="text-muted">{time.range(active.startsAt, active.endsAt)}</span>
            <span>
              {active.isPublished ? <Trans>Published</Trans> : <Trans>Not published</Trans>}
            </span>
          </div>
        ) : (
          <p className="text-sm">
            <Trans>No edition is active.</Trans>{' '}
            <Link to={`${base}/editions`} className="text-accent underline">
              <Trans>See the editions</Trans>
            </Link>
          </p>
        )}
      </Section>
      {atLeast(access.settings, 'read') && (
        <Section title={<Trans>Convention</Trans>}>
          <ul className="flex flex-col gap-1 text-sm">
            <li>
              <Link to={`${base}/team`} className="text-accent underline">
                <Trans>Team</Trans>
              </Link>
            </li>
            <li>
              <Link to={`${base}/settings`} className="text-accent underline">
                <Trans>Settings</Trans>
              </Link>
            </li>
          </ul>
        </Section>
      )}
    </>
  )
}
