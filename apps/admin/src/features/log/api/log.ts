import { accountApi } from '../../../shared/lib/api'

/** How many entries a page of the log holds. */
export const LOG_PAGE = 50

/**
 * The log of the admins' actions, newest first: `GET /admin/actions`, a page at a time, each next
 * page older than the last entry of the one before. A page shorter than `LOG_PAGE` is the last.
 */
export const logOptions = () =>
  accountApi.admin.actions.infiniteOptions({
    input: (before: string | undefined) => ({ query: { limit: LOG_PAGE, before } }),
    initialPageParam: undefined,
    getNextPageParam: (page) => (page.length < LOG_PAGE ? undefined : page.at(-1)?.id),
  })
