/** The key of the flag in `sessionStorage`. */
export const LOST_CODES_STORAGE_KEY = 'opos-recovery-codes-lost'

// The recovery codes of a turn-on whose answer never arrived are lost (PLAN.md 7.12). The next
// request wants the code screen, which unmounts the card and the notice with it, so the notice is
// kept as a flag until the person has read it. The flag holds no code and no secret.

/** Remembers that the codes were lost, for this tab. */
export function rememberLostCodes() {
  try {
    sessionStorage.setItem(LOST_CODES_STORAGE_KEY, '1')
  } catch {
    // Without storage the notice shows once, as long as the card stays mounted.
  }
}

export function lostCodesRemembered(): boolean {
  try {
    return sessionStorage.getItem(LOST_CODES_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** The person has read the notice, or two-factor authentication is off and the codes are moot. */
export function forgetLostCodes() {
  try {
    sessionStorage.removeItem(LOST_CODES_STORAGE_KEY)
  } catch {
    // Nothing was stored.
  }
}
