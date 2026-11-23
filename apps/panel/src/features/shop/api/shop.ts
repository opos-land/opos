import { type Api } from '../../../shared/lib/api'

// What belongs to the whole convention, behind the shop permission.
export const sellerOptions = (api: Api) => api.shop.seller.get.queryOptions()

export const putSellerOptions = (api: Api) => api.shop.seller.put.mutationOptions()

export const providerAccountOptions = (api: Api) => api.shop.providerAccount.get.queryOptions()

export const connectProviderAccountOptions = (api: Api) =>
  api.shop.providerAccount.put.mutationOptions()

export const disconnectProviderAccountOptions = (api: Api) =>
  api.shop.providerAccount.remove.mutationOptions()

// What belongs to one edition, behind its tickets permission.
export const editionShopOptions = (api: Api, editionId: string) =>
  api.shop.edition.get.queryOptions({ input: { params: { editionId } } })

export const updateEditionShopOptions = (api: Api) => api.shop.edition.update.mutationOptions()

export const openShopOptions = (api: Api) => api.shop.edition.open.mutationOptions()

export const closeShopOptions = (api: Api) => api.shop.edition.close.mutationOptions()

export const documentsOptions = (api: Api, editionId: string) =>
  api.shop.documents.list.queryOptions({ input: { params: { editionId } } })

export const createDocumentOptions = (api: Api) => api.shop.documents.create.mutationOptions()

export const updateDocumentOptions = (api: Api) => api.shop.documents.update.mutationOptions()

export const publishVersionOptions = (api: Api) =>
  api.shop.documents.publishVersion.mutationOptions()

export const removeDocumentOptions = (api: Api) => api.shop.documents.remove.mutationOptions()

export const consentsOptions = (api: Api, editionId: string) =>
  api.shop.consents.list.queryOptions({ input: { params: { editionId } } })

export const createConsentOptions = (api: Api) => api.shop.consents.create.mutationOptions()

export const updateConsentOptions = (api: Api) => api.shop.consents.update.mutationOptions()

export const removeConsentOptions = (api: Api) => api.shop.consents.remove.mutationOptions()

/** Every query of an edition's shop: its state, its documents and its consents. */
export const shopKey = (api: Api) => api.shop.key()
