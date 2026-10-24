import { zodResolver } from '@hookform/resolvers/zod'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { type EditionGrant, type InvitationOutcome, level } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Button, ErrorMessage, Field, inputClass, Notice } from '../../../shared/ui'
import { useEditions } from '../../editions'
import { useCurrentTenant, useTenantTime } from '../../tenants'
import { inviteMemberOptions, membersKey } from '../api/members'
import { memberName } from '../model/member'
import { LevelSelect } from './level-select'
import { ProgramLabel, SettingsLabel, ShopLabel, TicketsLabel } from './permission-labels'

const schema = z.object({
  email: z.email().max(254),
  role: z.enum(['head', 'org']),
  settingsAccess: level,
  shopConfigAccess: level,
  expiresAt: z.string(),
  editions: z.array(
    z.object({
      editionId: z.string(),
      name: z.string(),
      programAccess: level,
      ticketsAccess: level,
    }),
  ),
})

type InviteValues = z.infer<typeof schema>

function Outcome({ outcome }: { outcome: InvitationOutcome }) {
  const time = useTenantTime()
  if (outcome.outcome === 'added') {
    const name = memberName(outcome.member)
    return (
      <Notice>
        <Trans>{name} has joined the team and has been told by email.</Trans>
      </Notice>
    )
  }
  const email = outcome.email
  const validUntil = time.format(outcome.validUntil)
  return (
    <Notice>
      <Trans>
        An invitation has gone to {email}. Its link works once, until {validUntil}.
      </Trans>
    </Notice>
  )
}

/** An invitation by email (PRODUCT.md 5.7): the role, both levels and an optional expiry. */
export function InviteForm() {
  const { t } = useLingui()
  const { access, api } = useCurrentTenant()
  const time = useTenantTime()
  const queryClient = useQueryClient()
  const editions = useEditions()
  const [outcome, setOutcome] = useState<InvitationOutcome | null>(null)

  const blank = (): InviteValues => ({
    email: '',
    role: 'org',
    settingsAccess: 'none',
    shopConfigAccess: 'none',
    expiresAt: '',
    editions: (editions.data ?? []).map((e) => ({
      editionId: e.id,
      name: e.name,
      programAccess: 'none',
      ticketsAccess: 'none',
    })),
  })
  // The edition rows follow the editions query; a field already typed in survives their arrival.
  const form = useForm<InviteValues>({
    resolver: zodResolver(schema),
    values: blank(),
    resetOptions: { keepDirtyValues: true },
  })
  const rows = useFieldArray({ control: form.control, name: 'editions' })
  const isHead = useWatch({ control: form.control, name: 'role' }) === 'head'
  const { errors } = form.formState

  const invite = useMutation({
    ...inviteMemberOptions(api),
    onSuccess: async (result) => {
      setOutcome(result)
      form.reset(blank())
      await queryClient.invalidateQueries({ queryKey: membersKey(api) })
    },
  })

  const submit = form.handleSubmit((values) => {
    setOutcome(null)
    if (values.role === 'head') {
      invite.mutate({ body: { email: values.email, role: 'head' } })
      return
    }
    const expiresAt = values.expiresAt ? time.fromInput(values.expiresAt) : null
    if (values.expiresAt && !expiresAt) return form.setError('expiresAt', { type: 'zone' })
    const grants: EditionGrant[] = values.editions
      .filter((e) => e.programAccess !== 'none' || e.ticketsAccess !== 'none')
      .map((e) => ({
        editionId: e.editionId,
        programAccess: e.programAccess,
        ticketsAccess: e.ticketsAccess,
        websiteContentAccess: 'none',
      }))
    invite.mutate({
      body: {
        email: values.email,
        role: 'org',
        settingsAccess: values.settingsAccess,
        shopConfigAccess: values.shopConfigAccess,
        expiresAt,
        editions: grants,
      },
    })
  })

  const zone = time.timeZone
  const count = rows.fields.length
  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t`Email`} error={errors.email && t`Enter a valid email address.`}>
          {(control) => (
            <input {...control} {...form.register('email')} type="email" className={inputClass} />
          )}
        </Field>
        <Field label={t`Role`}>
          {(control) => (
            <select {...control} {...form.register('role')} className={inputClass}>
              <option value="org">{t`Organizer`}</option>
              {access.isHead && <option value="head">{t`Head organizer`}</option>}
            </select>
          )}
        </Field>
      </div>
      {isHead ? (
        <p className="text-muted text-sm">
          <Trans>A head organizer has every permission, in every edition, and never expires.</Trans>
        </p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={<SettingsLabel />}>
              {(control) => <LevelSelect {...control} {...form.register('settingsAccess')} />}
            </Field>
            <Field label={<ShopLabel />}>
              {(control) => <LevelSelect {...control} {...form.register('shopConfigAccess')} />}
            </Field>
            <Field
              label={t`Access until`}
              hint={t`Optional, in the convention's time zone, ${zone}.`}
              error={errors.expiresAt && t`Enter a date and time in the future.`}
            >
              {(control) => (
                <input
                  {...control}
                  {...form.register('expiresAt')}
                  type="datetime-local"
                  className={inputClass}
                />
              )}
            </Field>
          </div>
          {count > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">
                <Plural
                  value={count}
                  one="Permissions in the edition"
                  other="Permissions in the editions"
                />
              </legend>
              <table className="text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th scope="col" className="py-1 pr-4 font-medium">
                      <Trans>Edition</Trans>
                    </th>
                    <th scope="col" className="py-1 pr-4 font-medium">
                      <ProgramLabel />
                    </th>
                    <th scope="col" className="py-1 font-medium">
                      <TicketsLabel />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.fields.map((row, index) => {
                    const edition = row.name
                    return (
                      <tr key={row.id} className="border-line border-t">
                        <th scope="row" className="py-1 pr-4 font-normal">
                          {edition}
                        </th>
                        <td className="py-1 pr-4">
                          <LevelSelect
                            aria-label={t`Programme in ${edition}`}
                            {...form.register(`editions.${index}.programAccess`)}
                          />
                        </td>
                        <td className="py-1">
                          <LevelSelect
                            aria-label={t`Tickets in ${edition}`}
                            {...form.register(`editions.${index}.ticketsAccess`)}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </fieldset>
          )}
        </>
      )}
      <ErrorMessage error={invite.error} />
      {outcome && <Outcome outcome={outcome} />}
      <div>
        <Button type="submit" pending={invite.isPending}>
          <Trans>Invite</Trans>
        </Button>
      </div>
    </form>
  )
}
