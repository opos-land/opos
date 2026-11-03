import { type Contract, contract } from '@opos/contract'
import { createORPCClient } from '@orpc/client'
import { type ContractRouterClient } from '@orpc/contract'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { createTanstackQueryUtils, type RouterUtils } from '@orpc/tanstack-query'
import { env } from '../config/env'
import { acrossTabs, createApiFetch, requestRefresh, shared } from './api-fetch'
import { decodeApiError } from './errors'
import { activeLocale } from './i18n'
import { signedOut } from './session-store'

export type ApiClient = ContractRouterClient<Contract>
export type Api = RouterUtils<ApiClient>

/** One refresh at a time: for the requests of this tab, then in turn with the other tabs (7.4). */
const refresh = shared(acrossTabs('opos-panel-refresh', () => requestRefresh(env.VITE_API_URL)))

function client(tenantSlug?: string): ApiClient {
  const apiFetch = createApiFetch({
    refresh,
    onSignedOut: signedOut,
    tenantSlug,
    locale: activeLocale,
  })
  const link = new OpenAPILink(contract, {
    url: env.VITE_API_URL,
    fetch: (request) => apiFetch(request),
    customErrorResponseBodyDecoder: (body, response) => decodeApiError(body, response.status),
  })
  return createORPCClient<ApiClient>(link)
}

/** The client of the routes outside a tenant, for calls that are not queries: `auth` and `me`. */
export const accountClient: ApiClient = client()

/** Routes outside a tenant: `me` and the invitations. */
export const accountApi: Api = createTanstackQueryUtils(accountClient, { path: ['account'] })

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
