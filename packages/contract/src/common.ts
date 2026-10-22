import { z } from 'zod'

export const errorSchema = z.object({
  code: z.string(),
  params: z.record(z.union([z.string(), z.number()])).optional(),
  message: z.string(),
})

export type ApiError = z.infer<typeof errorSchema>
