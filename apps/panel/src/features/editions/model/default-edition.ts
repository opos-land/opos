import { type Edition } from '@opos/contract'

/**
 * The edition a member enters a convention into (PLAN.md 8): the active one when they see it, else
 * the newest they see. `editions` are those the member sees, newest first.
 */
export const defaultEdition = (editions: readonly Edition[]): Edition | undefined =>
  editions.find((edition) => edition.isActive) ?? editions[0]
