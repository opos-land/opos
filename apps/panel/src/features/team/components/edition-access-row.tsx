import { Trans, useLingui } from '@lingui/react/macro'
import { type Edition, type EditionMember, type Member } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Button, ErrorMessage, TableCell, TableHead, TableRow } from '../../../shared/ui'
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
      // Website content has no screen yet (PRODUCT.md 5); its value stays as it is.
      body: { ...levels, websiteContentAccess: row?.websiteContentAccess ?? 'none' },
    }),
  )

  return (
    <TableRow>
      <TableHead scope="row">
        <span className="block font-medium">
          {name} {isSelf && <span className="text-muted-foreground text-sm">({t`you`})</span>}
        </span>
        <span className="text-muted-foreground block text-xs">{member.account.email}</span>
        {member.expired && (
          <strong className="text-destructive text-xs">
            <Trans>access expired</Trans>
          </strong>
        )}
      </TableHead>
      <TableCell>
        <LevelSelect
          aria-label={t`Programme of ${name}`}
          disabled={!editable}
          {...form.register('programAccess')}
        />
      </TableCell>
      <TableCell>
        <LevelSelect
          aria-label={t`Tickets of ${name}`}
          disabled={!editable}
          {...form.register('ticketsAccess')}
        />
      </TableCell>
      <TableCell>
        <form onSubmit={(event) => void submit(event)} className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!editable || save.isPending}>
            <Trans>Save</Trans>
          </Button>
          {row && editable && (
            <Button
              disabled={remove.isPending}
              variant="destructive"

              onClick={() => remove.mutate({ params })}
            >
              <Trans>Remove access</Trans>
            </Button>
          )}
        </form>
        <ErrorMessage error={save.error ?? remove.error} />
      </TableCell>
    </TableRow>
  )
}
