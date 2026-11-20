import { type PairedScanner, pairedScannerSchema } from '@opos/contract'

/** Where the phone keeps what it was handed when it was paired. */
const KEY = 'opos.scanner'

/**
 * The link an org shows a phone to pair it: the panel's own address of the scanner, with the
 * pairing code after the `#`, which no server sees (docs/specs/0007-scanner.md, D7).
 */
export const pairingLink = (origin: string, code: string) => `${origin}/scanner#${code}`

/** The pairing code of the address the scanner was opened with, or null. */
export const codeFromHash = (hash: string): string | null => hash.replace(/^#/, '') || null

/**
 * The scanner this phone is, or null: its token and what it shows of itself, kept in the storage
 * of the panel's origin on this phone. It is no session of an account, and opens the scanner's
 * routes alone. One whose access has ended is nobody.
 */
export function readDevice(now = new Date()): PairedScanner | null {
  try {
    const stored = pairedScannerSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
    if (!stored.success || Date.parse(stored.data.expiresAt) <= now.getTime()) return null
    return stored.data
  } catch {
    return null
  }
}

export function saveDevice(device: PairedScanner) {
  try {
    localStorage.setItem(KEY, JSON.stringify(device))
  } catch {
    // A phone that keeps nothing is a scanner until its page is closed.
  }
}

export function forgetDevice() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing was kept.
  }
}
