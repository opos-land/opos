import { oc, type Route } from '@orpc/contract'
import { z } from 'zod'
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
  /** A tenant route: X-Tenant-Slug names the tenant it runs in. */
  tenant?: boolean
  /** A route of the admin application, for an account holding the admin role. */
  admin?: boolean
  /**
   * A feature's route that takes a file in its JSON body: it gets the body limit of an upload and
   * receives the file before its transaction (docs/specs/0012-file-storage.md).
   */
  takesFile?: boolean
  /** A feature's route that answers a kept file, under the headers of the storage. */
  servesFile?: boolean
  /**
   * A route a scanner calls: a device with no session and no membership, named by its token in
   * `Authorization: Bearer` (docs/specs/0007-scanner.md).
   */
  scanner?: boolean
}

type Operation = Exclude<NonNullable<Route['spec']>, (...args: never[]) => unknown>

const errorResponse: NonNullable<Operation['responses']>[string] = {
  description: 'The error format: a stable `code`, its `params`, an English `message`',
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

/** A route for a signed-in account: the session cookie of the portal or the panel. */
export const accountRoute = base.$route({ inputStructure: 'detailed', spec: withErrors })

/** A route that acts inside one tenant, named by X-Tenant-Slug. */
export const tenantRoute = oc.$meta<ContractMeta>({ tenant: true }).$route({
  inputStructure: 'detailed',
  spec: (operation) =>
    withErrors({ ...operation, parameters: [...(operation.parameters ?? []), tenantHeader] }),
})

/**
 * A route a scanner calls. Its caller is a device, not an account: it sends no session cookie
 * and no tenant, and is known by the token it was handed when it was paired.
 */
export const scannerRoute = oc.$meta<ContractMeta>({ scanner: true }).$route({
  inputStructure: 'detailed',
  spec: (operation) => withErrors({ ...operation, security: [{ scannerDevice: [] }] }),
})

/**
 * A route of the admin application: its session cookie, an account holding the admin role with
 * the second factor of its grant, and a recent sign-in. Its path starts with `/admin/`.
 */
export const adminRoute = oc.$meta<ContractMeta>({ admin: true }).$route({
  inputStructure: 'detailed',
  // The admin application's own cookie, not the portal's or the panel's the document defaults to.
  spec: (operation) => withErrors({ ...operation, security: [{ adminSession: [] }] }),
})
