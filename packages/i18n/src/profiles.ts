import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'

// The words of the public profile that the API, the portal and the admin application share
// (docs/specs/0016-public-profile.md): the interests of the platform's list, the reasons of a
// report, and the rule of the platform's terms behind each reason of a takedown. The lists
// themselves are the contract's, whose test ties every value to its name here.

/** The interests an account chooses among, by their value in the contract. */
export const interestNames: Record<string, MessageDescriptor> = {
  'tabletop-rpg': msg`Tabletop role-playing games`,
  larp: msg`LARP`,
  'board-games': msg`Board games`,
  'card-games': msg`Card games`,
  'miniature-wargames': msg`Miniature wargames`,
  'video-games': msg`Video games`,
  literature: msg`Literature`,
  comics: msg`Comics`,
  'manga-anime': msg`Manga and anime`,
  'film-tv': msg`Film and television`,
  cosplay: msg`Cosplay`,
  crafts: msg`Crafts`,
}

/** Why a profile is reported, as the report's form and the admin application say it. */
export const reportReasonNames: Record<string, MessageDescriptor> = {
  identity: msg`Someone else’s picture or identity`,
  offensive: msg`Offensive or unlawful content`,
  spam: msg`Spam or advertising`,
  other: msg`Another reason`,
}

/**
 * The rule of the platform's terms a profile was taken down under, by the reason of the takedown:
 * a sentence of the email that tells the account. No rule stands behind "another reason", which
 * is why a takedown never takes it.
 */
export const profileRules: Record<string, MessageDescriptor> = {
  identity: msg`It was taken down because the terms of OPOS do not allow a profile to show a picture, a name or an identity of someone else.`,
  offensive: msg`It was taken down because the terms of OPOS do not allow offensive, hateful or unlawful content in a profile.`,
  spam: msg`It was taken down because the terms of OPOS do not allow spam or advertising in a profile.`,
}

/** The rule of the platform's terms a name was cleared under, by the reason. */
export const nameRules: Record<string, MessageDescriptor> = {
  identity: msg`It was cleared because the terms of OPOS do not allow an account to carry the name or the identity of someone else.`,
  offensive: msg`It was cleared because the terms of OPOS do not allow an offensive, hateful or unlawful name.`,
  spam: msg`It was cleared because the terms of OPOS do not allow spam or advertising in a name.`,
}
