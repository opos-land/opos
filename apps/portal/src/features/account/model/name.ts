import { type Account, type UpdateAccount } from '@opos/contract'
import { z } from 'zod'

/** The names as the form edits them; an empty field clears the name (`PATCH /me`). */
export const nameSchema = z.object({
  firstName: z.string().trim().max(100),
  lastName: z.string().trim().max(100),
})

export type Name = z.infer<typeof nameSchema>

export const nameValues = (account: Account): Name => ({
  firstName: account.firstName ?? '',
  lastName: account.lastName ?? '',
})

/** The body of `PATCH /me` for the edited names: an emptied name is `null`. */
export const nameUpdate = (name: Name): UpdateAccount => ({
  firstName: name.firstName.trim() || null,
  lastName: name.lastName.trim() || null,
})
