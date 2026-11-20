import { type OrderListQuery } from '@opos/contract'
import { type Api } from '../../../shared/lib/api'

// An edition's orders, behind its tickets permission (docs/specs/0006-order-management.md).
const ofEdition = (editionId: string) => ({ input: { params: { editionId } } })

export const ordersKey = (api: Api) => api.orders.key()

export const ordersOptions = (api: Api, editionId: string, query: Partial<OrderListQuery>) =>
  api.orders.list.queryOptions({ input: { params: { editionId }, query } })

export const orderOptions = (api: Api, editionId: string, orderId: string) =>
  api.orders.get.queryOptions({ input: { params: { editionId, orderId } } })

export const createManualOrderOptions = (api: Api) => api.orders.createManual.mutationOptions()

export const updateHolderOptions = (api: Api) => api.orders.updateHolder.mutationOptions()

export const changeEmailOptions = (api: Api) => api.orders.changeEmail.mutationOptions()

export const swapVariantOptions = (api: Api) => api.orders.swapVariant.mutationOptions()

export const cancelOrderOptions = (api: Api) => api.orders.cancel.mutationOptions()

export const markPaidOptions = (api: Api) => api.orders.markPaid.mutationOptions()

export const declineOrderOptions = (api: Api) => api.orders.decline.mutationOptions()

export const resendConfirmationOptions = (api: Api) =>
  api.orders.resendConfirmation.mutationOptions()

export const handOutOptions = (api: Api) => api.orders.handOut.mutationOptions()

export const takeBackHandOutOptions = (api: Api) => api.orders.takeBackHandOut.mutationOptions()

export const productionNumbersOptions = (api: Api, editionId: string) =>
  api.orders.productionNumbers.queryOptions(ofEdition(editionId))

// The file comes in the language the panel shows: the client sends it with every request.
export const productionNumbersExportOptions = (api: Api, editionId: string) =>
  api.orders.productionNumbersExport.queryOptions({
    input: { params: { editionId }, headers: {} },
  })
