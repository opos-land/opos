import { EDITION_LIST_PAGE, type EditionListPeriod } from '@opos/contract'
import { accountApi, tenantApi } from '../../../shared/lib/api'

// The convention pages' routes, which need no sign-in.

/** Every convention page query, whose like counts a like changes. */
export const publicKey = () => accountApi.public.key()

export const likeOptions = (slug: string) => tenantApi(slug).engagement.like.mutationOptions()

export const unlikeOptions = (slug: string) => tenantApi(slug).engagement.unlike.mutationOptions()

/**
 * One part of the list of editions on the home page, a page at a time: the next page continues
 * from the place the one before names, and a page that names none is the last.
 */
export const editionListOptions = (period: EditionListPeriod) =>
  accountApi.public.editionList.infiniteOptions({
    input: (after: string | undefined) => ({ query: { period, after, limit: EDITION_LIST_PAGE } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next ?? undefined,
  })

export const conventionOptions = (slug: string) =>
  accountApi.public.tenant.queryOptions({ input: { params: { slug } } })

export const editionsOptions = (slug: string) =>
  accountApi.public.editions.queryOptions({ input: { params: { slug } } })

export const activeEditionOptions = (slug: string) =>
  accountApi.public.activeEdition.queryOptions({ input: { params: { slug } } })

export const editionOptions = (slug: string, editionSlug: string) =>
  accountApi.public.edition.queryOptions({ input: { params: { slug, editionSlug } } })

export const programItemsOptions = (slug: string, editionSlug: string) =>
  accountApi.public.programItems.queryOptions({ input: { params: { slug, editionSlug } } })

export const programItemOptions = (slug: string, editionSlug: string, programItemId: string) =>
  accountApi.public.programItem.queryOptions({
    input: { params: { slug, editionSlug, programItemId } },
  })
