import { emailSchema, plainText, PROFILE_REPORT_REASONS, type ReportProfile } from '@opos/contract'
import { z } from 'zod'

/** A field that may stay empty, and holds what the contract takes when it is filled in. */
const optional = (filled: z.ZodType<string, string>) =>
  z
    .string()
    .trim()
    .pipe(z.union([z.literal(''), filled]))

/**
 * A report of a profile as its form edits it: one reason, and a note and an email address that
 * may both stay empty (docs/specs/0016-public-profile.md, R2).
 */
export const reportFormSchema = z.object({
  reason: z.enum(PROFILE_REPORT_REASONS),
  note: optional(plainText(1000)),
  email: optional(emailSchema),
})

export type ReportForm = z.infer<typeof reportFormSchema>

export const emptyReport: ReportForm = { reason: PROFILE_REPORT_REASONS[0], note: '', email: '' }

/** The body of the report: what was left empty is not sent at all. */
export const reportBody = ({ reason, note, email }: ReportForm): ReportProfile => ({
  reason,
  ...(note.trim() ? { note: note.trim() } : {}),
  ...(email.trim() ? { email: email.trim() } : {}),
})
