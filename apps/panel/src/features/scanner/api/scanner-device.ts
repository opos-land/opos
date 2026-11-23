import { contract } from '@opos/contract'
import { createORPCClient } from '@orpc/client'
import { type ContractRouterClient } from '@orpc/contract'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { env } from '../../../shared/config/env'
import { decodeApiError } from '../../../shared/lib/errors'
import { activeLocale } from '../../../shared/lib/i18n'

/**
 * The client of the scanner's routes (docs/specs/0007-scanner.md). Its caller is a device, not
 * an account: it sends the device's token in `Authorization: Bearer`, no session cookie and no
 * tenant.
 */
function client(token?: string): ContractRouterClient<typeof contract.scanner> {
  const link = new OpenAPILink(contract.scanner, {
    url: env.VITE_API_URL,
    fetch: (request) => {
      const headers = new Headers(request.headers)
      if (token) headers.set('authorization', `Bearer ${token}`)
      headers.set('accept-language', activeLocale())
      return fetch(new Request(request, { headers, credentials: 'omit' }))
    },
    customErrorResponseBodyDecoder: (body, response) => decodeApiError(body, response.status),
  })
  return createORPCClient(link)
}

/** Spends a pairing code: the phone is handed its token, once. */
export const pairScanner = (code: string) => client().pair({ body: { code } })

export const scanCode = (token: string, code: string) => client(token).scan({ body: { code } })

export const handOutLines = (
  token: string,
  body: { code: string; orderId: string; lineIds: string[] },
) => client(token).handOut({ body })
