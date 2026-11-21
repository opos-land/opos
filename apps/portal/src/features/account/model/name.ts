import { type Account, isPlainLine, nameOrderSchema, type UpdateAccount } from '@opos/contract'
import { z } from 'zod'

const part = (max: number) => z.string().trim().max(max).refine(isPlainLine)

/**
 * The parts of the name as the form edits them, and their order; an empty field clears its part
 * (`PATCH /me`).
 */
export const nameSchema = z.object({
  firstName: part(100),
  nickname: part(50),
  lastName: part(100),
  nameOrder: nameOrderSchema,
})

export type Name = z.infer<typeof nameSchema>

export const nameValues = (account: Account): Name => ({
  firstName: account.firstName ?? '',
  nickname: account.nickname ?? '',
  lastName: account.lastName ?? '',
  nameOrder: account.nameOrder,
})

/** The body of `PATCH /me` for the edited name: an emptied part is `null`. */
export const nameUpdate = (name: Name): UpdateAccount => ({
  firstName: name.firstName.trim() || null,
  nickname: name.nickname.trim() || null,
  lastName: name.lastName.trim() || null,
  nameOrder: name.nameOrder,
})

/**
 * What is wrong with a part, by the kind of its validation error: it is too long, or it holds a
 * control character or one that turns the direction of the text, which nobody sees in a field.
 */
export const nameProblem = (error: { type?: string | number } | undefined) =>
  error === undefined ? undefined : error.type === 'too_big' ? 'too-long' : 'hidden-character'
