import { msg } from '@lingui/core/macro'
import { Trans } from '@lingui/react/macro'
import { type AdminProfile, type ModeratedProfile } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../../shared/ui'
import { adminKey, restoreProfileOptions } from '../api/profiles'

/**
 * Restoring a profile taken down: its account may publish it again, and nothing becomes public by
 * the restoring alone. A takedown on this same screen reverses it, so it asks nothing
 * (docs/specs/0016-public-profile.md, T9 and T13).
 */
export function RestoreProfile({ profile }: { profile: AdminProfile }) {
  const queryClient = useQueryClient()
  const restore = useMutation({
    ...restoreProfileOptions(),
    meta: {
      success: ({ emailSent }: ModeratedProfile) =>
        emailSent === false
          ? msg`The profile is restored, but the email to the account could not be sent. Tell the person yourself.`
          : emailSent
            ? msg`The profile is restored, and the account got an email that says so.`
            : msg`The profile was not taken down.`,
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKey() }),
  })

  return (
    <Button
      disabled={restore.isPending}
      onClick={() => restore.mutate({ params: { accountId: profile.accountId } })}
    >
      <Trans>Restore the profile</Trans>
    </Button>
  )
}
