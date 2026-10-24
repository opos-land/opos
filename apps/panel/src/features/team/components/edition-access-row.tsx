import { Trans, useLingui } from '@lingui/react/macro'
import { type Edition, type EditionMember, type Member } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Button, ErrorMessage } from '../../../shared/ui'
import { atLeast, membershipsKey, useCurrentTenant } from '../../tenants'
import {
  editionMembersKey,
  putEditionMemberOptions,
  removeEditionMemberOptions,
} from '../api/members'
import { memberName } from '../model/member'
import { LevelSelect } from './level-select'

interface AccessValues {
  programAccess: EditionMember['programAccess']
  ticketsAccess: EditionMember['ticketsAccess']
}

/** One org's permissions in one edition: set them, or take the edition away. */
export function EditionAccessRow({
  edition,
  member,
  row,
  isSelf,
}: {
  edition: Edition
  member: Member
  row: EditionMember | undefined
  isSelf: boolean
}) {
  const { t } = useLingui()
  const { access, api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const values: AccessValues = {
    programAccess: row?.programAccess ?? 'none',
    ticketsAccess: row?.ticketsAccess ?? 'none',
  }
  const form = useForm<AccessValues>({ values })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: editionMembersKey(api) })
    await queryClient.invalidateQueries({ queryKey: membershipsKey() })
  }
  const save = useMutation({ ...putEditionMemberOptions(api), onSuccess: refresh })
  const remove = useMutation({
    ...removeEditionMemberOptions(api),
    onSuccess: refresh,
  })

  const params = { editionId: edition.id, tenantMembershipId: member.id }
  const editable = atLeast(access.settings, 'write') && !isSelf
  const name = memberName(member)

  const submit = form.handleSubmit((levels) =>
    save.mutate({
      params,
      // Website content has no screen yet (PRODUCT.md 5.3); its value stays as it is.
      body: { ...levels, websiteContentAccess: row?.websiteContentAccess ?? 'none' },
    }),
  )

  return (
    <tr className="border-line border-t align-top">
      <th scope="row" className="py-2 pr-4 text-left font-normal">
        <span className="block font-medium">
          {name} {isSelf && <span className="text-muted text-sm">({t`you`})</span>}
        </span>
        <span className="text-muted block text-xs">{member.account.email}</span>
        {member.expired && (
          <strong className="text-danger text-xs">
            <Trans>access expired</Trans>
          </strong>
        )}
      </th>
      <td className="py-2 pr-4">
        <LevelSelect
          aria-label={t`Programme of ${name}`}
          disabled={!editable}
          {...form.register('programAccess')}
        />
      </td>
      <td className="py-2 pr-4">
        <LevelSelect
          aria-label={t`Tickets of ${name}`}
          disabled={!editable}
          {...form.register('ticketsAccess')}
        />
      </td>
      <td className="py-2">
        <form onSubmit={(event) => void submit(event)} className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!editable} pending={save.isPending}>
            <Trans>Save</Trans>
          </Button>
          {row && editable && (
            <Button
              variant="danger"
              pending={remove.isPending}
              onClick={() => remove.mutate({ params })}
            >
              <Trans>Remove access</Trans>
            </Button>
          )}
        </form>
        <ErrorMessage error={save.error ?? remove.error} />
      </td>
    </tr>
  )
}
