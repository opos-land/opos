// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { headInDev } from './dev'

const options = { origin: 'http://opos.localhost:5174', apiUrl: 'http://api.opos.localhost:3001' }

type Handler = (
  html: string,
  context: { server?: unknown; originalUrl?: string },
) => Promise<string>

/** The plugin's transform of the dev server's document, as Vite calls it. */
function transform() {
  const hook = headInDev(options).transformIndexHtml as { order: string; handler: Handler }
  return hook
}

describe('headInDev', () => {
  it('runs in the dev server alone, before Vite adds its own to the document', () => {
    const plugin = headInDev(options)

    expect(plugin.apply).toBe('serve')
    expect(transform().order).toBe('pre')
  })

  it('fills the document through the module the dev server compiles, for the address asked', async () => {
    const devDocument = vi.fn().mockResolvedValue('<title>A</title>')
    const server = { ssrLoadModule: vi.fn().mockResolvedValue({ devDocument }) }

    const html = await transform().handler('<title>OPOS</title>', {
      server,
      originalUrl: '/conventions/con-a?x=1',
    })

    expect(html).toBe('<title>A</title>')
    expect(server.ssrLoadModule).toHaveBeenCalledWith('/src/server/dev-site.ts')
    expect(devDocument).toHaveBeenCalledWith(
      '<title>OPOS</title>',
      '/conventions/con-a?x=1',
      options,
    )
  })

  it('leaves the document as it is where no dev server asks for a page', async () => {
    expect(await transform().handler('<title>OPOS</title>', {})).toBe('<title>OPOS</title>')
  })
})
