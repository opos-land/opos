import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { LOGO_TYPES } from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { env } from '../../../shared/config/env'
import { toUpload } from '../../../shared/lib/file-upload'
import { notifyFailure } from '../../../shared/lib/notify'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Button,
  ErrorMessage,
  FormField,
  Input,
  IrreversibleAction,
  LoadingView,
  NoPermissionView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { atLeast, useCurrentTenant } from '../../tenants'
import { brandingOptions, putLogoOptions, removeLogoOptions } from '../api/branding'
import { logoBox, logoProblem, logoUrl } from '../model/logo-file'

/** The side of the box the page shows the logo in, in pixels. */
const PREVIEW = 160

/**
 * The convention's branding (`/settings/branding`): its logo, which the portal shows beside the
 * convention's name. Reading needs branding>=read, changing it branding=write. A logo that is
 * replaced or removed is gone, so both ask first.
 */
export function BrandingPage() {
  const { t } = useLingui()
  const { tenant, access, api } = useCurrentTenant()
  usePageTitle(t`Branding`, tenant.name)
  const queryClient = useQueryClient()
  const canRead = atLeast(access.branding, 'read')
  const canWrite = atLeast(access.branding, 'write')
  const branding = useQuery({ ...brandingOptions(api), enabled: canRead })
  const [file, setFile] = useState<File | null>(null)
  const [problem, setProblem] = useState<'type' | 'size' | null>(null)
  // A new key empties the file field once its file is sent.
  const [field, setField] = useState(0)
  const name = tenant.name

  const put = useMutation({
    ...putLogoOptions(api),
    meta: { success: msg`The logo is saved.` },
    onSuccess: (saved) => {
      queryClient.setQueryData(brandingOptions(api).queryKey, saved)
      setFile(null)
      setField((key) => key + 1)
    },
  })
  const remove = useMutation({
    ...removeLogoOptions(api),
    meta: { success: msg`The logo is removed.` },
    onSuccess: () => queryClient.setQueryData(brandingOptions(api).queryKey, { logo: null }),
  })

  if (!canRead) return <NoPermissionView />
  if (branding.isPending) return <LoadingView />
  if (branding.isError) return <ErrorMessage error={branding.error} />

  const { logo } = branding.data
  const choose = (chosen: File | undefined) => {
    const found = chosen ? logoProblem(chosen) : null
    setProblem(found)
    setFile(chosen && !found ? chosen : null)
  }
  /**
   * The chosen file as the route takes it. Reading it comes before the mutation, so a file that
   * cannot be read is told here: the query client tells only what a mutation ends in.
   */
  const read = async () => {
    if (!file) return null
    try {
      return { body: { file: await toUpload(file) } }
    } catch (error) {
      notifyFailure(error)
      return null
    }
  }
  const upload = async () => {
    const logoFile = await read()
    if (logoFile) put.mutate(logoFile)
  }
  /** As `upload`, awaited to its end: the modal stays open while the new logo is sent. */
  const replace = async () => {
    const logoFile = await read()
    if (logoFile) await put.mutateAsync(logoFile)
  }

  return (
    <>
      <PageHeader title={<Trans>Branding</Trans>} description={name} />
      <Section title={<Trans>Logo</Trans>}>
        <p className="max-w-xl text-sm">
          <Trans>
            The portal shows the logo beside the convention’s name: on the list of editions, on the
            convention’s page and on the page of each edition.
          </Trans>
        </p>
        {logo ? (
          <img
            src={logoUrl(env.VITE_API_URL, tenant.slug, logo, 'large')}
            {...logoBox(logo, PREVIEW)}
            alt={t`The logo of ${name}`}
          />
        ) : (
          <p className="text-sm">
            <Trans>The convention has no logo.</Trans>
          </p>
        )}
        {canWrite && (
          <div className="flex max-w-lg flex-col gap-4">
            <FormField
              label={t`Logo file`}
              hint={t`A JPEG, PNG or WebP image of up to 2 MB.`}
              error={
                problem === 'type'
                  ? t`Choose a JPEG, PNG or WebP image.`
                  : problem === 'size'
                    ? t`Choose an image of up to 2 MB.`
                    : undefined
              }
            >
              {(control) => (
                <Input
                  {...control}
                  key={field}
                  type="file"
                  accept={LOGO_TYPES.join(',')}
                  disabled={put.isPending}
                  onChange={(event) => choose(event.target.files?.[0])}
                />
              )}
            </FormField>
            <div className="flex flex-wrap gap-3">
              {logo ? (
                <IrreversibleAction
                  label={<Trans>Replace the logo</Trans>}
                  title={<Trans>Replace the logo of {name}?</Trans>}
                  action={<Trans>Replace the logo</Trans>}
                  disabled={!file}
                  onConfirm={replace}
                >
                  <Trans>
                    The logo shown now goes, and the portal shows the new one at once. To have the
                    old one back, upload its file again.
                  </Trans>
                </IrreversibleAction>
              ) : (
                <Button disabled={!file || put.isPending} onClick={() => void upload()}>
                  <Trans>Upload the logo</Trans>
                </Button>
              )}
              {logo && (
                <IrreversibleAction
                  label={<Trans>Remove the logo</Trans>}
                  title={<Trans>Remove the logo of {name}?</Trans>}
                  action={<Trans>Remove the logo</Trans>}
                  onConfirm={() => remove.mutateAsync({})}
                >
                  <Trans>
                    The portal stops showing it at once. To have it back, upload its file again.
                  </Trans>
                </IrreversibleAction>
              )}
            </div>
          </div>
        )}
      </Section>
    </>
  )
}
