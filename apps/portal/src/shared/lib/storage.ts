// localStorage can be missing or throw (private mode, blocked site data); the portal then works
// without what it would have remembered.

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Nothing to remember it in.
  }
}

export function removeStorage(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing was stored.
  }
}
