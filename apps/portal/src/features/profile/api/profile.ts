import { accountApi } from '../../../shared/lib/api'

// The routes of the public profile (docs/specs/0016-public-profile.md): the account's own profile
// behind its session, and what anyone reads and sends.

/**
 * The signed-in account as `GET /me` answers it, for the name its initials come from: saving a
 * name writes its answer there, so what shows it follows at once.
 */
export const accountOptions = () => accountApi.me.get.queryOptions()

export const myProfileOptions = () => accountApi.profile.get.queryOptions()

export const updateProfileOptions = () => accountApi.profile.update.mutationOptions()

export const putAvatarOptions = () => accountApi.profile.putAvatar.mutationOptions()

export const removeAvatarOptions = () => accountApi.profile.removeAvatar.mutationOptions()

export const publishProfileOptions = () => accountApi.profile.publish.mutationOptions()

export const withdrawProfileOptions = () => accountApi.profile.withdraw.mutationOptions()

export const requestReviewOptions = () => accountApi.profile.requestReview.mutationOptions()

export const publicProfileOptions = (profileId: string) =>
  accountApi.public.profile.queryOptions({ input: { params: { profileId } } })

export const reportProfileOptions = () => accountApi.public.reportProfile.mutationOptions()
