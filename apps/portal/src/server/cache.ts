/** How long an answer serves, in milliseconds, and how many answers are kept. */
export interface CacheTimes {
  /** An answer this young is given back without a read. */
  fresh: number
  /** An answer this young is given back when the read that would replace it fails. */
  stale: number
  /** After a failed read, no other is made for this long. */
  retry: number
  /** The answers kept; the oldest goes first. */
  max: number
}

/**
 * Keeps the answers of a read by key: one read for the requests that arrive together, none while
 * the answer is fresh, and the answer it had when a later read fails. A read that fails with
 * nothing to fall back on fails here too, and is not tried again for a moment.
 */
export function createCache<T>(times: CacheTimes, now: () => number = Date.now) {
  const answers = new Map<string, { value: T; at: number }>()
  const failures = new Map<string, number>()
  const pending = new Map<string, Promise<T>>()

  /** Puts an entry last, and drops the first ones beyond the size. */
  function keep<V>(map: Map<string, V>, key: string, value: V) {
    map.delete(key)
    map.set(key, value)
    for (const oldest of map.keys()) {
      if (map.size <= times.max) break
      map.delete(oldest)
    }
  }

  return async function cached(key: string, load: () => Promise<T>): Promise<T> {
    const had = answers.get(key)
    if (had && now() - had.at < times.fresh) return had.value

    const orFail = (error: unknown) => {
      if (had && now() - had.at < times.stale) return had.value
      throw error
    }
    const failedAt = failures.get(key)
    if (failedAt !== undefined && now() - failedAt < times.retry) {
      return orFail(new Error(`The read of ${key} failed a moment ago`))
    }

    let loading = pending.get(key)
    if (!loading) {
      loading = load().finally(() => pending.delete(key))
      pending.set(key, loading)
    }
    try {
      const value = await loading
      failures.delete(key)
      keep(answers, key, { value, at: now() })
      return value
    } catch (error) {
      keep(failures, key, now())
      return orFail(error)
    }
  }
}
