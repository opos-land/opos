import { QR_CODE_PATTERN } from '@opos/contract'

/** How many orders a page of the list shows. */
export const ORDERS_PAGE = 50

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')

/** What the search of the list is narrowed by. */
export interface OrderSearch {
  q?: string
  qrCodeHash?: string
}

/** The parts of a text between its spaces and hyphens: the pieces of a code, or words. */
const partsOf = (text: string) => text.split(/[\s-]+/).filter(Boolean)

/**
 * Whether a text of several parts reads as words and not as a code typed in pieces. Words carry
 * capitals inside the text, at the start of each name, where a code is typed in one case; the
 * first character tells nothing, since a phone's keyboard starts a text with a capital.
 */
const readsAsWords = (text: string, parts: readonly string[]) =>
  parts.length > 1 && /[a-z]/.test(text) && /[A-Z]/.test(text.slice(1))

/** Whether the parts are of one length, as the groups of a code are and the words of a name are not. */
const ofOneLength = (parts: readonly string[]) =>
  new Set(parts.map((part) => part.length)).size === 1

/**
 * Whether a text is likely a QR code typed or read with a mistake in it: long, of letters with
 * digits among them, as the whole text typed in pieces or as one word among others. A name has no
 * digit, an email address has an `@`, an order's number is ten characters, and names beside a
 * number read as words.
 */
function looksLikeQrCode(typed: string) {
  if (typed.includes('@')) return false
  return [typed, ...typed.split(/\s+/)].some((text) => {
    const parts = partsOf(text)
    const whole = parts.join('')
    const kept = whole.replace(/[^A-Za-z0-9]/g, '')
    return (
      !readsAsWords(text, parts) &&
      kept.length >= 24 &&
      kept.length <= 40 &&
      whole.length - kept.length <= 2 &&
      /\d/.test(kept) &&
      /[A-Za-z]/.test(kept)
    )
  })
}

/**
 * What the search box sends: a part of a number, a name or an email as it is typed, or, for a QR
 * code, the SHA-256 hash of the code. The code itself never travels in an address, where a log
 * would keep it (docs/specs/0006-order-management.md, Routes), so a text that looks like a code
 * with a mistake in it is not sent at all: the page says so instead.
 */
export async function searchOf(text: string): Promise<OrderSearch | { refused: 'qr-code' }> {
  const typed = text.trim()
  if (!typed) return {}
  // Read out at the desk and typed in small letters or in pieces of any length, it is the same
  // code, unless the text reads as words. With no digit in it, which a name has none of either,
  // it is a code only in pieces of one length.
  const parts = partsOf(typed)
  const code = parts.join('').toUpperCase()
  const isCode =
    QR_CODE_PATTERN.test(code) &&
    (/\d/.test(code) ? !readsAsWords(typed, parts) : ofOneLength(parts))
  if (!isCode) return looksLikeQrCode(typed) ? { refused: 'qr-code' } : { q: typed }
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
