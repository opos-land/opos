import { type Api } from '../../../shared/lib/api'

// The discount codes of an edition as an org sets them, behind its tickets permission
// (docs/specs/0008-discount-codes.md).

export const discountCodesKey = (api: Api) => api.discountCodes.key()

export const discountCodesOptions = (api: Api, editionId: string) =>
  api.discountCodes.list.queryOptions({ input: { params: { editionId } } })

export const createDiscountCodeOptions = (api: Api) => api.discountCodes.create.mutationOptions()

export const updateDiscountCodeOptions = (api: Api) => api.discountCodes.update.mutationOptions()

export const removeDiscountCodeOptions = (api: Api) => api.discountCodes.remove.mutationOptions()
