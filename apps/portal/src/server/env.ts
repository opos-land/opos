import { z } from 'zod'

const unset = (value: unknown) => (value === '' ? undefined : value)

const schema = z.object({
  /** The port the server listens on, inside the deployment's network. */
  PORT: z.preprocess(unset, z.coerce.number().int().min(1).max(65535).default(8081)),
  /** The portal's public address: every page's own address is given under its origin. */
  PORTAL_URL: z.url(),
  /** The API's public address, which a browser loads the pictures of a head from. */
  API_URL: z.url(),
  /** Where the server itself reaches the API, when that is not its public address. */
  API_INTERNAL_URL: z.preprocess(unset, z.url().optional()),
  /** The portal's built document, which every answer is made from. */
  INDEX_HTML: z.preprocess(unset, z.string().default('index.html')),
})

/** The server's settings, from its environment; it does not start with one that lacks an address. */
export function readEnv(source: Record<string, string | undefined>) {
  const parsed = schema.safeParse(source)
  if (!parsed.success) {
    const invalid = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    throw new Error(`Invalid environment\n${invalid.join('\n')}`)
  }
  const env = parsed.data
  return {
    port: env.PORT,
    origin: new URL(env.PORTAL_URL).origin,
    apiUrl: env.API_URL,
    internalApiUrl: env.API_INTERNAL_URL ?? env.API_URL,
    indexHtml: env.INDEX_HTML,
  }
}
