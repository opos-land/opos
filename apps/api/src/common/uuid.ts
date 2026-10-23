const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Checked before an id reaches a query, so a malformed one never becomes a database error. */
export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value)
