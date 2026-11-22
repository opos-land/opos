import { msg } from '@lingui/core/macro'
import { Trans } from '@lingui/react/macro'
import { type MyProfile } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { profilePath, TERMS_PATH } from '../../../shared/config/routes'
import { Button, linkClass } from '../../../shared/ui'
import { myProfileOptions, publishProfileOptions, withdrawProfileOptions } from '../api/profile'

/**
 * Whether the profile is public, and the way to change that
 * (docs/specs/0016-public-profile.md, P7 and P8): a profile is private until its account
 * publishes it, and withdrawing it keeps what it holds, so neither asks first. A profile taken
 * down offers no publishing: its notice says why.
 */
export function Publication({ profile }: { profile: MyProfile }) {
  const queryClient = useQueryClient()
  const keep = (saved: MyProfile) => queryClient.setQueryData(myProfileOptions().queryKey, saved)
  const publish = useMutation({
    ...publishProfileOptions(),
    meta: { success: msg`Your profile is public.` },
    onSuccess: keep,
  })
  const withdraw = useMutation({
    ...withdrawProfileOptions(),
    meta: { success: msg`Your profile is private again.` },
    onSuccess: keep,
  })

  if (profile.takedown) {
    return (
      <p className="text-sm">
        <Trans>A profile taken down cannot be published until an administrator restores it.</Trans>
      </p>
    )
  }
  if (profile.published && profile.profileId) {
    return (
      <>
        <p className="text-sm">
          <Trans>
            Your profile is public: anyone reads it, with no sign-in. Withdrawing it keeps
            everything it holds.
          </Trans>
        </p>
        <p>
          <Link to={profilePath(profile.profileId)} className={linkClass}>
            <Trans>See your profile as everyone does</Trans>
          </Link>
        </p>
        <Button
          variant="outline"
          className="self-start"
          disabled={withdraw.isPending}
          onClick={() => withdraw.mutate({})}
        >
          <Trans>Withdraw the profile</Trans>
        </Button>
      </>
    )
  }
  return (
    <>
      <p className="text-sm">
        <Trans>Your profile is private: only you see it.</Trans>
      </p>
      <p className="text-sm">
        <Trans>
          Once published, anyone reads it, with no sign-in: your name, your avatar and what the
          profile holds. Publish only what{' '}
          <Link to={TERMS_PATH} className={linkClass}>
            the terms
          </Link>{' '}
          allow.
        </Trans>
      </p>
      <Button
        className="self-start"
        disabled={publish.isPending}
        onClick={() => publish.mutate({})}
      >
        <Trans>Publish the profile</Trans>
      </Button>
    </>
  )
}
