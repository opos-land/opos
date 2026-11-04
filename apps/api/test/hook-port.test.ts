import { readdirSync, readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HOOK_PORT_FILES,
  HOOK_PORT_TIMEOUT_MS,
  HOOK_PORT_WAIT_MS,
  listenOnHookPort,
} from './hook-port'

const servers: Server[] = []

/** A server on a free port, standing in for the test file that holds the hook port. */
const hold = async () => {
  const server = createServer()
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  return (server.address() as { port: number }).port
}

/** The little of an application `listenOnHookPort` uses, listening on a server of its own. */
const applicationOn = () => {
  const server = createServer()
  servers.push(server)
  const app = {
    listen: (port: number) =>
      new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, resolve)
      }),
  }
  return { app: app as unknown as NestExpressApplication, server }
}

const close = (server: Server) =>
  new Promise<void>((resolve) => (server.listening ? server.close(() => resolve()) : resolve()))

afterEach(async () => {
  await Promise.all(servers.splice(0).map(close))
})

describe('the hook port budget', () => {
  it('names every test file that takes a turn on the port', () => {
    const directory = new URL('./', import.meta.url)
    const holders = readdirSync(directory)
      .filter((file) => file.endsWith('.test.ts') && file !== 'hook-port.test.ts')
      .filter((file) =>
        readFileSync(new URL(file, directory), 'utf8').includes('listenOnHookPort('),
      )

    expect(holders.sort()).toEqual([...HOOK_PORT_FILES].sort())
  })

  it('waits for every other file on the port for a run of minutes each', () => {
    const others = HOOK_PORT_FILES.length - 1

    expect(HOOK_PORT_WAIT_MS).toBeGreaterThanOrEqual(others * 180_000)
    expect(HOOK_PORT_TIMEOUT_MS).toBeGreaterThan(HOOK_PORT_WAIT_MS)
  })
})

describe('listenOnHookPort', () => {
  it('listens at once on a free port', async () => {
    const port = await hold()
    await close(servers[0]!)
    const { app, server } = applicationOn()

    await listenOnHookPort(app, port)

    expect(server.listening).toBe(true)
  })

  it('waits for the file holding the port to let it go', async () => {
    const port = await hold()
    const holder = servers[0]!
    const { app, server } = applicationOn()

    const listening = listenOnHookPort(app, port)
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(server.listening).toBe(false)
    await close(holder)
    await listening

    expect(server.listening).toBe(true)
  })

  it('names the port once the wait is over', async () => {
    const port = await hold()
    const { app } = applicationOn()

    await expect(listenOnHookPort(app, port, 100)).rejects.toThrow(`port ${port} stayed taken`)
  })
})
