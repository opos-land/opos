import { z } from 'zod'
import { tenantRoute } from './common'

const programItem = z.object({
  params: z.object({ editionId: z.string(), programItemId: z.string() }),
})

/** Any signed-in account, in the team or not (PLAN.md 5.6). */
export const engagementContract = {
  like: tenantRoute
    .route({
      method: 'PUT',
      path: '/editions/{editionId}/program-items/{programItemId}/like',
      successStatus: 204,
      summary: 'Like a programme item of a published edition that has not ended; idempotent',
    })
    .input(programItem),
  unlike: tenantRoute
    .route({
      method: 'DELETE',
      path: '/editions/{editionId}/program-items/{programItemId}/like',
      successStatus: 204,
      summary: "Take the account's like away; idempotent",
    })
    .input(programItem),
}
