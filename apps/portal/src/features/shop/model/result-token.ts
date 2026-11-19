// The result token of an order: the secret that opens its result page for 24 hours. The tab that
// placed the order keeps it, and the address a payment provider sends the buyer back to carries
// it, since a bank's own application may return the buyer in another tab.

const keyOf = (orderId: string) => `opos-order-result:${orderId}`

export function keepResultToken(orderId: string, token: string) {
  try {
    window.sessionStorage.setItem(keyOf(orderId), token)
  } catch {
    // Nothing to keep it in: the result page then needs the address to carry it.
  }
}

/**
 * The token of the order: from the address, which is then cleaned of it so that it stays in no
 * history entry and no copied link, or from what the tab kept.
 */
export function resultToken(orderId: string): string | null {
  const url = new URL(window.location.href)
  const carried = url.searchParams.get('token')
  if (carried) {
    keepResultToken(orderId, carried)
    url.searchParams.delete('token')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    return carried
  }
  try {
    return window.sessionStorage.getItem(keyOf(orderId))
  } catch {
    return null
  }
}
