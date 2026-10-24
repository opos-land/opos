import { type Contract, contract } from '@opos/contract'
import { createORPCClient } from '@orpc/client'
import { type ContractRouterClient } from '@orpc/contract'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { createTanstackQueryUtils, type RouterUtils } from '@orpc/tanstack-query'
import { env } from '../config/env'
import { type ApiSession, createApiFetch, shared } from './api-fetch'
import { auth } from './auth'
import { decodeApiError } from './errors'
import { activeLocale } from './i18n'

export type ApiClient = ContractRouterClient<Contract>
export type Api = RouterUtils<ApiClient>

const session: ApiSession = {
  accessToken: async () => (await auth.getSession()).data.session?.access_token ?? null,
  refresh: shared(async () => {
    const { data, error } = await auth.refreshSession()
    return error ? null : (data.session?.access_token ?? null)
  }),
  signOut: async () => {
    await auth.signOut({ scope: 'local' })
  },
}

function client(tenantSlug?: string): ApiClient {
  const apiFetch = createApiFetch({ session, tenantSlug, locale: activeLocale })
  const link = new OpenAPILink(contract, {
    url: env.VITE_API_URL,
    fetch: (request) => apiFetch(request),
    customErrorResponseBodyDecoder: (body, response) => decodeApiError(body, response.status),
  })
  return createORPCClient<ApiClient>(link)
}

/** Routes outside a tenant: `me` and the invitations. */
export const accountApi: Api = createTanstackQueryUtils(client(), { path: ['account'] })

const tenantApis = new Map<string, Api>()

/**
 * Routes inside one tenant: every request carries its X-Tenant-Slug, and every query key starts
 * with the slug, so two tenants never share a cached answer.
 */
export function tenantApi(slug: string): Api {
  let api = tenantApis.get(slug)
  if (!api) {
    api = createTanstackQueryUtils(client(slug), { path: ['tenant', slug] })
    tenantApis.set(slug, api)
  }
  return api
}
