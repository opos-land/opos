import { Trans, useLingui } from '@lingui/react/macro'
import { Link, Navigate } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import { Badge, buttonVariants, Card, CardContent, PageHeader } from '../../../shared/ui'
import { tenantAccess, usePermissionStore } from '../model/permissions'

/**
 * The convention picker at `/`: a card per convention opens its edition, and a member
 * who may open the convention settings finds them on the card too. A single membership goes
 * straight into its convention, whatever the role. A convention the admin suspended says so on
 * its card and offers no settings: nothing of it opens but that message.
 */
export function TenantPickerPage() {
  const { t } = useLingui()
  usePageTitle(t`Your conventions`)
  const memberships = usePermissionStore((state) => state.memberships) ?? []
  const only = memberships.length === 1 ? memberships[0] : undefined

  if (only) return <Navigate to={`/${only.tenant.slug}`} replace />

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title={<Trans>Your conventions</Trans>} />
      {memberships.length === 0 ? (
        <p className="text-sm">
          {t`You are not in any convention's team. A convention's organizers can invite you by email.`}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {memberships.map((m) => (
            <li key={m.tenant.id}>
              <Card size="sm">
                <CardContent className="flex flex-wrap items-center gap-3">
                  <Link to={`/${m.tenant.slug}`} className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{m.tenant.name}</span>
                    <span className="text-muted-foreground text-sm">
                      {m.role === 'head' ? <Trans>Head organizer</Trans> : <Trans>Organizer</Trans>}
                    </span>
                  </Link>
                  {m.tenant.suspended && (
                    <Badge variant="destructive">
                      <Trans comment="The state of a convention the admin suspended">
                        Suspended
                      </Trans>
                    </Badge>
                  )}
                  {!m.tenant.suspended && tenantAccess(m).seesConventionSettings && (
                    <Link
                      to={`/${m.tenant.slug}/settings`}
                      className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    >
                      <Trans>Convention settings</Trans>
                    </Link>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
