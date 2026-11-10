import { Trans } from '@lingui/react/macro'
import { type Member } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, ErrorMessage } from '../../../shared/ui'
import { membershipsKey, useCurrentTenant } from '../../tenants'
import { membersKey, removeMemberOptions } from '../api/members'
import { memberName } from '../model/member'

/** Removal from the team, asked twice; the last head's removal is refused by the API. */
export function RemoveMember({ member, onRemoved }: { member: Member; onRemoved: () => void }) {
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const remove = useMutation({
    ...removeMemberOptions(api),
    // Leaves the page first: the refreshed team no longer holds the member it shows.
    onSuccess: async () => {
      onRemoved()
      await queryClient.invalidateQueries({ queryKey: membersKey(api) })
      await queryClient.invalidateQueries({ queryKey: membershipsKey() })
    },
  })

  const name = memberName(member)
  return (
    <>
      <p className="text-sm">
        <Trans>
          {name} loses access to the convention at once. Coming back takes a new invitation.
        </Trans>
      </p>
      {confirming ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={remove.isPending}
            variant="destructive"
            onClick={() => remove.mutate({ params: { membershipId: member.id } })}
          >
            <Trans>Yes, remove {name} from the team</Trans>
          </Button>
          <Button variant="outline" onClick={() => setConfirming(false)}>
            <Trans>Cancel</Trans>
          </Button>
        </div>
      ) : (
        <div>
          <Button variant="destructive" onClick={() => setConfirming(true)}>
            <Trans>Remove from the team</Trans>
          </Button>
        </div>
      )}
      <ErrorMessage error={remove.error} />
    </>
  )
}
