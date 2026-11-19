import { type Api } from '../../../shared/lib/api'

// What an edition sells, behind its tickets permission.
const ofEdition = (editionId: string) => ({ input: { params: { editionId } } })

export const ticketTypesOptions = (api: Api, editionId: string) =>
  api.catalog.ticketTypes.list.queryOptions(ofEdition(editionId))

export const createTicketTypeOptions = (api: Api) =>
  api.catalog.ticketTypes.create.mutationOptions()

export const updateTicketTypeOptions = (api: Api) =>
  api.catalog.ticketTypes.update.mutationOptions()

export const removeTicketTypeOptions = (api: Api) =>
  api.catalog.ticketTypes.remove.mutationOptions()

export const addOnsOptions = (api: Api, editionId: string) =>
  api.catalog.addOns.list.queryOptions(ofEdition(editionId))

export const createAddOnOptions = (api: Api) => api.catalog.addOns.create.mutationOptions()

export const updateAddOnOptions = (api: Api) => api.catalog.addOns.update.mutationOptions()

export const removeAddOnOptions = (api: Api) => api.catalog.addOns.remove.mutationOptions()

export const customFieldsOptions = (api: Api, editionId: string) =>
  api.catalog.customFields.list.queryOptions(ofEdition(editionId))

export const createCustomFieldOptions = (api: Api) =>
  api.catalog.customFields.create.mutationOptions()

export const updateCustomFieldOptions = (api: Api) =>
  api.catalog.customFields.update.mutationOptions()

export const removeCustomFieldOptions = (api: Api) =>
  api.catalog.customFields.remove.mutationOptions()

export const merchandiseOptions = (api: Api, editionId: string) =>
  api.catalog.merchandise.list.queryOptions(ofEdition(editionId))

export const createItemOptions = (api: Api) => api.catalog.merchandise.create.mutationOptions()

export const updateItemOptions = (api: Api) => api.catalog.merchandise.update.mutationOptions()

export const removeItemOptions = (api: Api) => api.catalog.merchandise.remove.mutationOptions()

export const putVariantsOptions = (api: Api) =>
  api.catalog.merchandise.putVariants.mutationOptions()

export const putStockOptions = (api: Api) => api.catalog.merchandise.putStock.mutationOptions()

export const addPictureOptions = (api: Api) => api.catalog.merchandise.addPicture.mutationOptions()

export const removePictureOptions = (api: Api) =>
  api.catalog.merchandise.removePicture.mutationOptions()

export const putSizeChartOptions = (api: Api) =>
  api.catalog.merchandise.putSizeChart.mutationOptions()

export const removeSizeChartOptions = (api: Api) =>
  api.catalog.merchandise.removeSizeChart.mutationOptions()

/** A picture or a size chart in one of its sizes, read with the member's session. */
export const merchandiseFileOptions = (
  api: Api,
  editionId: string,
  fileId: string,
  variant: string,
) =>
  api.catalog.merchandise.file.queryOptions({ input: { params: { editionId, fileId, variant } } })

/** Every query of an edition's catalog. */
export const catalogKey = (api: Api) => api.catalog.key()
