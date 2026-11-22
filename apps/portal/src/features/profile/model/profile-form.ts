import {
  MAX_PROFILE_LINKS,
  type MyProfile,
  plainLine,
  plainText,
  PROFILE_INTERESTS,
  type ProfileContent,
  profileLinkSchema,
} from '@opos/contract'
import { z } from 'zod'

/** A field that may stay empty, and holds what the contract takes when it is filled in. */
const optional = (filled: z.ZodType<string, string>) =>
  z
    .string()
    .trim()
    .pipe(z.union([z.literal(''), filled]))

/**
 * What a profile holds as the form edits it: every field a text that may be empty, a field for
 * each link the profile may have, and the interests that are ticked
 * (docs/specs/0016-public-profile.md, P1-P5).
 */
export const profileFormSchema = z.object({
  description: optional(plainText(500)),
  pronouns: optional(plainLine(30)),
  city: optional(plainLine(80)),
  links: z.array(optional(profileLinkSchema)).length(MAX_PROFILE_LINKS),
  interests: z.array(z.enum(PROFILE_INTERESTS)),
})

export type ProfileForm = z.infer<typeof profileFormSchema>

export const profileFormValues = (profile: MyProfile): ProfileForm => ({
  description: profile.description ?? '',
  pronouns: profile.pronouns ?? '',
  city: profile.city ?? '',
  links: Array.from({ length: MAX_PROFILE_LINKS }, (_, index) => profile.links[index] ?? ''),
  interests: profile.interests,
})

/**
 * The body of `PUT /me/profile`: an emptied field is nothing, only the filled-in links go, and the
 * interests go in the order of the platform's list, so a profile shows them in one order whatever
 * order they were ticked in.
 */
export const profileFormContent = (form: ProfileForm): ProfileContent => ({
  description: form.description.trim() || null,
  pronouns: form.pronouns.trim() || null,
  city: form.city.trim() || null,
  links: form.links.map((link) => link.trim()).filter(Boolean),
  interests: PROFILE_INTERESTS.filter((interest) => form.interests.includes(interest)),
})

/**
 * What is wrong with a field, by the kind of its validation error: it is too long, or it holds
 * what it may not, a character nobody sees or an address that is not https.
 */
export const fieldProblem = (error: { type?: string | number } | undefined) =>
  error === undefined ? undefined : error.type === 'too_big' ? 'too-long' : 'invalid'
