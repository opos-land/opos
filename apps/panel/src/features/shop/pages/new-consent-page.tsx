import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  ErrorMessage,
  LoadingView,
  NoPermissionView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant } from '../../tenants'
import { createConsentOptions, documentsOptions, shopKey } from '../api/shop'
import { ConsentForm } from '../components/consent-form'

const NEW_CONSENT = { text: '', isRequired: true, documentId: null }

/**
 * A new consent of an edition (`/editions/:editionSlug/documents/consents/new`), for a member
 * with tickets=write in the edition: the sentence a buyer accepts, whether the buyer must, and the
 * document of the edition it links. It joins the end of the consents, where the member is led
 * back.
 */
export function NewConsentPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`New consent`, edition?.name ?? tenant.name)
  const canWrite = edition ? atLeast(access.edition(edition.id).tickets, 'write') : false
  // A consent links one of the edition's documents, chosen here and kept for good.
  const documents = useQuery({ ...documentsOptions(api, edition?.id ?? ''), enabled: canWrite })
  const list = `/${tenant.slug}/editions/${editionSlug ?? ''}/documents`
  const create = useMutation({
    ...createConsentOptions(api),
    meta: { success: msg`The consent is added.` },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: shopKey(api) })
      void navigate(list)
    },
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canWrite) return <NoPermissionView />

  const editionId = edition.id
  return (
    <>
      <PageHeader title={<Trans>New consent</Trans>} description={edition.name} />
      <p className="text-sm">
        <Link to={list} className="text-primary underline">
          <Trans>Documents and consents</Trans>
        </Link>
      </p>
      <Section title={<Trans>Consent data</Trans>}>
        {documents.isPending ? (
          <LoadingView />
        ) : documents.isError ? (
          <ErrorMessage error={documents.error} />
        ) : (
          <ConsentForm
            initial={NEW_CONSENT}
            documents={documents.data}
            pending={create.isPending}
            submitLabel={<Trans>Add the consent</Trans>}
            onSubmit={(body) => create.mutate({ params: { editionId }, body })}
          />
        )}
      </Section>
    </>
  )
}
