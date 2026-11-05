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
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import { createProgramItemOptions, programItemsOptions, programKey } from '../api/program'
import { ProgramItemForm } from '../components/program-item-form'
import { speakerName } from '../model/speakers'

const EMPTY = { title: '', description: '', startsAt: '', endsAt: '' }

/** The edition's programme items and, for a member with `program=write`, the creation form. */
export function ProgramPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const time = useTenantTime()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Programme`, edition?.name ?? tenant.name)
  const level = edition ? access.edition(edition.id).program : 'none'
  const items = useQuery({
    ...programItemsOptions(api, edition?.id ?? ''),
    enabled: atLeast(level, 'read'),
  })
  const base = `/${tenant.slug}/editions/${editionSlug ?? ''}/program`
  const create = useMutation({
    ...createProgramItemOptions(api),
    onSuccess: async (item) => {
      await queryClient.invalidateQueries({ queryKey: programKey(api) })
      void navigate(`${base}/${item.id}`)
    },
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !atLeast(level, 'read')) return <NoPermissionView />

  const editionId = edition.id
  return (
    <>
      <PageHeader title={<Trans>Programme</Trans>} description={edition.name} />
      <Section title={<Trans>Programme items</Trans>}>
        {items.isPending ? (
          <LoadingView />
        ) : items.isError ? (
          <ErrorMessage error={items.error} />
        ) : items.data?.length ? (
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">
                  <Trans>Title</Trans>
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  <Trans>Time</Trans>
                </th>
                <th scope="col" className="py-2 font-medium">
                  <Trans>Speakers</Trans>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.data.map((item) => (
                <tr key={item.id} className="border-line border-t">
                  <td className="py-2 pr-4">
                    <Link to={`${base}/${item.id}`} className="text-accent font-medium underline">
                      {item.title}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{time.range(item.startsAt, item.endsAt)}</td>
                  <td className="py-2">{item.speakers.map(speakerName).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm">
            <Trans>There are no programme items yet.</Trans>
          </p>
        )}
      </Section>
      {atLeast(level, 'write') && (
        <Section title={<Trans>New programme item</Trans>}>
          <ProgramItemForm
            defaultValues={EMPTY}
            pending={create.isPending}
            error={create.error}
            submitLabel={<Trans>Add the item</Trans>}
            onSubmit={(body) => create.mutate({ params: { editionId }, body })}
          />
        </Section>
      )}
    </>
  )
}
