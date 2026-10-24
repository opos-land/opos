import { z } from 'zod/v4'
import { publicRoute, withErrors } from './common'

export const healthStatusSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  database: z.enum(['up', 'down']),
})

export type HealthStatus = z.infer<typeof healthStatusSchema>

export const healthContract = {
  check: publicRoute
    .route({
      method: 'GET',
      path: '/health',
      summary: 'Liveness and database connectivity',
      // The 503 carries the same body as the 200.
      spec: (operation) => {
        const ok = operation.responses?.['200']
        const content = ok && 'content' in ok ? ok.content : undefined
        return withErrors({
          ...operation,
          security: [],
          responses: {
            ...operation.responses,
            '503': { description: 'The database is down', content },
          },
        })
      },
    })
    .output(healthStatusSchema),
}
