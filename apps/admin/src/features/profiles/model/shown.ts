import { type Avatar, type AvatarVariant } from '@opos/contract'
import { formatDateTime } from '@opos/i18n'
import { activeLocale } from '../../../shared/lib/i18n'

/** The address an avatar is served from, in one of its sizes: public, as everyone reads it. */
export const avatarUrl = (apiUrl: string, avatar: Avatar, variant: AvatarVariant) =>
  `${apiUrl.replace(/\/+$/, '')}/public/avatar-files/${avatar.fileId}/${variant}`

/** A moment of the platform's own record, which names no tenant's time zone: the browser's. */
export const shownMoment = (moment: string) =>
  formatDateTime(new Date(moment), activeLocale(), Intl.DateTimeFormat().resolvedOptions().timeZone)
