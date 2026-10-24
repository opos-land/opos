import { Trans } from '@lingui/react/macro'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router'
import { errorCode } from '../../../shared/lib/errors'
import { Button, ErrorMessage, LoadingView } from '../../../shared/ui'
import { signOut } from '../api/auth'
import { acceptInvitationOptions, membershipsKey } from '../api/invitations'
import { endsInvitation, forgetInvitation } from '../model/invitation-storage'

/**
 * Accepts the invitation as soon as there is a session (PLAN.md 7.7, step 2), then opens the
 * convention the account has joined.
 */
export function AcceptInvitation({ token, email }: { token: string; email: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const accept = useMutation({
    ...acceptInvitationOptions(),
    onSuccess: async ({ tenant }) => {
      forgetInvitation()
      await queryClient.invalidateQueries({ queryKey: membershipsKey() })
      void navigate(`/${tenant.slug}`, { replace: true })
    },
    onError: (error) => {
      if (endsInvitation(errorCode(error))) forgetInvitation()
    },
  })
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    accept.mutate({ body: { token } })
  }, [accept, token])

  if (!accept.isError) return <LoadingView />

  const code = errorCode(accept.error)
  return (
    <div className="flex flex-col gap-3">
      <ErrorMessage error={accept.error} />
      {code === 'invitation.email-mismatch' && (
        <>
          <p className="text-sm">
            <Trans>You are signed in as {email}.</Trans>
          </p>
          <Button variant="secondary" onClick={() => void signOut()}>
            <Trans>Sign out and use another account</Trans>
          </Button>
        </>
      )}
      {code === 'invitation.already-member' || code === 'invitation.used' ? (
        <Link to="/" className="text-accent text-sm underline">
          <Trans>Go to your conventions</Trans>
        </Link>
      ) : (
        code !== 'invitation.email-mismatch' && (
          <Button variant="secondary" onClick={() => accept.mutate({ body: { token } })}>
            <Trans>Try again</Trans>
          </Button>
        )
      )}
    </div>
  )
}
