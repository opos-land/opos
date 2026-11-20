import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { DOCUMENT_KINDS, type DocumentKind } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Button,
  ErrorMessage,
  FormField,
  Input,
  LoadingView,
  NativeSelect,
  NativeSelectOption,
  NoPermissionView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant } from '../../tenants'
import { createDocumentOptions, shopKey } from '../api/shop'
import { KIND_LABELS } from '../model/documents'

/**
 * A new legal document of an edition (`/editions/:editionSlug/documents/new`), for a member with
 * tickets=write in the edition: its kind and its title. Its first version is published from the
 * document itself, on the documents page, where the member is led back.
 */
export function NewDocumentPage() {
  const { t, i18n } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`New document`, edition?.name ?? tenant.name)
  const [kind, setKind] = useState<DocumentKind>('shop-terms')
  const [title, setTitle] = useState('')
  const list = `/${tenant.slug}/editions/${editionSlug ?? ''}/documents`
  const create = useMutation({
    ...createDocumentOptions(api),
    meta: { success: msg`The document is added. Publish its first version.` },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: shopKey(api) })
      void navigate(list)
    },
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !atLeast(access.edition(edition.id).tickets, 'write')) {
    return <NoPermissionView />
  }

  const editionId = edition.id
  const trimmed = title.trim()
  return (
    <>
      <PageHeader title={<Trans>New document</Trans>} description={edition.name} />
      <p className="text-sm">
        <Link to={list} className="text-primary underline">
          <Trans>Documents and consents</Trans>
        </Link>
      </p>
      <Section title={<Trans>Document data</Trans>}>
        <form
          noValidate
          className="flex max-w-lg flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (trimmed) create.mutate({ params: { editionId }, body: { kind, title: trimmed } })
          }}
        >
          <FormField label={t`Kind`}>
            {(control) => (
              <NativeSelect
                {...control}
                value={kind}
                onChange={(event) => setKind(event.target.value as DocumentKind)}
              >
                {DOCUMENT_KINDS.map((option) => (
                  <NativeSelectOption key={option} value={option}>
                    {i18n._(KIND_LABELS[option])}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField label={t`Title of the new document`}>
            {(control) => (
              <Input
                {...control}
                value={title}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
              />
            )}
          </FormField>
          <div>
            <Button type="submit" disabled={!trimmed || create.isPending}>
              <Trans>Add the document</Trans>
            </Button>
          </div>
        </form>
      </Section>
    </>
  )
}
