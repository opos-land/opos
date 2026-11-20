import { type Api } from '../../../shared/lib/api'

// The scanners of an edition as an org manages them, behind its tickets permission
// (docs/specs/0007-scanner.md).

export const scannersKey = (api: Api) => api.scanners.key()

export const scannersOptions = (api: Api, editionId: string) =>
  api.scanners.list.queryOptions({ input: { params: { editionId } } })

/** One scanner with what it handed out, as its own page shows it. */
export const scannerOptions = (api: Api, editionId: string, scannerId: string) =>
  api.scanners.get.queryOptions({ input: { params: { editionId, scannerId } } })

export const createScannerOptions = (api: Api) => api.scanners.create.mutationOptions()

export const renewPairingOptions = (api: Api) => api.scanners.renewPairing.mutationOptions()

export const revokeScannerOptions = (api: Api) => api.scanners.revoke.mutationOptions()
