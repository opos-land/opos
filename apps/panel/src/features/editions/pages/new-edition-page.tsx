import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import { buttonVariants, NoPermissionView, PageHeader, Section } from '../../../shared/ui'
import { atLeast, useCurrentTenant } from '../../tenants'
import { createEditionOptions, editionsKey } from '../api/editions'
import { EditionForm } from '../components/edition-form'

const EMPTY = { name: '', slug: '', startsAt: '', endsAt: '' }

/** A new edition of the convention (`/settings/editions/new`), for a member with `settings=write`. */
export function NewEditionPage() {
  const { t } = useLingui()
  const { tenant, access, api } = useCurrentTenant()
  usePageTitle(t`New edition`, tenant.name)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const create = useMutation({
    ...createEditionOptions(api),
    onSuccess: async (edition) => {
      await queryClient.invalidateQueries({ queryKey: editionsKey(api) })
      void navigate(`/${tenant.slug}/editions/${edition.slug}`)
    },
  })

  if (!atLeast(access.settings, 'write')) return <NoPermissionView />

  return (
    <>
      <PageHeader
        title={<Trans>New edition</Trans>}
        description={t`A new edition starts inactive and unpublished.`}
        actions={
          <Link
            to={`/${tenant.slug}/settings/editions`}
            className={buttonVariants({ variant: 'outline' })}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            <Trans>Back to the editions</Trans>
          </Link>
        }
      />
      <Section title={<Trans>Edition data</Trans>}>
        <EditionForm
          defaultValues={EMPTY}
          pending={create.isPending}
          error={create.error}
          submitLabel={<Trans>Create the edition</Trans>}
          onSubmit={(body) => create.mutate({ body })}
        />
      </Section>
    </>
  )
}
