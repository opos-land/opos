import { type Plugin } from 'vite'
import type * as DevSite from './dev-site.ts'

// Loaded by vite.config.ts, in Node and uncompiled: it imports nothing of the portal, and hands
// the work to a module the dev server compiles.

const SITE = '/src/server/dev-site.ts'

/**
 * Fills the head of the dev server's document as a deployment's server does, so that a page is
 * named and previewed locally and in the e2e tests as it will be once deployed.
 */
export function headInDev(options: { origin: string; apiUrl: string }): Plugin {
  return {
    name: 'opos:head',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      async handler(html, { server, originalUrl }) {
        if (!server || !originalUrl) return html
        const { devDocument } = (await server.ssrLoadModule(SITE)) as typeof DevSite
        return devDocument(html, originalUrl, options)
      },
    },
  }
}
