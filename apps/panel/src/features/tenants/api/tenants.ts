import { accountApi, type Api } from '../../../shared/lib/api'

export const membershipsOptions = () => accountApi.me.memberships.queryOptions()

export const membershipsKey = () => accountApi.me.memberships.key()

export const tenantOptions = (api: Api) => api.tenants.current.queryOptions()
