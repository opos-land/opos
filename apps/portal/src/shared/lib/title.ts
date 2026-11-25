const SEPARATOR = ' · '

/** The parts that name a page, most specific first and the missing ones left out, as one line. */
export function joinTitle(parts: readonly (string | undefined)[]) {
  return parts.filter((part): part is string => Boolean(part?.trim())).join(SEPARATOR)
}

/** A tab title: the parts, most specific first and the missing ones left out, then the portal. */
export function formatTitle(parts: readonly (string | undefined)[], application: string) {
  return joinTitle([...parts, application])
}
