import { initContract } from '@ts-rest/core'
import { z } from 'zod'

const c = initContract()

export const healthStatusSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  database: z.enum(['up', 'down']),
})

export type HealthStatus = z.infer<typeof healthStatusSchema>

export const healthContract = c.router({
  check: {
    method: 'GET',
    path: '/health',
    responses: {
      200: healthStatusSchema,
      503: healthStatusSchema,
    },
    summary: 'Liveness and database connectivity',
  },
})
