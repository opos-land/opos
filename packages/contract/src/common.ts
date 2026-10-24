import { oc, type Route } from '@orpc/contract'
import { z } from 'zod/v4'
import { errorCodes } from './errors'

export const errorSchema = z.object({
  code: z.enum(errorCodes),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  message: z.string(),
})

export type ApiError = z.infer<typeof errorSchema>

export const level = z.enum(['none', 'read', 'write'])

/** A date-time with an offset that `Date` can read; zod alone accepts offsets such as `+99:00`. */
export const timestamp = z.iso
  .datetime({ offset: true })
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date')

// What a route needs besides its input, read by tests and documented below in OpenAPI.
export interface ContractMeta {
  /** A tenant route: X-Tenant-Slug names the tenant it runs in (PLAN.md 7.2). */
  tenant?: boolean
}

type Operation = Exclude<NonNullable<Route['spec']>, (...args: never[]) => unknown>

const errorResponse: NonNullable<Operation['responses']>[string] = {
  description: 'The error format of PLAN.md 5: a stable `code`, its `params`, an English `message`',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string', enum: [...errorCodes] },
          params: { type: 'object', additionalProperties: { type: ['string', 'number'] } },
          message: { type: 'string' },
        },
      },
    },
  },
}

/** Adds the error responses every route can give; `security: []` marks a route without sign-in. */
export const withErrors = (operation: Operation): Operation => ({
  ...operation,
  responses: { ...operation.responses, '4XX': errorResponse, '5XX': errorResponse },
})

const tenantHeader = {
  name: 'X-Tenant-Slug',
  in: 'header' as const,
  required: true,
  schema: { type: 'string' as const },
  description: 'The slug of the tenant the request acts in',
}

const base = oc.$meta<ContractMeta>({}).$route({ inputStructure: 'detailed' })

/** A route without sign-in. */
export const publicRoute = base.$route({
  inputStructure: 'detailed',
  spec: (operation) => withErrors({ ...operation, security: [] }),
})

/** A route for a signed-in account: `Authorization: Bearer <access token>`. */
export const accountRoute = base.$route({ inputStructure: 'detailed', spec: withErrors })

/** A route that acts inside one tenant, named by X-Tenant-Slug (PLAN.md 7.2). */
export const tenantRoute = oc.$meta<ContractMeta>({ tenant: true }).$route({
  inputStructure: 'detailed',
  spec: (operation) =>
    withErrors({ ...operation, parameters: [...(operation.parameters ?? []), tenantHeader] }),
})
