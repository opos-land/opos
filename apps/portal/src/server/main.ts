import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { documentFor } from './document'
import { readEnv } from './env'
import { createHeadServer } from './http'
import { createSite } from './site'

// The server beside the portal (docs/ARCHITECTURE.md, Frontends): it answers the document of every
// page with that page's head, which a search engine and a preview of a shared link read without
// running the portal. It holds no session and no secret, and knows what the API tells anyone.

const env = readEnv(process.env)
const html = await readFile(env.indexHtml, 'utf8')
if (!/<\/head>/i.test(html)) {
  throw new Error(`${env.indexHtml} is not the portal's document: it has no head to fill`)
}

const report = (error: unknown) => console.error('The plain head was served:', error)
const site = await createSite({ ...env, report })
const server = createHeadServer((pathname) => documentFor(html, pathname, site), report)

server.listen(env.port, () => {
  console.log(`Serving the documents of ${site.origin} on port ${env.port}`)
})
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close())
}
