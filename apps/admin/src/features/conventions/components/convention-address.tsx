import { zodResolver } from '@hookform/resolvers/zod'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type AdminTenant, renameTenantSchema } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Button, FormField, Input } from '../../../shared/ui'
import { adminKey, renameConventionOptions } from '../api/conventions'

/**
 * The change of a convention's address. The new address answers at once and the old one is not
 * found, so the hint says what the change breaks; the same form changes it back, so it asks
 * nothing first.
 */
export function ConventionAddress({ convention }: { convention: AdminTenant }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const form = useForm({
    resolver: zodResolver(renameTenantSchema),
    values: { slug: convention.slug },
  })
  const rename = useMutation({
    ...renameConventionOptions(),
    meta: { success: msg`The address is changed.` },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKey() }),
  })
  const { errors, isDirty } = form.formState

  const submit = form.handleSubmit((body) => {
    rename.mutate({ params: { tenantId: convention.id }, body })
  })

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="flex max-w-lg flex-col gap-4"
    >
      <FormField
        label={t`Address`}
        hint={t`Changing the address breaks every old link to the convention. The address it leaves is free for another convention at once.`}
        error={errors.slug && t`Use 3 to 40 lowercase letters, digits and hyphens.`}
      >
        {(control) => (
          <Input {...control} {...form.register('slug')} autoCapitalize="none" spellCheck={false} />
        )}
      </FormField>
      <Button type="submit" disabled={!isDirty || rename.isPending} className="self-start">
        <Trans>Change the address</Trans>
      </Button>
    </form>
  )
}
