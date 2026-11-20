import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type ProgramItem } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import { createProgramItemOptions, programKey } from '../api/program'
import { ProgramItemForm } from '../components/program-item-form'

const EMPTY = { title: '', description: '', startsAt: '', endsAt: '' }

/**
 * A new programme item of an edition (`/editions/:editionSlug/program/new`), for a member with
 * `program=write`. Once it is added its own page opens, where its speakers are set.
 */
export function NewProgramItemPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`New programme item`, edition?.name ?? tenant.name)
  const base = `/${tenant.slug}/editions/${editionSlug ?? ''}/program`
  const create = useMutation({
    ...createProgramItemOptions(api),
    meta: {
      success: (item: ProgramItem) => {
        const title = item.title
        return msg`The programme item ${title} is added.`
      },
    },
    onSuccess: async (item) => {
      await queryClient.invalidateQueries({ queryKey: programKey(api) })
      void navigate(`${base}/${item.id}`)
    },
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !atLeast(access.edition(edition.id).program, 'write')) {
    return <NoPermissionView />
  }

  const editionId = edition.id
  return (
    <>
      <PageHeader title={<Trans>New programme item</Trans>} description={edition.name} />
      <p className="text-sm">
        <Link to={base} className="text-primary underline">
          <Trans>All programme items</Trans>
        </Link>
      </p>
      <Section title={<Trans>Programme item data</Trans>}>
        <ProgramItemForm
          defaultValues={EMPTY}
          pending={create.isPending}
          submitLabel={<Trans>Add the item</Trans>}
          onSubmit={(body) => create.mutate({ params: { editionId }, body })}
        />
      </Section>
    </>
  )
}
