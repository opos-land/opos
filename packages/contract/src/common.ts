import { z } from 'zod'
import { errorCodes } from './errors'

export const errorSchema = z.object({
  code: z.enum(errorCodes),
  params: z.record(z.union([z.string(), z.number()])).optional(),
  message: z.string(),
})

export type ApiError = z.infer<typeof errorSchema>
