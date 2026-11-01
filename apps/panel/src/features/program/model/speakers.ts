import { type ProgramItem } from '@opos/contract'
import { z } from 'zod'

type Speaker = ProgramItem['speakers'][number]

export const addSpeakerSchema = z.object({ email: z.email().max(254) })

/** The list to send when adding an address; the route replaces the whole list. */
export const emailsWith = (speakers: Speaker[], email: string) => [
  ...new Set([...speakers.map((speaker) => speaker.email), email.trim().toLowerCase()]),
]

export const emailsWithout = (speakers: Speaker[], email: string) =>
  speakers.map((speaker) => speaker.email).filter((entry) => entry !== email)

/** The speaker's names, or the address of an account that has none. */
export const speakerName = ({ firstName, lastName, email }: Speaker) =>
  [firstName, lastName].filter(Boolean).join(' ') || email
