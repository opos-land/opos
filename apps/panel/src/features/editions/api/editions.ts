import { type Api } from '../../../shared/lib/api'

export const editionsOptions = (api: Api) => api.editions.list.queryOptions()

/** Every edition query of the tenant: the list and each edition's members. */
export const editionsKey = (api: Api) => api.editions.key()

export const createEditionOptions = (api: Api) => api.editions.create.mutationOptions()

export const updateEditionOptions = (api: Api) => api.editions.update.mutationOptions()

export const activateEditionOptions = (api: Api) => api.editions.activate.mutationOptions()

export const removeEditionOptions = (api: Api) => api.editions.remove.mutationOptions()
