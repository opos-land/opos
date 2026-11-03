import { Trans } from '@lingui/react/macro'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router'
import { useSession } from '../../../shared/lib/session'
import { Button, ErrorMessage, linkClass } from '../../../shared/ui'
import { loginPath, mfaPath } from '../../auth'
import { scheduleOptions } from '../../schedule'
import { likeOptions, publicKey, unlikeOptions } from '../api/conventions'

/**
 * Liking a programme item (PRODUCT.md 7.1): possible until the edition ends, while a like can be
 * taken away at any time. The account's likes are its schedule.
 */
export function LikeButton({
  tenantSlug,
  editionId,
  programItemId,
  ended,
}: {
  tenantSlug: string
  editionId: string
  programItemId: string
  ended: boolean
}) {
  const location = useLocation()
  const queryClient = useQueryClient()
  const status = useSession((state) => state.status)
  const signedIn = useSession((state) => Boolean(state.account))
  const schedule = useQuery({ ...scheduleOptions(), enabled: signedIn })
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: publicKey() }),
      queryClient.invalidateQueries({ queryKey: scheduleOptions().queryKey }),
    ])
  const like = useMutation({ ...likeOptions(tenantSlug), onSuccess: refresh })
  const unlike = useMutation({ ...unlikeOptions(tenantSlug), onSuccess: refresh })
  const params = { editionId, programItemId }

  if (status === 'loading') return null
  if (!signedIn) {
    if (ended) return null
    const here = `${location.pathname}${location.search}`
    if (status === 'mfa-required') {
      return (
        <p>
          <Link to={mfaPath(here)} className={linkClass}>
            <Trans>Finish signing in to like this item</Trans>
          </Link>
        </p>
      )
    }
    return (
      <p>
        <Link to={loginPath(`${location.pathname}${location.search}`)} className={linkClass}>
          <Trans>Sign in to like this item</Trans>
        </Link>
      </p>
    )
  }
  if (schedule.isPending) return null
  if (schedule.isError) return <ErrorMessage error={schedule.error} />

  const liked = schedule.data.some((item) => item.id === programItemId)
  if (ended && !liked) return null
  return (
    <div className="flex flex-col gap-2">
      <div>
        {liked ? (
          <Button
            variant="secondary"
            pending={unlike.isPending}
            onClick={() => unlike.mutate({ params })}
          >
            <Trans>Remove the like</Trans>
          </Button>
        ) : (
          <Button pending={like.isPending} onClick={() => like.mutate({ params })}>
            <Trans>Like</Trans>
          </Button>
        )}
      </div>
      <ErrorMessage error={like.error ?? unlike.error} />
    </div>
  )
}
