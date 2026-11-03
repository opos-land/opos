const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]']
const REMOTE_ENVS = ['dev', 'production']

/**
 * The URL of the postgres role, through which every db:* script connects (PLAN.md 11). It has no
 * default, and a host off the loopback interface needs the OPOS_ENV of its environment, so a
 * script never reaches a hosted project by accident. A refusal names the host, never the URL.
 */
export function migrationUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_MIGRATION_URL?.trim()
  if (!url) throw new Error('DATABASE_MIGRATION_URL is not set; run pnpm infra:init')

  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error('DATABASE_MIGRATION_URL is not a URL')
  }
  if (!LOOPBACK_HOSTS.includes(host) && !REMOTE_ENVS.includes(env.OPOS_ENV ?? '')) {
    throw new Error(
      `DATABASE_MIGRATION_URL names the remote host ${host}; OPOS_ENV must be dev or production to reach it`,
    )
  }
  return url
}
