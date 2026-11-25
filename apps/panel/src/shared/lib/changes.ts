/** Whether two values hold the same: a value that holds others is compared by what it holds. */
const same = (one: unknown, other: unknown): boolean => {
  if (one === other) return true
  if (typeof one !== 'object' || typeof other !== 'object' || one === null || other === null) {
    return false
  }
  const held = Object.entries(one)
  return (
    held.length === Object.keys(other).length &&
    held.every(([name, value]) => same(value, (other as Record<string, unknown>)[name]))
  )
}

/**
 * Of what a form would set, what differs from what the form was filled with. A form that sends
 * this alone leaves the rest as it stands, which someone else may have changed since.
 */
export function changedFrom<Body extends object>(
  loaded: { [Name in keyof Body]?: unknown },
  body: Body,
): Partial<Body> {
  const names = Object.keys(body) as (keyof Body)[]
  return Object.fromEntries(
    names.filter((name) => !same(body[name], loaded[name])).map((name) => [name, body[name]]),
  ) as Partial<Body>
}
