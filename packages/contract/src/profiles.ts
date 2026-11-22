import { z } from 'zod'
import { accountRoute, timestamp } from './common'
import { type FileType, uploadedFileSchema } from './files'
import { nameOrderSchema } from './me'
import { isPlainLine, plainLine, plainText } from './text'

// The public profile (docs/specs/0016-public-profile.md): what an account shows of itself to
// everyone once it publishes it. These are the routes of the account's own profile; anyone's read
// of a published one is among the public routes, and the takedown among the admin's.

/** The interests an account chooses among: the platform's list, the same for everyone (P5). */
export const PROFILE_INTERESTS = [
  'tabletop-rpg',
  'larp',
  'board-games',
  'card-games',
  'miniature-wargames',
  'video-games',
  'literature',
  'comics',
  'manga-anime',
  'film-tv',
  'cosplay',
  'crafts',
] as const

export type ProfileInterest = (typeof PROFILE_INTERESTS)[number]

/** Why a profile is reported (R2). */
export const PROFILE_REPORT_REASONS = ['identity', 'offensive', 'spam', 'other'] as const

export type ProfileReportReason = (typeof PROFILE_REPORT_REASONS)[number]

/**
 * Why a profile is taken down and a name cleared: every reason of a report that a rule of the
 * platform's terms stands behind, so never "another one" (T3, M2).
 */
export const TAKEDOWN_REASONS = ['identity', 'offensive', 'spam'] as const

export type TakedownReason = (typeof TAKEDOWN_REASONS)[number]

export const MAX_PROFILE_LINKS = 3
export const MAX_PROFILE_LINK_LENGTH = 200

/** The types an avatar is taken in: images alone, among those the storage keeps. */
export const PROFILE_AVATAR_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const satisfies readonly FileType[]

/** The largest avatar, in bytes. */
export const MAX_PROFILE_AVATAR_SIZE = 5 * 1024 * 1024

/** The sizes an avatar is served in, each a square cut from the middle of the picture. */
export const AVATAR_VARIANTS = ['large', 'small'] as const

export type AvatarVariant = (typeof AVATAR_VARIANTS)[number]

/** An address with no name and no password in it, a host, and nothing but https before it. */
function isHttpsLink(text: string) {
  if (!text.startsWith('https://') || /\s/.test(text) || !isPlainLine(text)) return false
  try {
    const url = new URL(text)
    return url.protocol === 'https:' && url.hostname !== '' && !url.username && !url.password
  } catch {
    return false
  }
}

/** A link of a profile: an https address, shown as it is and never fetched (P4). */
export const profileLinkSchema = z
  .string()
  .trim()
  .max(MAX_PROFILE_LINK_LENGTH)
  .refine(isHttpsLink, 'Not an https address')

const distinct = (values: readonly string[]) => new Set(values).size === values.length

/** What a profile holds, as its account sets it: every part optional (P1-P5). */
export const profileContentSchema = z.strictObject({
  description: plainText(500).nullable(),
  pronouns: plainLine(30).nullable(),
  city: plainLine(80).nullable(),
  links: z.array(profileLinkSchema).max(MAX_PROFILE_LINKS).refine(distinct, 'A link twice'),
  interests: z
    .array(z.enum(PROFILE_INTERESTS))
    .max(PROFILE_INTERESTS.length)
    .refine(distinct, 'An interest twice'),
})

export type ProfileContent = z.infer<typeof profileContentSchema>

/** What a profile holds, as an answer carries it. */
export const profileHeldSchema = z.object({
  description: z.string().nullable(),
  pronouns: z.string().nullable(),
  city: z.string().nullable(),
  links: z.array(z.string()),
  interests: z.array(z.enum(PROFILE_INTERESTS)),
})

/**
 * An avatar in an answer: the identifier of its file, which its address holds. Every variant is a
 * square, so a page keeps its place with no width and height.
 */
export const avatarSchema = z.object({ fileId: z.uuid() })

export type Avatar = z.infer<typeof avatarSchema>

/** What a takedown says to the account whose profile it is (T5). */
export const profileTakedownSchema = z.object({
  at: timestamp,
  reason: z.enum(TAKEDOWN_REASONS),
  /** The admin's sentence for the account. */
  note: z.string().nullable(),
  /** Whether the profile had an open report when it was taken down. */
  afterReport: z.boolean(),
  /** Whether the account asked for a review. */
  reviewRequested: z.boolean(),
})

/**
 * The profile of the session's account. `profileId` is what the address of its page holds, and
 * is null while the profile is not published.
 */
export const myProfileSchema = profileHeldSchema.extend({
  profileId: z.uuid().nullable(),
  published: z.boolean(),
  avatar: avatarSchema.nullable(),
  takedown: profileTakedownSchema.nullable(),
})

export type MyProfile = z.infer<typeof myProfileSchema>

export const putAvatarSchema = z.strictObject({ file: uploadedFileSchema })

/**
 * A published profile as anyone reads it: the parts of its account's public name and their order,
 * its avatar and what it holds. A field added here is public at once, for every account that
 * published its profile (docs/adr/0071-let-anyone-read-the-profile-an-account-published.md).
 */
export const publicProfileSchema = profileHeldSchema.extend({
  profileId: z.uuid(),
  firstName: z.string().nullable(),
  nickname: z.string().nullable(),
  lastName: z.string().nullable(),
  nameOrder: nameOrderSchema,
  avatar: avatarSchema.nullable(),
})

export type PublicProfile = z.infer<typeof publicProfileSchema>

export const profileContract = {
  get: accountRoute
    .route({
      method: 'GET',
      path: '/me/profile',
      summary:
        'The profile of the signed-in account and its state; an empty one for an account with none yet',
    })
    .output(myProfileSchema),
  update: accountRoute
    .route({
      method: 'PUT',
      path: '/me/profile',
      summary: 'Set what the profile of the signed-in account holds',
    })
    .input(z.object({ body: profileContentSchema }))
    .output(myProfileSchema),
  putAvatar: accountRoute
    .meta({ takesFile: true })
    .route({
      method: 'PUT',
      path: '/me/profile/avatar',
      summary:
        'Set the avatar of the signed-in account, in place of the one it had; public from then on',
    })
    .input(z.object({ body: putAvatarSchema }))
    .output(myProfileSchema),
  removeAvatar: accountRoute.route({
    method: 'DELETE',
    path: '/me/profile/avatar',
    successStatus: 204,
    summary: 'Remove the avatar of the signed-in account',
  }),
  publish: accountRoute
    .route({
      method: 'POST',
      path: '/me/profile/publication',
      summary:
        'Publish the profile of the signed-in account; refused with profile.taken-down while an admin holds it down',
    })
    .output(myProfileSchema),
  withdraw: accountRoute
    .route({
      method: 'DELETE',
      path: '/me/profile/publication',
      summary: 'Withdraw the profile of the signed-in account; it keeps what it holds',
    })
    .output(myProfileSchema),
  requestReview: accountRoute
    .route({
      method: 'POST',
      path: '/me/profile/review-request',
      summary:
        'Ask for a review of the takedown of the profile; refused with profile.not-taken-down',
    })
    .output(myProfileSchema),
}
