import { type Account, type UpdateAccount } from '@opos/contract'
import { z } from 'zod'

/** The names as the form edits them; an empty field clears the name (`PATCH /me`, PLAN.md 5.2). */
export const profileSchema = z.object({
  firstName: z.string().trim().max(100),
  lastName: z.string().trim().max(100),
})

export type Profile = z.infer<typeof profileSchema>

export const profileValues = (account: Account): Profile => ({
  firstName: account.firstName ?? '',
  lastName: account.lastName ?? '',
})

/** The body of `PATCH /me` for the edited names: an emptied name is `null`. */
export const profileUpdate = (profile: Profile): UpdateAccount => ({
  firstName: profile.firstName.trim() || null,
  lastName: profile.lastName.trim() || null,
})
