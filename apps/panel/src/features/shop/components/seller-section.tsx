import { zodResolver } from '@hookform/resolvers/zod'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type Seller } from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  Button,
  ErrorMessage,
  FieldSet,
  FormField,
  Input,
  LoadingView,
  Section,
  Textarea,
} from '../../../shared/ui'
import { useCurrentTenant } from '../../tenants'
import { putSellerOptions, sellerOptions, shopKey } from '../api/shop'
import { sellerBody, sellerFormSchema, sellerValues } from '../model/seller-form'

/**
 * The seller's details of the convention: the legal entity a buyer's contract is with, and the
 * address buyers write to. They may be saved before they are complete; the shop of an edition
 * opens once they are.
 */
export function SellerSection({ canWrite }: { canWrite: boolean }) {
  const { api } = useCurrentTenant()
  const seller = useQuery(sellerOptions(api))

  return (
    <Section title={<Trans>Seller’s details</Trans>}>
      {seller.isPending ? (
        <LoadingView />
      ) : seller.isError ? (
        <ErrorMessage error={seller.error} />
      ) : (
        <SellerForm seller={seller.data} canWrite={canWrite} />
      )}
    </Section>
  )
}

function SellerForm({ seller, canWrite }: { seller: Seller; canWrite: boolean }) {
  const { t } = useLingui()
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const form = useForm({ resolver: zodResolver(sellerFormSchema), values: sellerValues(seller) })
  const put = useMutation({
    ...putSellerOptions(api),
    meta: { success: msg`The seller’s details are saved.` },
    // The shop of each edition reads whether the details are complete.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shopKey(api) }),
  })
  const { errors } = form.formState
  const submit = form.handleSubmit((values) => put.mutate({ body: sellerBody(values) }))

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="flex max-w-lg flex-col gap-4"
    >
      <p className="text-sm">
        {seller.complete ? (
          <Trans>The details are complete.</Trans>
        ) : (
          <Trans>
            The details are incomplete. The shop of an edition can open once every field below is
            set.
          </Trans>
        )}
      </p>
      <FieldSet disabled={!canWrite}>
        <FormField
          label={t`Name of the seller`}
          hint={t`The legal entity that runs the convention and sells its tickets.`}
          error={errors.sellerName && t`Enter a name of up to 200 characters.`}
        >
          {(control) => <Input {...control} {...form.register('sellerName')} />}
        </FormField>
        <FormField
          label={t`Address of the seller`}
          error={errors.sellerAddress && t`Enter an address of up to 500 characters.`}
        >
          {(control) => <Textarea {...control} rows={3} {...form.register('sellerAddress')} />}
        </FormField>
        <FormField
          label={t`Register or tax number`}
          hint={t`The number the seller is registered under, such as KRS or NIP.`}
          error={errors.sellerRegistrationNumber && t`Enter a number of up to 50 characters.`}
        >
          {(control) => <Input {...control} {...form.register('sellerRegistrationNumber')} />}
        </FormField>
        <FormField
          label={t`Contact email`}
          hint={t`Buyers write to this address. The shop and its emails show it.`}
          error={errors.contactEmail && t`Enter an email address, or leave the field empty.`}
        >
          {(control) => <Input {...control} type="email" {...form.register('contactEmail')} />}
        </FormField>
        <FormField label={t`Currency`} hint={t`The convention sells in one currency.`}>
          {(control) => <Input {...control} value={seller.currency} readOnly disabled />}
        </FormField>
      </FieldSet>
      {canWrite && (
        <div>
          <Button type="submit" disabled={put.isPending}>
            <Trans>Save the details</Trans>
          </Button>
        </div>
      )}
    </form>
  )
}
