import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { useId } from 'react'
import { Link, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  buttonVariants,
  ErrorMessage,
  LoadingView,
  NoPermissionView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant } from '../../tenants'
import { addOnsOptions } from '../api/catalog'
import { AddOnRow } from '../components/add-on-row'

/**
 * The add-ons of an edition (`/editions/:editionSlug/add-ons`): the optional extras bought with a
 * ticket, in the order the shop shows them, and for a member who may add, the link to the page of
 * a new one. Reading needs tickets>=read in the edition, changing tickets=write.
 */
export function AddOnsPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const listId = useId()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Add-ons`, edition?.name ?? tenant.name)
  const level = edition ? access.edition(edition.id).tickets : 'none'
  const canRead = atLeast(level, 'read')
  const addOns = useQuery({ ...addOnsOptions(api, edition?.id ?? ''), enabled: canRead })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />

  const canWrite = atLeast(level, 'write')
  return (
    <>
      <PageHeader
        title={<Trans>Add-ons</Trans>}
        description={edition.name}
        actions={
          canWrite && (
            <Link
              to={`/${tenant.slug}/editions/${edition.slug}/add-ons/new`}
              className={buttonVariants()}
            >
              <PlusIcon data-icon="inline-start" />
              <Trans>New add-on</Trans>
            </Link>
          )
        }
      />
      <Section title={<Trans>Add-ons of the edition</Trans>}>
        <p className="max-w-2xl text-sm">
          <Trans>
            Optional extras a buyer takes with a ticket, such as a workshop or a place in the
            sleeping room. A ticket type offers the add-ons you choose for it.
          </Trans>
        </p>
        {addOns.isPending ? (
          <LoadingView />
        ) : addOns.isError ? (
          <ErrorMessage error={addOns.error} />
        ) : addOns.data.length === 0 ? (
          <p className="text-sm">
            <Trans>The edition has no add-ons yet.</Trans>
          </p>
        ) : (
          <>
            <h3 id={listId} className="sr-only">
              <Trans>Add-ons in their order</Trans>
            </h3>
            <ol aria-labelledby={listId} className="flex flex-col gap-3">
              {addOns.data.map((addOn, index) => (
                <AddOnRow
                  key={addOn.id}
                  addOn={addOn}
                  last={index === addOns.data.length - 1}
                  canWrite={canWrite}
                />
              ))}
            </ol>
          </>
        )}
      </Section>
    </>
  )
}
