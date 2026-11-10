import { Trans, useLingui } from '@lingui/react/macro'
import { type Member } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import {
  Button,
  ErrorMessage,
  FormField,
  Input,
  NativeSelect,
  NativeSelectOption,
} from '../../../shared/ui'
import { membershipsKey, useCurrentTenant, useTenantTime } from '../../tenants'
import { membersKey, updateMemberOptions } from '../api/members'
import { memberChange, type MemberFormValues } from '../model/member'
import { LevelSelect } from './level-select'
import { SettingsLabel, ShopLabel } from './permission-labels'

/**
 * The membership's role, both levels and expiry; only what changed is sent. Anti-escalation
 * refusals come back with codes of their own.
 */
export function MemberForm({ member, onSaved }: { member: Member; onSaved: () => void }) {
  const { t } = useLingui()
  const { access, api } = useCurrentTenant()
  const time = useTenantTime()
  const queryClient = useQueryClient()

  const current: MemberFormValues = {
    role: member.role,
    settingsAccess: member.settingsAccess,
    shopConfigAccess: member.shopConfigAccess,
    expiresAt: member.expiresAt ? time.toInput(member.expiresAt) : '',
  }
  const form = useForm<MemberFormValues>({ values: current })
  const promoting = useWatch({ control: form.control, name: 'role' }) === 'head'

  const update = useMutation({
    ...updateMemberOptions(api),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: membersKey(api) })
      await queryClient.invalidateQueries({ queryKey: membershipsKey() })
      onSaved()
    },
  })

  const submit = form.handleSubmit((values) => {
    const body = memberChange(current, values, time.fromInput)
    if (!body) return form.setError('expiresAt', { type: 'zone' })
    update.mutate({ params: { membershipId: member.id }, body })
  })

  const zone = time.timeZone
  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label={t`Role`}>
          {(control) => (
            <NativeSelect {...control} {...form.register('role')}>
              <NativeSelectOption value="org">{t`Organizer`}</NativeSelectOption>
              {access.isHead && (
                <NativeSelectOption value="head">{t`Head organizer`}</NativeSelectOption>
              )}
            </NativeSelect>
          )}
        </FormField>
        <FormField label={<SettingsLabel />}>
          {(control) => (
            <LevelSelect {...control} {...form.register('settingsAccess')} disabled={promoting} />
          )}
        </FormField>
        <FormField label={<ShopLabel />}>
          {(control) => (
            <LevelSelect {...control} {...form.register('shopConfigAccess')} disabled={promoting} />
          )}
        </FormField>
        <FormField
          label={t`Access until`}
          hint={t`Empty for no end date. In the convention's time zone, ${zone}.`}
          error={form.formState.errors.expiresAt && t`Enter a valid date and time.`}
        >
          {(control) => (
            <Input
              {...control}
              {...form.register('expiresAt')}
              type="datetime-local"
              disabled={promoting}
            />
          )}
        </FormField>
      </div>
      {promoting && member.role === 'org' && (
        <p className="text-muted-foreground text-sm">
          {t`A head organizer has every permission in every edition and never expires; the member's own permissions and expiry are cleared.`}
        </p>
      )}
      <ErrorMessage error={update.error} />
      <div>
        <Button disabled={update.isPending} type="submit">
          <Trans>Save</Trans>
        </Button>
      </div>
    </form>
  )
}
