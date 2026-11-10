import { zodResolver } from '@hookform/resolvers/zod'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { type EditionGrant, type InvitationOutcome, level } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import {
  Button,
  FieldLegend,
  FieldSet,
  FormField,
  Input,
  NativeSelect,
  NativeSelectOption,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/ui'
import { useEditions } from '../../editions'
import { useCurrentTenant, useTenantTime } from '../../tenants'
import { inviteMemberOptions, membersKey } from '../api/members'
import { invitationNotice } from '../model/invitation'
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

/** An invitation by email (PRODUCT.md 5): the role, both levels and an optional expiry. */
export function InviteForm() {
  const { t } = useLingui()
  const { access, api } = useCurrentTenant()
  const time = useTenantTime()
  const queryClient = useQueryClient()
  const editions = useEditions()

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
    meta: { success: (result: InvitationOutcome) => invitationNotice(result, time.format) },
    onSuccess: async () => {
      form.reset(blank())
      await queryClient.invalidateQueries({ queryKey: membersKey(api) })
    },
  })

  const submit = form.handleSubmit((values) => {
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
        <FormField label={t`Email`} error={errors.email && t`Enter a valid email address.`}>
          {(control) => <Input {...control} {...form.register('email')} type="email" />}
        </FormField>
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
      </div>
      {isHead ? (
        <p className="text-muted-foreground text-sm">
          <Trans>A head organizer has every permission, in every edition, and never expires.</Trans>
        </p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <FormField label={<SettingsLabel />}>
              {(control) => <LevelSelect {...control} {...form.register('settingsAccess')} />}
            </FormField>
            <FormField label={<ShopLabel />}>
              {(control) => <LevelSelect {...control} {...form.register('shopConfigAccess')} />}
            </FormField>
            <FormField
              label={t`Access until`}
              hint={t`Optional, in the convention's time zone, ${zone}.`}
              error={errors.expiresAt && t`Enter a date and time in the future.`}
            >
              {(control) => (
                <Input {...control} {...form.register('expiresAt')} type="datetime-local" />
              )}
            </FormField>
          </div>
          {count > 0 && (
            <FieldSet>
              <FieldLegend variant="label">
                <Plural
                  value={count}
                  one="Permissions in the edition"
                  other="Permissions in the editions"
                />
              </FieldLegend>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">
                      <Trans>Edition</Trans>
                    </TableHead>
                    <TableHead scope="col">
                      <ProgramLabel />
                    </TableHead>
                    <TableHead scope="col">
                      <TicketsLabel />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.fields.map((row, index) => {
                    const edition = row.name
                    return (
                      <TableRow key={row.id}>
                        <TableHead scope="row">{edition}</TableHead>
                        <TableCell>
                          <LevelSelect
                            aria-label={t`Programme in ${edition}`}
                            {...form.register(`editions.${index}.programAccess`)}
                          />
                        </TableCell>
                        <TableCell>
                          <LevelSelect
                            aria-label={t`Tickets in ${edition}`}
                            {...form.register(`editions.${index}.ticketsAccess`)}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </FieldSet>
          )}
        </>
      )}

      <div>
        <Button disabled={invite.isPending} type="submit">
          <Trans>Invite</Trans>
        </Button>
      </div>
    </form>
  )
}
