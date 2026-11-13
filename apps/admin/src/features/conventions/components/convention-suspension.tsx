import { msg } from '@lingui/core/macro'
import { Trans } from '@lingui/react/macro'
import { type AdminTenant } from '@opos/contract'
import { formatDateTime } from '@opos/i18n'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { activeLocale } from '../../../shared/lib/i18n'
import { Button } from '../../../shared/ui'
import { adminKey, restoreConventionOptions, suspendConventionOptions } from '../api/conventions'

/**
 * Suspending a convention and restoring it. Either is reversed by the other on this same screen,
 * so neither asks first (docs/ARCHITECTURE.md, Frontends); the text says what a suspension turns
 * off before the button is pressed.
 */
export function ConventionSuspension({ convention }: { convention: AdminTenant }) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: adminKey() })
  const suspend = useMutation({
    ...suspendConventionOptions(),
    meta: { success: msg`The convention is suspended.` },
    onSuccess: refresh,
  })
  const restore = useMutation({
    ...restoreConventionOptions(),
    meta: { success: msg`The convention is restored.` },
    onSuccess: refresh,
  })
  const params = { tenantId: convention.id }

  if (convention.suspendedAt) {
    // A tenant's date, in the tenant's time zone (docs/ARCHITECTURE.md, Localization).
    const since = formatDateTime(
      new Date(convention.suspendedAt),
      activeLocale(),
      convention.timezone,
    )
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm">
          <Trans>
            Suspended since {since}. Its page is not found, and its organizers see only that it is
            suspended. Restoring it brings everything back as it was.
          </Trans>
        </p>
        <Button disabled={restore.isPending} onClick={() => restore.mutate({ params })}>
          <Trans>Restore the convention</Trans>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-sm">
        <Trans>
          A suspended convention is off for everyone but the administrators: its page is not found,
          and its organizers see only that it is suspended. Nothing is removed, no email is sent,
          and you can restore it here.
        </Trans>
      </p>
      <Button
        variant="outline"
        disabled={suspend.isPending}
        onClick={() => suspend.mutate({ params })}
      >
        <Trans>Suspend the convention</Trans>
      </Button>
    </div>
  )
}
