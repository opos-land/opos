import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type MyProfile } from '@opos/contract'
import { type NameParts } from '@opos/i18n/names'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toUpload } from '../../../shared/lib/file-upload'
import { notifyFailure } from '../../../shared/lib/notify'
import { Button, FormField, Input, IrreversibleAction } from '../../../shared/ui'
import { myProfileOptions, putAvatarOptions, removeAvatarOptions } from '../api/profile'
import { AVATAR_ACCEPT, isAvatarFile, MAX_AVATAR_MB } from '../model/avatar'
import { AccountAvatar } from './account-avatar'

/**
 * The account's avatar (docs/specs/0016-public-profile.md, A1-A7): shown, uploaded, replaced and
 * removed. It is public from its upload, which the form says before it takes a file. A replaced
 * or removed avatar is gone, so both ask first.
 */
export function AvatarForm({ profile, name }: { profile: MyProfile; name: NameParts }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [problem, setProblem] = useState<'type' | 'size' | null>(null)
  // A new key empties the file field once its file is sent.
  const [field, setField] = useState(0)
  const keep = (saved: MyProfile) => queryClient.setQueryData(myProfileOptions().queryKey, saved)

  const put = useMutation({
    ...putAvatarOptions(),
    meta: { success: msg`Your avatar is saved.` },
    onSuccess: (saved) => {
      keep(saved)
      setFile(null)
      setField((key) => key + 1)
    },
  })
  const remove = useMutation({
    ...removeAvatarOptions(),
    meta: { success: msg`Your avatar is removed.` },
    onSuccess: () => keep({ ...profile, avatar: null }),
  })

  const choose = (chosen: File | undefined) => {
    const found = chosen ? isAvatarFile(chosen) : 'ok'
    setProblem(found === 'ok' ? null : found)
    setFile(chosen && found === 'ok' ? chosen : null)
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
    const avatarFile = await read()
    if (avatarFile) put.mutate(avatarFile)
  }
  /** As `upload`, awaited to its end: the modal stays open while the new avatar is sent. */
  const replace = async () => {
    const avatarFile = await read()
    if (avatarFile) await put.mutateAsync(avatarFile)
  }

  return (
    <div className="flex flex-col gap-4">
      <AccountAvatar avatar={profile.avatar} name={name} alt={t`Your avatar`} />
      <p className="text-sm">
        <Trans>
          An avatar is public from the moment you upload it, whether or not your profile is
          published.
        </Trans>
      </p>
      <p className="text-sm">
        <Trans>Upload a picture of yourself, or one you have the right to show.</Trans>
      </p>
      <FormField
        label={t`Avatar file`}
        hint={t`A JPEG, PNG or WebP image of up to ${MAX_AVATAR_MB} MB. It is shown as a square, cut from the middle.`}
        error={
          problem === 'type'
            ? t`Choose a JPEG, PNG or WebP image.`
            : problem === 'size'
              ? t`Choose an image of up to ${MAX_AVATAR_MB} MB.`
              : undefined
        }
      >
        {(control) => (
          <Input
            {...control}
            key={field}
            type="file"
            accept={AVATAR_ACCEPT}
            disabled={put.isPending}
            onChange={(event) => choose(event.target.files?.[0])}
          />
        )}
      </FormField>
      <div className="flex flex-wrap gap-3">
        {profile.avatar ? (
          <IrreversibleAction
            label={<Trans>Replace the avatar</Trans>}
            title={<Trans>Replace your avatar?</Trans>}
            action={<Trans>Replace the avatar</Trans>}
            disabled={!file}
            onConfirm={replace}
          >
            <Trans>
              The avatar shown now goes, and everyone sees the new one at once. To have the old one
              back, upload its file again.
            </Trans>
          </IrreversibleAction>
        ) : (
          <Button disabled={!file || put.isPending} onClick={() => void upload()}>
            <Trans>Upload the avatar</Trans>
          </Button>
        )}
        {profile.avatar && (
          <IrreversibleAction
            label={<Trans>Remove the avatar</Trans>}
            title={<Trans>Remove your avatar?</Trans>}
            action={<Trans>Remove the avatar</Trans>}
            onConfirm={() => remove.mutateAsync({})}
          >
            <Trans>Everyone stops seeing it at once. To have it back, upload its file again.</Trans>
          </IrreversibleAction>
        )}
      </div>
    </div>
  )
}
