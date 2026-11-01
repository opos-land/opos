import { type Api } from '../../../shared/lib/api'

export const programItemsOptions = (api: Api, editionId: string) =>
  api.program.list.queryOptions({ input: { params: { editionId } } })

/** Every programme query of the tenant. */
export const programKey = (api: Api) => api.program.key()

export const createProgramItemOptions = (api: Api) => api.program.create.mutationOptions()

export const updateProgramItemOptions = (api: Api) => api.program.update.mutationOptions()

export const removeProgramItemOptions = (api: Api) => api.program.remove.mutationOptions()

export const putSpeakersOptions = (api: Api) => api.program.speakers.put.mutationOptions()
