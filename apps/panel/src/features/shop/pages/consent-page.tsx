import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  ErrorMessage,
  IrreversibleAction,
  LoadingView,
  NoPermissionView,
  NotFoundView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant } from '../../tenants'
import {
  consentsOptions,
  documentsOptions,
  removeConsentOptions,
  shopKey,
  updateConsentOptions,
} from '../api/shop'
import { ConsentForm } from '../components/consent-form'

/**
 * One consent of an edition (`/editions/:editionSlug/documents/consents/:consentId`), for a member
 * with tickets=write in the edition: the sentence a buyer accepts and whether the buyer must, and
 * its deletion. The document it links is linked for good, and so is its sentence once an order
 * accepted it. Its place among the consents and whether the shop asks for it are changed in their
 * list.
 */
export function ConsentPage() {
  const { t } = useLingui()
  const { editionSlug, consentId } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Consent`, edition?.name ?? tenant.name)
  const canWrite = edition ? atLeast(access.edition(edition.id).tickets, 'write') : false
  const editionId = edition?.id ?? ''
  const consents = useQuery({ ...consentsOptions(api, editionId), enabled: canWrite })
  const documents = useQuery({ ...documentsOptions(api, editionId), enabled: canWrite })
  const consent = consents.data?.find((entry) => entry.id === consentId)
  const list = `/${tenant.slug}/editions/${editionSlug ?? ''}/documents`
  const text = consent?.text ?? ''

  const refresh = () => queryClient.invalidateQueries({ queryKey: shopKey(api) })
  const update = useMutation({
    ...updateConsentOptions(api),
    meta: { success: msg`The consent is saved.` },
    onSuccess: refresh,
  })
  const remove = useMutation({
    ...removeConsentOptions(api),
    meta: { success: msg`The consent is deleted.` },
    onSuccess: async () => {
      await refresh()
      void navigate(list, { replace: true })
    },
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canWrite) return <NoPermissionView />
  if (consents.isPending || documents.isPending) return <LoadingView />
  const failure = consents.error ?? documents.error
  if (failure) return <ErrorMessage error={failure} />
  if (!consent) return <NotFoundView />

  const params = { editionId: edition.id, consentId: consent.id }
  return (
    <>
      <PageHeader title={<Trans>Consent</Trans>} description={edition.name} />
      <p className="text-sm">
        <Link to={list} className="text-primary underline">
          <Trans>Documents and consents</Trans>
        </Link>
      </p>
      <Section title={<Trans>Consent data</Trans>}>
        <ConsentForm
          // The saved consent fills the form anew.
          key={JSON.stringify(consent)}
          initial={consent}
          documents={documents.data ?? []}
          pending={update.isPending}
          submitLabel={<Trans>Save the consent</Trans>}
          linksDocument={false}
          sentenceFixed={consent.accepted}
          onSubmit={({ text: sentence, isRequired }) =>
            // The sentence of a consent an order accepted stays, and is not sent.
            update.mutate({
              params,
              body: consent.accepted ? { isRequired } : { text: sentence, isRequired },
            })
          }
        />
      </Section>
      <Section title={<Trans>Delete the consent</Trans>}>
        <p className="text-sm">
          <Trans>
            Deleting a consent cannot be undone. To stop asking for a while, hide it in the list of
            consents instead.
          </Trans>
        </p>
        <div>
          <IrreversibleAction
            label={<Trans>Delete the consent</Trans>}
            title={<Trans>Delete this consent?</Trans>}
            action={<Trans>Delete the consent</Trans>}
            onConfirm={() => remove.mutateAsync({ params })}
          >
            <Trans>The shop stops asking for it: “{text}”.</Trans>
          </IrreversibleAction>
        </div>
      </Section>
    </>
  )
}
