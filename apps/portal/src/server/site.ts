import { type Site } from './document'
import { loadTranslators } from './i18n'
import { publicReads } from './reads'

/**
 * What the documents of one deployment are made from: the portal's origin, its messages in every
 * language, and the API's public answers, read at the address the server itself reaches the API at.
 */
export async function createSite({
  origin,
  apiUrl,
  internalApiUrl,
  report,
}: {
  origin: string
  apiUrl: string
  internalApiUrl: string
  report: (error: unknown) => void
}): Promise<Site> {
  return {
    origin,
    report,
    context: {
      apiUrl,
      translators: await loadTranslators(),
      reads: publicReads({ apiUrl: internalApiUrl }),
    },
  }
}
