import { accountApi } from '../../../shared/lib/api'

// The convention pages' routes (PLAN.md 5.7), which need no sign-in.

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
