import { type PublicEdition } from '@opos/contract'

/**
 * A convention's editions beside its active one, as its page lists them: the coming ones first,
 * an edition under way among them, from the one that starts soonest, then the past ones from the
 * last ended.
 */
export function otherEditions(editions: PublicEdition[], now = new Date()): PublicEdition[] {
  const others = editions.filter((edition) => !edition.isActive)
  const ended = (edition: PublicEdition) => new Date(edition.endsAt) <= now
  const coming = others
    .filter((edition) => !ended(edition))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const past = others.filter(ended).sort((a, b) => b.endsAt.localeCompare(a.endsAt))
  return [...coming, ...past]
}
