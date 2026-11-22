import { ApiError } from '../../common/errors/api-error'

/** An admin holds the profile down: it cannot be published until it is restored. */
export const profileTakenDown = () =>
  new ApiError(409, 'profile.taken-down', 'The profile is taken down')

/** A review is asked of a takedown, and the profile is not taken down. */
export const profileNotTakenDown = () =>
  new ApiError(409, 'profile.not-taken-down', 'The profile is not taken down')
