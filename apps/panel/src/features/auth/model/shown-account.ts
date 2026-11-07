/**
 * The account this tab last showed. A page to return to belongs to that account, so
 * another account arriving on a page of the panel starts from `/`. Kept in sessionStorage, which
 * is the tab's own and outlives a page load, a Google return included; without it the panel works
 * as if the tab had shown no account yet.
 */
const SHOWN_ACCOUNT_KEY = 'opos-panel-shown-account'

export function shownAccount(): string | null {
  try {
    return window.sessionStorage.getItem(SHOWN_ACCOUNT_KEY)
  } catch {
    return null
  }
}

export function rememberShownAccount(accountId: string) {
  try {
    window.sessionStorage.setItem(SHOWN_ACCOUNT_KEY, accountId)
  } catch {
    // Nothing to remember it in.
  }
}

/** Whether `accountId` is another account than the one this tab showed before. */
export const isAnotherAccount = (accountId: string) => {
  const shown = shownAccount()
  return shown !== null && shown !== accountId
}
