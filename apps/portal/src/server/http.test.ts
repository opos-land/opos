// @vitest-environment node
import { type AddressInfo, connect } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHeadServer, type Documents } from './http'

const servers: ReturnType<typeof createHeadServer>[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  )
})

/** The server on a free port of the loopback interface, and its address. */
async function listen(documents: Documents, report = vi.fn()) {
  const server = createHeadServer(documents, report)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

const page = (status = 200) =>
  vi.fn<Documents>().mockResolvedValue({ status, html: '<!doctype html><title>A</title>' })

describe('createHeadServer', () => {
  it('answers a page with its document, which no cache keeps without asking', async () => {
    const documents = page()
    const url = await listen(documents)

    const response = await fetch(`${url}/conventions/con-a`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-cache')
    expect(await response.text()).toBe('<!doctype html><title>A</title>')
    expect(documents).toHaveBeenCalledWith('/conventions/con-a')
  })

  it('asks for the page by its path alone, whatever the address carries after it', async () => {
    const documents = page()
    const url = await listen(documents)

    await fetch(`${url}/conventions/con-a?fbclid=1`)

    expect(documents).toHaveBeenCalledWith('/conventions/con-a')
  })

  it('reads an address that opens with two slashes as a path, never as the name of a host', async () => {
    const documents = page()
    const url = await listen(documents)

    await fetch(`${url}//elsewhere.example/conventions/con-a`)

    expect(documents).toHaveBeenCalledWith('//elsewhere.example/conventions/con-a')
  })

  it('answers 404 with the document of a page that is not there', async () => {
    const url = await listen(page(404))

    const response = await fetch(`${url}/nowhere`)

    expect(response.status).toBe(404)
    expect(await response.text()).toContain('<title>A</title>')
  })

  it('answers a HEAD request without the document', async () => {
    const url = await listen(page())

    const response = await fetch(`${url}/`, { method: 'HEAD' })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
  })

  it('refuses any other method', async () => {
    const documents = page()
    const url = await listen(documents)

    const response = await fetch(`${url}/`, { method: 'POST', body: 'x' })

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, HEAD')
    expect(documents).not.toHaveBeenCalled()
  })

  it('answers the health check itself', async () => {
    const documents = page()
    const url = await listen(documents)

    const response = await fetch(`${url}/healthz`)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
    expect(documents).not.toHaveBeenCalled()
  })

  it('answers 400 to an address it cannot read, and keeps serving', async () => {
    const documents = page()
    const url = await listen(documents)
    const { port } = new URL(url)

    // An address no client library sends, written to the socket as it stands
    const status = await new Promise<string>((resolve, reject) => {
      const socket = connect(Number(port), '127.0.0.1', () => {
        socket.write('GET http://[ HTTP/1.1\r\nHost: portal\r\nConnection: close\r\n\r\n')
      })
      socket.once('data', (data) => resolve(data.toString().split('\r\n')[0]!))
      socket.once('error', reject)
    })

    expect(status).toBe('HTTP/1.1 400 Bad Request')
    expect(documents).not.toHaveBeenCalled()
    expect((await fetch(`${url}/`)).status).toBe(200)
  })

  it('answers 500 and reports it when a document cannot be made, and keeps serving', async () => {
    const report = vi.fn()
    const broken = new Error('broken')
    const documents = vi
      .fn<Documents>()
      .mockRejectedValueOnce(broken)
      .mockResolvedValue({ status: 200, html: '<title>A</title>' })
    const url = await listen(documents, report)

    expect((await fetch(`${url}/`)).status).toBe(500)
    expect(report).toHaveBeenCalledWith(broken)
    expect((await fetch(`${url}/`)).status).toBe(200)
  })
})
