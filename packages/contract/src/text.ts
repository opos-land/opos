import { z } from 'zod'

// Control characters, and the characters that turn the direction of the text: with them a name
// reads as another name than the one that was typed (docs/specs/0016-public-profile.md, N7).
const UNSAFE = /[\p{Cc}؜‎‏‪-‮⁦-⁩]/u

/** A line of text a person typed for others to read: trimmed, not empty, up to `max` characters. */
export const plainLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((text) => !UNSAFE.test(text), 'Holds a control or a direction character')
