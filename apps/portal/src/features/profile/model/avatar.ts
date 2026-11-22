import {
  type Avatar,
  type AvatarVariant,
  MAX_PROFILE_AVATAR_SIZE,
  PROFILE_AVATAR_TYPES,
} from '@opos/contract'

/**
 * The address an avatar is served from, in one of its sizes, without sign-in: an avatar is public
 * from its upload, so the same address serves the account's own page and everyone's.
 */
export const avatarUrl = (apiUrl: string, avatar: Avatar, variant: AvatarVariant) =>
  `${apiUrl.replace(/\/+$/, '')}/public/avatar-files/${avatar.fileId}/${variant}`

/** The largest avatar, in megabytes, as a message says it. */
export const MAX_AVATAR_MB = MAX_PROFILE_AVATAR_SIZE / (1024 * 1024)

/** The types a file input offers for an avatar. */
export const AVATAR_ACCEPT = PROFILE_AVATAR_TYPES.join(',')

/**
 * Whether a chosen file can be an avatar, told before it is sent: its type and its size. The API
 * checks both again, and the bytes against the type.
 */
export function isAvatarFile(file: { type: string; size: number }): 'ok' | 'type' | 'size' {
  if (!(PROFILE_AVATAR_TYPES as readonly string[]).includes(file.type)) return 'type'
  return file.size > MAX_PROFILE_AVATAR_SIZE ? 'size' : 'ok'
}
