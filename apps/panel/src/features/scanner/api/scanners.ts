import { type Api } from '../../../shared/lib/api'

// The scanners of an edition as an org manages them, behind its tickets permission
// (docs/specs/0007-scanner.md).

export const scannersKey = (api: Api) => api.scanners.key()

export const scannersOptions = (api: Api, editionId: string) =>
  api.scanners.list.queryOptions({ input: { params: { editionId } } })

export const createScannerOptions = (api: Api) => api.scanners.create.mutationOptions()

export const revokeScannerOptions = (api: Api) => api.scanners.revoke.mutationOptions()
