import { type Api } from '../../../shared/lib/api'

// The reports of an edition's sales, behind its tickets permission
// (docs/specs/0010-sales-reports.md).

export const salesOptions = (api: Api, editionId: string) =>
  api.sales.get.queryOptions({ input: { params: { editionId } } })

/** The lists an org takes away as files. */
export const EXPORTS = ['ticket-holders', 'merchandise-pick-list', 'payments'] as const

export type ExportedList = (typeof EXPORTS)[number]

// A file comes in the language the panel shows: the client sends it with every request.
export const exportOptions = (api: Api, editionId: string, list: ExportedList) => {
  const input = { input: { params: { editionId }, headers: {} } }
  if (list === 'ticket-holders') return api.sales.ticketHolders.queryOptions(input)
  if (list === 'merchandise-pick-list') return api.sales.merchandisePickList.queryOptions(input)
  return api.sales.payments.queryOptions(input)
}
