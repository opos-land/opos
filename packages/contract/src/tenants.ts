import { initContract } from '@ts-rest/core'
import { z } from 'zod'
import { errorSchema } from './common'
import { bearer } from './me'

const c = initContract()

/** Headers of every tenant route: the session and the tenant it acts in (PLAN.md 7.2). */
export const tenantHeaders = bearer.extend({ 'x-tenant-slug': z.string() })

export const tenantSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  defaultLocale: z.string(),
  timezone: z.string(),
})

export type Tenant = z.infer<typeof tenantSchema>

const tenantErrors = { 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }

export const tenantsContract = c.router({
  current: {
    method: 'GET',
    path: '/tenants/current',
    headers: tenantHeaders,
    responses: { 200: tenantSchema, ...tenantErrors },
    summary: 'The tenant of X-Tenant-Slug; needs a membership',
  },
})
