import type { I18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'

// An account's public name (docs/specs/0016-public-profile.md, N1-N5): what stands wherever the
// account is named to everyone. The API answers the parts; each application renders them here, in
// the reader's language.

/** The three parts of an account's name, each optional, and where the nickname stands. */
export interface NameParts {
  firstName: string | null
  nickname: string | null
  lastName: string | null
  nameOrder: 'nickname-middle' | 'nickname-last'
}

/** The name of an account that has no part of a name. */
export const anonymousName = msg({
  message: 'Anon',
  comment: 'The public name of an account that gave no first name, nickname or last name',
})

const quotedNickname = (nickname: string) =>
  msg({
    message: `“${nickname}”`,
    comment: 'A nickname in quotation marks, beside a first or a last name: Anna “Lisek” Nowak',
  })

const part = (text: string | null) => text?.trim() || null

/**
 * The public name: the first and the last name with the nickname in quotation marks between or
 * after them, a nickname alone without them, and "Anon" for an account with no part.
 */
export function publicName(i18n: I18n, name: NameParts): string {
  const first = part(name.firstName)
  const nickname = part(name.nickname)
  const last = part(name.lastName)
  if (!nickname) return [first, last].filter(Boolean).join(' ') || i18n._(anonymousName)
  if (!first && !last) return nickname
  const quoted = i18n._(quotedNickname(nickname))
  const ordered = name.nameOrder === 'nickname-last' ? [first, last, quoted] : [first, quoted, last]
  return ordered.filter(Boolean).join(' ')
}

const initial = (text: string) => (Array.from(text)[0] ?? '').toLocaleUpperCase()

/**
 * What stands in for an avatar an account does not have: the initials of its first and last name,
 * else of its nickname, else of "Anon".
 */
export function publicInitials(i18n: I18n, name: NameParts): string {
  const names = [part(name.firstName), part(name.lastName)].filter((text) => text !== null)
  if (names.length > 0) return names.map(initial).join('')
  return initial(part(name.nickname) ?? i18n._(anonymousName))
}
