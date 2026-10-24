import { z } from 'zod'

const name = z.string().trim().min(1).max(100)

/**
 * The registration form (PLAN.md 9): the names follow the account's limits in `PATCH /me`, the
 * password Supabase Auth's minimum (PLAN.md 7.4).
 */
export const registrationSchema = z.object({
  firstName: name,
  lastName: name,
  email: z.email(),
  password: z.string().min(8),
})

export type Registration = z.infer<typeof registrationSchema>

export const passwordSchema = z
  .object({ password: z.string().min(8), repeat: z.string() })
  .refine((value) => value.password === value.repeat, { path: ['repeat'] })
