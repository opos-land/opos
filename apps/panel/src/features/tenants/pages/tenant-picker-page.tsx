import { Trans, useLingui } from '@lingui/react/macro'
import { Link, Navigate } from 'react-router'
import { PageHeader } from '../../../shared/ui'
import { PanelHeader } from '../components/panel-header'
import { usePermissionStore } from '../model/permissions'

/** The convention picker at `/`; a single membership goes straight to its convention. */
export function TenantPickerPage() {
  const { t } = useLingui()
  const memberships = usePermissionStore((state) => state.memberships) ?? []
  const only = memberships.length === 1 ? memberships[0] : undefined

  if (only) return <Navigate to={`/${only.tenant.slug}`} replace />

  return (
    <div className="flex min-h-screen flex-col">
      <PanelHeader />
      <main className="mx-auto w-full max-w-3xl p-4 md:p-8">
        <PageHeader title={<Trans>Your conventions</Trans>} />
        {memberships.length === 0 ? (
          <p className="text-sm">
            {t`You are not in any convention's team. A convention's organizers can invite you by email.`}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {memberships.map((m) => (
              <li key={m.tenant.id}>
                <Link
                  to={`/${m.tenant.slug}`}
                  className="rounded-box border-line bg-surface hover:border-ink block border p-4"
                >
                  <span className="font-medium">{m.tenant.name}</span>
                  <span className="text-muted block text-sm">
                    {m.role === 'head' ? <Trans>Head organizer</Trans> : <Trans>Organizer</Trans>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
