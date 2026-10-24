import { accountApi, type Api } from '../../../shared/lib/api'

export const membershipsOptions = () => accountApi.me.memberships.queryOptions()

export const membershipsKey = () => accountApi.me.memberships.key()

export const tenantOptions = (api: Api) => api.tenants.current.queryOptions()

export const updateTenantOptions = (api: Api) => api.tenants.update.mutationOptions()

/** The dashboard's edition summary; the same query, and cache entry, as the edition list. */
export const editionListOptions = (api: Api) => api.editions.list.queryOptions()
