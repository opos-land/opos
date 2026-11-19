import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type CustomField, type EditionShop, updateEditionShopSchema } from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ErrorMessage,
  FieldSet,
  FormField,
  Input,
  LoadingView,
  NoPermissionView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { editionShopOptions, updateEditionShopOptions } from '../../shop'
import { atLeast, useCurrentTenant } from '../../tenants'
import { catalogKey, createCustomFieldOptions, customFieldsOptions } from '../api/catalog'
import { CustomFieldForm } from '../components/custom-field-form'
import { CustomFieldRow } from '../components/custom-field-row'
import { ageBandsBody } from '../model/age-bands'

const NEW_FIELD = { label: '', isRequired: false }

/**
 * What an edition asks of a ticket holder (`/editions/:editionSlug/ticket-holders`): the ages that
 * divide its three age bands, the guardian consent form a teen's guardian prints, and its custom
 * fields. Reading needs tickets>=read in the edition, changing tickets=write.
 */
export function TicketHoldersPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Ticket holders’ data`, edition?.name ?? tenant.name)
  const level = edition ? access.edition(edition.id).tickets : 'none'
  const canRead = atLeast(level, 'read')
  const shop = useQuery({ ...editionShopOptions(api, edition?.id ?? ''), enabled: canRead })
  const fields = useQuery({ ...customFieldsOptions(api, edition?.id ?? ''), enabled: canRead })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />

  const canWrite = atLeast(level, 'write')
  return (
    <>
      <PageHeader title={<Trans>Ticket holders’ data</Trans>} description={edition.name} />
      <Section title={<Trans>Age bands</Trans>}>
        {shop.isPending ? (
          <LoadingView />
        ) : shop.isError ? (
          <ErrorMessage error={shop.error} />
        ) : (
          <AgeBands shop={shop.data} editionId={edition.id} canWrite={canWrite} />
        )}
      </Section>
      <Section title={<Trans>Custom fields</Trans>}>
        <p className="max-w-2xl text-sm">
          <Trans>
            What the checkout asks a ticket holder beyond the name, the email and the age band, in
            the order below. The answers stay with the order, in your convention.
          </Trans>
        </p>
        <Alert>
          <AlertTitle>
            <Trans>Ask for nothing sensitive</Trans>
          </AlertTitle>
          <AlertDescription>
            <Trans>
              A custom field must not ask about health, beliefs, an identity document number or
              anything else a convention does not need to let a person in.
            </Trans>
          </AlertDescription>
        </Alert>
        {fields.isPending ? (
          <LoadingView />
        ) : fields.isError ? (
          <ErrorMessage error={fields.error} />
        ) : (
          <CustomFields editionId={edition.id} fields={fields.data} canWrite={canWrite} />
        )}
      </Section>
    </>
  )
}

/** The two ages that divide child, teen and adult, and the guardian consent form's address. */
function AgeBands({
  shop,
  editionId,
  canWrite,
}: {
  shop: EditionShop
  editionId: string
  canWrite: boolean
}) {
  const { t } = useLingui()
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const [teen, setTeen] = useState(shop.ageBands ? String(shop.ageBands.teenFromAge) : '')
  const [adult, setAdult] = useState(shop.ageBands ? String(shop.ageBands.adultFromAge) : '')
  const [form, setForm] = useState(shop.guardianConsentFormUrl ?? '')
  const [problem, setProblem] = useState<'ages' | 'form' | null>(null)
  const update = useMutation({
    ...updateEditionShopOptions(api),
    meta: { success: msg`The age bands are saved.` },
    onSuccess: (saved) =>
      queryClient.setQueryData(editionShopOptions(api, editionId).queryKey, saved),
  })

  const save = () => {
    const ages = ageBandsBody(teen, adult)
    const link = updateEditionShopSchema.safeParse({ guardianConsentFormUrl: form.trim() || null })
    setProblem(!ages ? 'ages' : !link.success ? 'form' : null)
    if (ages && link.success) {
      update.mutate({ params: { editionId }, body: { ...ages, ...link.data } })
    }
  }

  return (
    <form
      noValidate
      className="flex max-w-lg flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <p className="text-sm">
        <Trans>
          A ticket holder is a child, a teen or an adult by their age on the first day of the
          edition. A child enters with a guardian present, a teen with a guardian’s written consent
          brought on paper.
        </Trans>
      </p>
      <FieldSet disabled={!canWrite}>
        <FormField
          label={t`A teen from the age of`}
          hint={t`Anyone younger is a child.`}
          error={
            problem === 'ages' &&
            t`Enter both ages as whole numbers, the second higher than the first, or leave both empty.`
          }
        >
          {(control) => (
            <Input
              {...control}
              inputMode="numeric"
              value={teen}
              onChange={(event) => setTeen(event.target.value)}
            />
          )}
        </FormField>
        <FormField label={t`An adult from the age of`}>
          {(control) => (
            <Input
              {...control}
              inputMode="numeric"
              value={adult}
              aria-invalid={problem === 'ages' ? true : undefined}
              onChange={(event) => setAdult(event.target.value)}
            />
          )}
        </FormField>
        <FormField
          label={t`Address of the guardian consent form`}
          hint={t`A form for a teen’s guardian to print and sign, linked from the checkout. Leave it empty for none.`}
          error={problem === 'form' && t`Enter an address that starts with https:// or http://.`}
        >
          {(control) => (
            <Input
              {...control}
              type="url"
              value={form}
              onChange={(event) => setForm(event.target.value)}
            />
          )}
        </FormField>
      </FieldSet>
      {canWrite && (
        <div>
          <Button type="submit" disabled={update.isPending}>
            <Trans>Save the age bands</Trans>
          </Button>
        </div>
      )}
    </form>
  )
}

function CustomFields({
  editionId,
  fields,
  canWrite,
}: {
  editionId: string
  fields: CustomField[]
  canWrite: boolean
}) {
  const { t } = useLingui()
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const listId = useId()
  // A new key empties the form once its field is added.
  const [form, setForm] = useState(0)
  const create = useMutation({
    ...createCustomFieldOptions(api),
    meta: { success: msg`The custom field is added.` },
    onSuccess: async () => {
      setForm((key) => key + 1)
      await queryClient.invalidateQueries({ queryKey: catalogKey(api) })
    },
  })

  return (
    <>
      {fields.length === 0 ? (
        <p className="text-sm">
          <Trans>The edition has no custom fields yet.</Trans>
        </p>
      ) : (
        <>
          <h3 id={listId} className="sr-only">
            <Trans>Custom fields in their order</Trans>
          </h3>
          <ol aria-labelledby={listId} className="flex flex-col gap-3">
            {fields.map((field, index) => (
              <CustomFieldRow
                key={field.id}
                field={field}
                last={index === fields.length - 1}
                canWrite={canWrite}
              />
            ))}
          </ol>
        </>
      )}
      {canWrite && (
        <div className="flex flex-col gap-4 border-t pt-4">
          <h3 className="text-sm font-medium">
            <Trans>New custom field</Trans>
          </h3>
          <CustomFieldForm
            key={form}
            initial={NEW_FIELD}
            pending={create.isPending}
            submitLabel={t`Add the custom field`}
            onSubmit={(body) => create.mutate({ params: { editionId }, body })}
          />
        </div>
      )}
    </>
  )
}
