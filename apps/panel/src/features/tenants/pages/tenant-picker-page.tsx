import { Trans, useLingui } from '@lingui/react/macro'
import { Link, Navigate } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import { PageHeader } from '../../../shared/ui'
import { PanelHeader } from '../components/panel-header'
import { tenantAccess, usePermissionStore } from '../model/permissions'

/**
 * The convention picker at `/` (PLAN.md 8): a card per convention opens its edition, and a member
 * who may open the convention settings finds them on the card too. A single membership goes
 * straight into its convention, whatever the role.
 */
export function TenantPickerPage() {
  const { t } = useLingui()
  usePageTitle(t`Your conventions`)
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
              <li
                key={m.tenant.id}
                className="rounded-box border-line bg-surface hover:border-ink flex flex-wrap items-center gap-3 border p-4"
              >
                <Link to={`/${m.tenant.slug}`} className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{m.tenant.name}</span>
                  <span className="text-muted text-sm">
                    {m.role === 'head' ? <Trans>Head organizer</Trans> : <Trans>Organizer</Trans>}
                  </span>
                </Link>
                {tenantAccess(m).seesConventionSettings && (
                  <Link
                    to={`/${m.tenant.slug}/settings`}
                    className="rounded-box border-line hover:border-ink border px-3 py-1 text-sm"
                  >
                    <Trans>Convention settings</Trans>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
