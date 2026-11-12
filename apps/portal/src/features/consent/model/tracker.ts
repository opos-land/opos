import { type MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'

/** What a visitor allows or refuses as a whole, in the order the banner offers them. */
export const CONSENT_CATEGORIES = ['analytics', 'marketing'] as const

export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number]

/** How the banner and the privacy settings name a category and say what it is for. */
export const CATEGORY_TEXTS: Record<
  ConsentCategory,
  { label: MessageDescriptor; description: MessageDescriptor }
> = {
  analytics: {
    label: msg`Analytics`,
    description: msg`Counting visits and seeing how the pages are used, to improve OPOS.`,
  },
  marketing: {
    label: msg`Marketing`,
    description: msg`Measuring the results of advertising campaigns and showing advertising on other websites.`,
  },
}

/**
 * A tool the portal does not strictly need: run only after the visitor allowed its category
 * (docs/ARCHITECTURE.md, Frontends).
 */
export interface Tracker {
  /** Stable and unique; a tracker with an identifier a visitor's choice lacks asks again. */
  id: string
  category: ConsentCategory
  /** The provider's name, shown as it is. */
  vendor: string
  /** What it does with the visitor's data, a sentence of its own under the provider's name. */
  purpose: MessageDescriptor
  /** Starts it, its script through `loadScript`; called at most once a page load. */
  load: () => void
  /** The cookies it leaves on this site, removed when its consent is withdrawn. */
  cookies?: readonly string[]
}
