import { useQuery } from '@tanstack/react-query'
import { useCurrentTenant } from '../../tenants'
import { editionsOptions } from '../api/editions'

/** The tenant's editions the member may see, newest first (PLAN.md 5.4). */
export function useEditions() {
  const { access, api } = useCurrentTenant()
  const query = useQuery(editionsOptions(api))
  return { ...query, data: query.data?.filter((edition) => access.seesEdition(edition.id)) }
}

/** The edition of the page's `:editionSlug`; undefined while loading or when the member does not see it. */
export function useEditionBySlug(slug: string | undefined) {
  const editions = useEditions()
  return { ...editions, edition: editions.data?.find((edition) => edition.slug === slug) }
}
