import { z } from 'zod'

/**
 * The programme item form: dates as the wall-clock times of the tenant's zone, which the page turns
 * into instants. Two times of one zone compare as text in the order of their instants.
 */
export const programItemFormSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().max(5000),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
  })
  .refine((v) => v.endsAt > v.startsAt, { path: ['endsAt'] })

export type ProgramItemFormValues = z.infer<typeof programItemFormSchema>

/**
 * What the end field reports, by the type of its error: the dates in the wrong order (the refine
 * above), or a date that is missing or names no instant of the zone.
 */
export const endsAtProblem = (type: string | undefined): 'order' | 'missing' | null =>
  type === undefined ? null : type === 'custom' ? 'order' : 'missing'

export interface ProgramItemBody {
  title: string
  description: string | null
  startsAt: string
  endsAt: string
}

/** The request body, or null when a date names no instant of the zone. */
export function programItemBody(
  values: ProgramItemFormValues,
  fromInput: (value: string) => string | null,
): ProgramItemBody | null {
  const startsAt = fromInput(values.startsAt)
  const endsAt = fromInput(values.endsAt)
  if (!startsAt || !endsAt) return null
  return {
    title: values.title.trim(),
    description: values.description.trim() || null,
    startsAt,
    endsAt,
  }
}
