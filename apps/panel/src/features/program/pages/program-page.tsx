import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type ProgramItem } from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  ErrorMessage,
  LoadingView,
  NoPermissionView,
  PageHeader,
  Section,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">
                  <Trans>Title</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Time</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Speakers</Trans>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link to={`${base}/${item.id}`} className="text-primary font-medium underline">
                      {item.title}
                    </Link>
                  </TableCell>
                  <TableCell>{time.range(item.startsAt, item.endsAt)}</TableCell>
                  <TableCell>{item.speakers.map(speakerName).join(', ')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

            submitLabel={<Trans>Add the item</Trans>}
            onSubmit={(body) => create.mutate({ params: { editionId }, body })}
          />
        </Section>
      )}
    </>
  )
}
