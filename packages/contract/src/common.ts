import { z } from 'zod'
import { errorCodes } from './errors'

export const errorSchema = z.object({
  code: z.enum(errorCodes),
  params: z.record(z.union([z.string(), z.number()])).optional(),
  message: z.string(),
})

export type ApiError = z.infer<typeof errorSchema>

/** A date-time with an offset that `Date` can read; zod alone accepts offsets such as `+99:00`. */
export const timestamp = z
  .string()
  .datetime({ offset: true })
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date')
