import { createServer } from 'node:net'
import { type NestExpressApplication } from '@nestjs/platform-express'

// Supabase Auth sends its send-email hook to host.docker.internal:<PORT>, so a test file that
// triggers emails runs the API on that one port (PLAN.md 15.1). Files run in parallel, so a file
// that finds the port taken waits for the file holding it to close its API.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Whether nothing listens on `port`: asked of a bare socket, since Nest logs an error for each refusal. */
const isFree = (port: number) =>
  new Promise<boolean>((resolve) => {
    const probe = createServer()
    probe.once('error', () => resolve(false))
    probe.listen(port, () => probe.close(() => resolve(true)))
  })

/** Listens on `port`, retrying while another test file holds it. */
export async function listenOnHookPort(
  app: NestExpressApplication,
  port: number,
  waitMs = 110_000,
) {
  const deadline = Date.now() + waitMs
  for (;;) {
    try {
      if (await isFree(port)) {
        await app.listen(port)
        return
      }
      if (Date.now() > deadline) throw new Error(`port ${port} stayed taken for ${waitMs} ms`)
    } catch (error) {
      // Another file took the port between the probe and the listen.
      if ((error as { code?: unknown } | null)?.code !== 'EADDRINUSE' || Date.now() > deadline) {
        throw error
      }
    }
    await sleep(250)
  }
}

/** The hook the file triggers needs time to start the API after waiting for the port. */
export const HOOK_PORT_TIMEOUT_MS = 120_000
