import { msg } from '@lingui/core/macro'
import { Trans } from '@lingui/react/macro'
import { type Member } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IrreversibleAction } from '../../../shared/ui'
import { membershipsKey, useCurrentTenant } from '../../tenants'
import { membersKey, removeMemberOptions } from '../api/members'
import { memberName } from '../model/member'

/** Removal from the team, asked first in a modal; the last head's removal is refused by the API. */
export function RemoveMember({ member, onRemoved }: { member: Member; onRemoved: () => void }) {
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const name = memberName(member)

  const remove = useMutation({
    ...removeMemberOptions(api),
    meta: { success: msg`Removed from the team: ${name}.` },
    // Leaves the page first: the refreshed team no longer holds the member it shows.
    onSuccess: async () => {
      onRemoved()
      await queryClient.invalidateQueries({ queryKey: membersKey(api) })
      await queryClient.invalidateQueries({ queryKey: membershipsKey() })
    },
  })

  const consequence = (
    <Trans>
      {name} loses access to the convention at once. Coming back takes a new invitation.
    </Trans>
  )
  return (
    <>
      <p className="text-sm">{consequence}</p>
      <div>
        <IrreversibleAction
          label={<Trans>Remove from the team</Trans>}
          title={<Trans>Remove {name} from the team?</Trans>}
          action={<Trans>Remove from the team</Trans>}
          onConfirm={() => remove.mutateAsync({ params: { membershipId: member.id } })}
        >
          {consequence}
        </IrreversibleAction>
      </div>
    </>
  )
}
