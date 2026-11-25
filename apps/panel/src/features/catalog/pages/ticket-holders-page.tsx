import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type CustomField, type EditionShop, updateEditionShopSchema } from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { changedFrom } from '../../../shared/lib/changes'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Badge,
  Button,
  buttonVariants,
  ErrorMessage,
  FieldSet,
  FormField,
  Input,
  LinkRow,
  LoadingView,
  NoPermissionView,
  PageHeader,
  RowLink,
  Section,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { editionShopOptions, updateEditionShopOptions } from '../../shop'
import { atLeast, useCurrentTenant } from '../../tenants'
import { catalogKey, customFieldsOptions, updateCustomFieldOptions } from '../api/catalog'
import { ListActions } from '../components/list-actions'
import { SensitiveDataNotice } from '../components/sensitive-data-notice'
import { ageBandsBody } from '../model/age-bands'

/**
 * What an edition asks of a ticket holder (`/editions/:editionSlug/ticket-holders`): the ages that
 * divide its three age bands, the guardian consent form a teen's guardian prints, and its custom
 * fields, with the link to the page of a new one for a member who may add. Reading needs
 * tickets>=read in the edition, changing tickets=write.
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
          <AgeBands
            // What the edition holds by now fills the form anew.
            key={JSON.stringify([shop.data.ageBands, shop.data.guardianConsentFormUrl])}
            shop={shop.data}
            editionId={edition.id}
            canWrite={canWrite}
          />
        )}
      </Section>
      <Section title={<Trans>Custom fields</Trans>}>
        <p className="max-w-2xl text-sm">
          <Trans>
            What the checkout asks a ticket holder beyond the name, the email and the age band, in
            the order below. The answers stay with the order, in your convention.
          </Trans>
        </p>
        <SensitiveDataNotice />
        {fields.isPending ? (
          <LoadingView />
        ) : fields.isError ? (
          <ErrorMessage error={fields.error} />
        ) : (
          <CustomFields
            fields={fields.data}
            canWrite={canWrite}
            base={`/${tenant.slug}/editions/${edition.slug}/ticket-holders/custom-fields`}
          />
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
      // Only what was changed here: the rest stays as someone else may have set it meanwhile.
      update.mutate({ params: { editionId }, body: changedFrom(shop, { ...ages, ...link.data }) })
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

/** The custom fields as a table in the order the checkout asks them, a row a field. */
function CustomFields({
  fields,
  canWrite,
  base,
}: {
  fields: CustomField[]
  canWrite: boolean
  /** The address the pages of the fields stand under. */
  base: string
}) {
  return (
    <>
      {fields.length === 0 ? (
        <p className="text-sm">
          <Trans>The edition has no custom fields yet.</Trans>
        </p>
      ) : (
        <Table>
          <caption className="sr-only">
            <Trans>Custom fields in their order</Trans>
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">
                <Trans context="a custom field">Question</Trans>
              </TableHead>
              <TableHead scope="col">
                <Trans context="a custom field">Answer</Trans>
              </TableHead>
              {canWrite && (
                <TableHead scope="col">
                  <Trans>Actions</Trans>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => (
              <CustomFieldRow
                key={field.id}
                field={field}
                // The page of a field is where it is changed: a reader has none to open.
                to={canWrite ? `${base}/${field.id}` : undefined}
                last={index === fields.length - 1}
              />
            ))}
          </TableBody>
        </Table>
      )}
      {canWrite && (
        <div>
          <Link to={`${base}/new`} className={buttonVariants({ variant: 'outline' })}>
            <PlusIcon data-icon="inline-start" />
            <Trans>New custom field</Trans>
          </Link>
        </div>
      )}
    </>
  )
}

/** One custom field in the table: what it asks, whether it must be answered, its place and hiding. */
function CustomFieldRow({
  field,
  to,
  last,
}: {
  field: CustomField
  to: string | undefined
  last: boolean
}) {
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const params = { editionId: field.editionId, fieldId: field.id }
  const update = useMutation({
    ...updateCustomFieldOptions(api),
    meta: { success: msg`The custom field is saved.` },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKey(api) }),
  })

  return (
    <LinkRow to={to}>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          {to ? <RowLink to={to}>{field.label}</RowLink> : <span>{field.label}</span>}
          {field.hidden && (
            <Badge variant="outline">
              <Trans context="a custom field">Hidden from the shop</Trans>
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        {field.isRequired ? (
          <Trans context="a custom field">Required</Trans>
        ) : (
          <Trans context="a custom field">Optional</Trans>
        )}
      </TableCell>
      {to && (
        <TableCell>
          <div className="flex flex-wrap gap-2">
            <ListActions
              position={field.position}
              last={last}
              hidden={field.hidden}
              pending={update.isPending}
              onMove={(position) => update.mutate({ params, body: { position } })}
              onHide={(hidden) => update.mutate({ params, body: { hidden } })}
            />
          </div>
        </TableCell>
      )}
    </LinkRow>
  )
}
