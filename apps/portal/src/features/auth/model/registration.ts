import { z } from 'zod'

const name = z.string().trim().min(1).max(100)

/**
 * The registration form (PLAN.md 9): the names follow the account's limits in `PATCH /me`. It asks
 * for no password, which is chosen once the link proves the address (PLAN.md 5.1).
 */
export const registrationSchema = z.object({
  firstName: name,
  lastName: name,
  email: z.email(),
})

export type Registration = z.infer<typeof registrationSchema>

/** The password chosen after the confirmation, typed twice. */
export const passwordSchema = z
  .object({ password: z.string().min(8), repeat: z.string() })
  .refine((value) => value.password === value.repeat, { path: ['repeat'] })
