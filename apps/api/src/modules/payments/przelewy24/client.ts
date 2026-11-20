/** Where Przelewy24 answers: its production address, and the sandbox for a sandbox account. */
export interface Przelewy24Addresses {
  production: string
  sandbox: string
}

export const PRZELEWY24_ADDRESSES: Przelewy24Addresses = {
  production: 'https://secure.przelewy24.pl',
  sandbox: 'https://sandbox.przelewy24.pl',
}

/** How long a call to Przelewy24 may take before it counts as one that did not answer. */
export const CALL_TIMEOUT_MS = 10_000

/** What a call needs of an account: who asks, and where. */
export interface Caller {
  posId: number
  apiKey: string
  sandbox: boolean
}

/** An answer of Przelewy24's API: its HTTP status and its body, when the body was JSON. */
export interface Answer {
  status: number
  body: unknown
}

/**
 * Calls Przelewy24's REST API: JSON in and out, authenticated with the point of sale's identifier
 * and the API key. A call that does not answer in time, or cannot be made, throws: the caller
 * answers it as a provider out of reach. Nothing here is logged: a request carries the buyer's
 * email, and its headers the API key.
 */
export class Przelewy24Client {
  constructor(
    private readonly addresses: Przelewy24Addresses = PRZELEWY24_ADDRESSES,
    private readonly timeoutMs = CALL_TIMEOUT_MS,
  ) {}

  /** The address of the account's environment, without a trailing slash. */
  base(caller: Pick<Caller, 'sandbox'>) {
    return (caller.sandbox ? this.addresses.sandbox : this.addresses.production).replace(/\/+$/, '')
  }

  async call(
    caller: Caller,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: object,
  ): Promise<Answer> {
    const response = await fetch(`${this.base(caller)}${path}`, {
      method,
      headers: {
        authorization: `Basic ${Buffer.from(`${caller.posId}:${caller.apiKey}`).toString('base64')}`,
        ...(body && { 'content-type': 'application/json' }),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: 'error',
    })
    let parsed: unknown
    try {
      parsed = await response.json()
    } catch {
      parsed = undefined
    }
    return { status: response.status, body: parsed }
  }
}
