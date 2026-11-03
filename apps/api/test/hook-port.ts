import { type NestExpressApplication } from '@nestjs/platform-express'

// Supabase Auth sends its send-email hook to host.docker.internal:<PORT>, so a test file that
// triggers emails runs the API on that one port (PLAN.md 15.1). Files run in parallel, so a file
// that finds the port taken waits for the file holding it to close its API.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Listens on `port`, retrying while another test file holds it. */
export async function listenOnHookPort(
  app: NestExpressApplication,
  port: number,
  waitMs = 110_000,
) {
  const deadline = Date.now() + waitMs
  for (;;) {
    try {
      await app.listen(port)
      return
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code !== 'EADDRINUSE' || Date.now() > deadline) {
        throw error
      }
      await sleep(250)
    }
  }
}

/** The hook the file triggers needs time to start the API after waiting for the port. */
export const HOOK_PORT_TIMEOUT_MS = 120_000
