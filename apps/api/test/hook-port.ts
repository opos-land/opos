import { createServer } from 'node:net'
import { type NestExpressApplication } from '@nestjs/platform-express'

// Supabase Auth sends its send-email hook to host.docker.internal:<PORT>, so a test file that
// triggers emails runs the API on that one port (PLAN.md 15.1). Files run in parallel, so a file
// that finds the port taken waits for the file holding it to close its API.

/** The test files that take turns on the port, each holding it for its whole run. */
export const HOOK_PORT_FILES = [
  'auth-endpoints.test.ts',
  'mfa-guard.test.ts',
  'send-email-hook.test.ts',
] as const

/** What one of those files may take on a loaded machine. */
const FILE_RUN_MS = 180_000

/** How long a file waits for the port: the whole run of every other file. */
export const HOOK_PORT_WAIT_MS = (HOOK_PORT_FILES.length - 1) * FILE_RUN_MS

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
  waitMs = HOOK_PORT_WAIT_MS,
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

/** The `beforeAll` of such a file also starts the API, before and after waiting for the port. */
export const HOOK_PORT_TIMEOUT_MS = HOOK_PORT_WAIT_MS + 30_000
