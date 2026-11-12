import { type Tracker } from './model/tracker'

/**
 * Every tracker of the portal: anything it does not strictly need, run only with the visitor's
 * consent (docs/ARCHITECTURE.md, Frontends). The banner and the privacy settings show while this
 * list holds an entry, and a new entry asks every visitor again. Empty: OPOS uses no tracker.
 *
 * The first entry is a product decision, made in a decision record that also changes
 * docs/PRODUCT.md 10 and the privacy page. An entry looks like this:
 *
 *   import { msg } from '@lingui/core/macro'
 *   import { loadScript } from './model/load-script'
 *
 *   {
 *     id: 'example-analytics',
 *     category: 'analytics',
 *     vendor: 'Example Analytics',
 *     purpose: msg`Counts the visits to the portal's pages, with no cookie and no data that names you.`,
 *     cookies: [],
 *     load: () => loadScript('https://analytics.example/script.js', { 'data-domain': 'opos.land' }),
 *   }
 */
export const TRACKERS: readonly Tracker[] = []
