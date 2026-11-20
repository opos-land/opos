import { QR_CODE_PATTERN } from '@opos/contract'

/** How many orders a page of the list shows. */
export const ORDERS_PAGE = 50

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')

/**
 * What the search box sends: a part of a number, a name or an email as it is typed, or, for a QR
 * code, the SHA-256 hash of the code. The code itself never travels in an address, where a log
 * would keep it (docs/specs/0006-order-management.md, Routes).
 */
export async function searchOf(text: string): Promise<{ q?: string; qrCodeHash?: string }> {
  const typed = text.trim()
  if (!typed) return {}
  // Read out at the desk and typed in small letters, it is the same code.
  const code = typed.toUpperCase()
  if (!QR_CODE_PATTERN.test(code)) return { q: typed }
  return {
    qrCodeHash: hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))),
  }
}

/**
 * The orders a page shows, counted from one, and the place the page before and the page after
 * start at; null where there is none.
 */
export function pageOf({ offset, shown, total }: { offset: number; shown: number; total: number }) {
  return {
    first: shown === 0 ? 0 : offset + 1,
    last: offset + shown,
    previous: offset > 0 ? Math.max(offset - ORDERS_PAGE, 0) : null,
    next: offset + shown < total ? offset + ORDERS_PAGE : null,
  }
}
