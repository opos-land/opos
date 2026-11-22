import { useLingui } from '@lingui/react/macro'
import { type Avatar as AvatarFile, type AvatarVariant } from '@opos/contract'
import { type NameParts, publicInitials } from '@opos/i18n/names'
import { cn } from 'cn'
import { env } from '../../../shared/config/env'
import { Avatar, AvatarFallback } from '../../../shared/ui'
import { avatarUrl } from '../model/avatar'

/**
 * An account as a picture: its avatar, a square from the address anyone reads it at, or the
 * initials of its public name when it has none. No picture stands in for an avatar
 * (docs/specs/0016-public-profile.md, A5).
 */
export function AccountAvatar({
  avatar,
  name,
  alt,
  variant = 'large',
  className,
}: {
  avatar: AvatarFile | null
  name: NameParts
  /** What the picture is, for who cannot see it. */
  alt: string
  variant?: AvatarVariant
  className?: string
}) {
  const { i18n } = useLingui()
  const size = variant === 'large' ? 'size-32' : 'size-12'
  if (!avatar) {
    return (
      <Avatar className={cn(size, className)}>
        <AvatarFallback className={variant === 'large' ? 'text-3xl' : undefined}>
          {publicInitials(i18n, name)}
        </AvatarFallback>
      </Avatar>
    )
  }
  return (
    <img
      src={avatarUrl(env.VITE_API_URL, avatar, variant)}
      alt={alt}
      className={cn(size, 'rounded-full object-cover', className)}
    />
  )
}
