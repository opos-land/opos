import { Trans, useLingui } from '@lingui/react/macro'
import { type Member } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Button, ErrorMessage, Field, inputClass } from '../../../shared/ui'
import { atLeast, membershipsKey, useCurrentTenant, useTenantTime } from '../../tenants'
import { memberChange, type MemberFormValues, memberName } from '../model/member'
import { LevelSelect } from './level-select'
import { SettingsLabel, ShopLabel } from './permission-labels'

function LevelText({ level }: { level: Member['settingsAccess'] }) {
  if (level === 'write') return <Trans>Write</Trans>
  if (level === 'read') return <Trans>Read</Trans>
  return <Trans>No access</Trans>
}

/**
 * One member of the team: what the membership holds and, for a member with `settings=write`, the
 * editor and removal. Anti-escalation refusals come back with codes of their own (PLAN.md 5.3).
 */
export function MemberRow({ member, isSelf }: { member: Member; isSelf: boolean }) {
  const { t } = useLingui()
  const { access, api } = useCurrentTenant()
  const time = useTenantTime()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const current: MemberFormValues = {
    role: member.role,
    settingsAccess: member.settingsAccess,
    shopConfigAccess: member.shopConfigAccess,
    expiresAt: member.expiresAt ? time.toInput(member.expiresAt) : '',
  }
  const form = useForm<MemberFormValues>({ values: current })
  const promoting = useWatch({ control: form.control, name: 'role' }) === 'head'

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: api.tenants.members.key() })
    await queryClient.invalidateQueries({ queryKey: membershipsKey() })
  }
  const update = useMutation({
    ...api.tenants.members.update.mutationOptions(),
    onSuccess: async () => {
      setEditing(false)
      await refresh()
    },
  })
  const remove = useMutation({
    ...api.tenants.members.remove.mutationOptions(),
    onSuccess: refresh,
  })

  const params = { membershipId: member.id }
  const submit = form.handleSubmit((values) => {
    const body = memberChange(current, values, time.fromInput)
    if (!body) return form.setError('expiresAt', { type: 'zone' })
    update.mutate({ params, body })
  })

  // Only a head edits a head; nobody edits their own membership (PRODUCT.md 5.6).
  const manageable =
    atLeast(access.settings, 'write') && !isSelf && (member.role === 'org' || access.isHead)
  const name = memberName(member)
  const zone = time.timeZone

  return (
    <li className="border-line flex flex-col gap-3 border-t py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col">
          <span className="font-medium">
            {name} {isSelf && <span className="text-muted text-sm">({t`you`})</span>}
          </span>
          <span className="text-muted text-sm">{member.account.email}</span>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-3 text-sm">
          <dt className="text-muted">
            <Trans>Role</Trans>
          </dt>
          <dd>
            {member.role === 'head' ? <Trans>Head organizer</Trans> : <Trans>Organizer</Trans>}
          </dd>
          {member.role === 'org' && (
            <>
              <dt className="text-muted">
                <SettingsLabel />
              </dt>
              <dd>
                <LevelText level={member.settingsAccess} />
              </dd>
              <dt className="text-muted">
                <ShopLabel />
              </dt>
              <dd>
                <LevelText level={member.shopConfigAccess} />
              </dd>
              <dt className="text-muted">
                <Trans>Access until</Trans>
              </dt>
              <dd>
                {member.expiresAt ? time.format(member.expiresAt) : <Trans>No end date</Trans>}
                {member.expired && (
                  <strong className="text-danger ml-2">
                    <Trans>expired</Trans>
                  </strong>
                )}
              </dd>
            </>
          )}
        </dl>
      </div>
      {manageable && !editing && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Trans>Edit</Trans>
          </Button>
          {confirmRemove ? (
            <>
              <Button
                variant="danger"
                pending={remove.isPending}
                onClick={() => remove.mutate({ params })}
              >
                <Trans>Yes, remove {name} from the team</Trans>
              </Button>
              <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
                <Trans>Cancel</Trans>
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmRemove(true)}>
              <Trans>Remove from the team</Trans>
            </Button>
          )}
        </div>
      )}
      <ErrorMessage error={remove.error} />
      {editing && (
        <form
          onSubmit={(event) => void submit(event)}
          noValidate
          className="rounded-box bg-paper flex flex-col gap-4 p-4"
        >
          <div className="grid gap-4 md:grid-cols-4">
            <Field label={t`Role`}>
              {(control) => (
                <select {...control} {...form.register('role')} className={inputClass}>
                  <option value="org">{t`Organizer`}</option>
                  {access.isHead && <option value="head">{t`Head organizer`}</option>}
                </select>
              )}
            </Field>
            <Field label={<SettingsLabel />}>
              {(control) => (
                <LevelSelect
                  {...control}
                  {...form.register('settingsAccess')}
                  disabled={promoting}
                />
              )}
            </Field>
            <Field label={<ShopLabel />}>
              {(control) => (
                <LevelSelect
                  {...control}
                  {...form.register('shopConfigAccess')}
                  disabled={promoting}
                />
              )}
            </Field>
            <Field
              label={t`Access until`}
              hint={t`Empty for no end date. In the convention's time zone, ${zone}.`}
              error={form.formState.errors.expiresAt && t`Enter a valid date and time.`}
            >
              {(control) => (
                <input
                  {...control}
                  {...form.register('expiresAt')}
                  type="datetime-local"
                  disabled={promoting}
                  className={inputClass}
                />
              )}
            </Field>
          </div>
          {promoting && member.role === 'org' && (
            <p className="text-muted text-sm">
              {t`A head organizer has every permission in every edition and never expires; the member's own permissions and expiry are cleared.`}
            </p>
          )}
          <ErrorMessage error={update.error} />
          <div className="flex gap-2">
            <Button type="submit" pending={update.isPending}>
              <Trans>Save</Trans>
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                form.reset(current)
                update.reset()
                setEditing(false)
              }}
            >
              <Trans>Cancel</Trans>
            </Button>
          </div>
        </form>
      )}
    </li>
  )
}
