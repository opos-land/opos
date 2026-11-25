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

/** The parts of a text between its spaces and hyphens: the groups of a code, or words. */
const partsOf = (text: string) => text.split(/[\s-]+/).filter(Boolean)

/**
 * Whether the parts of a text are the groups a code read out is typed in, and not words: groups
 * are of one length, give or take a character slipped, and the last is what was left, while words
 * differ in length. With no digit among them, which a name has none of either, only parts of
 * exactly one length are groups. A text of one part is a group by itself.
 */
function areGroups(parts: readonly string[]) {
  const lengths = parts.map((part) => part.length)
  if (!parts.some((part) => /\d/.test(part))) return new Set(lengths).size === 1
  if (parts.length === 1) return true
  const last = lengths.pop()!
  const longest = Math.max(...lengths)
  return longest - Math.min(...lengths) <= 1 && last <= longest + 1
}

/**
 * Whether a text is likely a QR code typed or read with a mistake in it: long, of letters with
 * digits among them, as the whole text typed in groups or as one word among others. A name has no
 * digit, an email address has an `@`, an order's number is ten characters, and the words of a
 * name with a number in it are no groups.
 */
function looksLikeQrCode(typed: string) {
  if (typed.includes('@')) return false
  return [typed, ...typed.split(/\s+/)].map(partsOf).some((parts) => {
    const whole = parts.join('')
    const kept = whole.replace(/[^A-Za-z0-9]/g, '')
    return (
      areGroups(parts) &&
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
  // Read out at the desk and typed in small letters or in groups, it is the same code. Several
  // words are a name, whatever they add up to.
  const parts = partsOf(typed)
  const code = parts.join('').toUpperCase()
  if (!QR_CODE_PATTERN.test(code) || !areGroups(parts))
    return looksLikeQrCode(typed) ? { refused: 'qr-code' } : { q: typed }
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
