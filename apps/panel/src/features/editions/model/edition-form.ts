import { editionSlug } from '@opos/contract'
import { z } from 'zod'

/**
 * The edition form: dates as the wall-clock times of the tenant's zone, which the page turns into
 * instants. Two times of one zone compare as text in the order of their instants.
 */
export const editionFormSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug: editionSlug,
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
  })
  .refine((v) => v.endsAt > v.startsAt, { path: ['endsAt'] })

/**
 * What the end field reports, by the type of its error: the dates in the wrong order (the refine
 * above), or a date that is missing or names no instant of the zone.
 */
export const endsAtProblem = (type: string | undefined): 'order' | 'missing' | null =>
  type === undefined ? null : type === 'custom' ? 'order' : 'missing'

export type EditionFormValues = z.infer<typeof editionFormSchema>

export interface EditionBody {
  name: string
  slug: string
  startsAt: string
  endsAt: string
}

/** The request body, or null when a date names no instant of the zone. */
export function editionBody(
  values: EditionFormValues,
  fromInput: (value: string) => string | null,
): EditionBody | null {
  const startsAt = fromInput(values.startsAt)
  const endsAt = fromInput(values.endsAt)
  if (!startsAt || !endsAt) return null
  return { name: values.name.trim(), slug: values.slug, startsAt, endsAt }
}
