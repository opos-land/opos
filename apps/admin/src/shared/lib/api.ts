import { type Contract, contract } from '@opos/contract'
import { createORPCClient } from '@orpc/client'
import { type ContractRouterClient } from '@orpc/contract'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { createTanstackQueryUtils, type RouterUtils } from '@orpc/tanstack-query'
import { env } from '../config/env'
import { acrossTabs, createApiFetch, requestRefresh, shared } from './api-fetch'
import { decodeApiError } from './errors'
import { activeLocale } from './i18n'
import { mfaRequired, signedOut } from './session-store'

export type ApiClient = ContractRouterClient<Contract>
export type Api = RouterUtils<ApiClient>

/** One refresh at a time: for the requests of this tab, then in turn with the other tabs. */
const refresh = shared(acrossTabs('opos-admin-refresh', () => requestRefresh(env.VITE_API_URL)))

const apiFetch = createApiFetch({
  refresh,
  onSignedOut: signedOut,
  onMfaRequired: mfaRequired,
  locale: activeLocale,
})

/**
 * The client of the API, for calls that are not queries: `auth`, `me` and the admin routes. The
 * API serves the admin application's origin nothing else.
 */
export const accountClient: ApiClient = createORPCClient<ApiClient>(
  new OpenAPILink(contract, {
    url: env.VITE_API_URL,
    fetch: (request) => apiFetch(request),
    customErrorResponseBodyDecoder: (body, response) => decodeApiError(body, response.status),
  }),
)

/** The queries of the admin application: every key starts with `admin`. */
export const accountApi: Api = createTanstackQueryUtils(accountClient, { path: ['admin'] })
