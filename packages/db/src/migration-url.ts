const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]']
const REMOTE_ENVS = ['dev', 'production']

/**
 * The URL of a service a db:* script reaches, as long as it names the loopback interface or
 * OPOS_ENV is dev or production. A refusal names the host, never the URL.
 *
 * postgres.js takes the text after the first `@` of the authority as a list of hosts and connects
 * to the first, where `new URL()` reads the last `@` and the list as one host name. An authority
 * with a `,` or a second `@` is refused, so both readings agree on the host that is checked.
 */
export function reachableUrl(
  name: string,
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const authority = value.slice(value.indexOf('://') + 3).split(/[/?#]/)[0] ?? ''
  if (authority.includes(',') || authority.split('@').length > 2) {
    throw new Error(`${name} has a host list or more than one @; name a single host`)
  }

  let host: string
  try {
    host = new URL(value).hostname
  } catch {
    throw new Error(`${name} is not a URL`)
  }
  if (!LOOPBACK_HOSTS.includes(host) && !REMOTE_ENVS.includes(env.OPOS_ENV ?? '')) {
    throw new Error(
      `${name} names the remote host ${host}; OPOS_ENV must be dev or production to reach it`,
    )
  }
  return value
}

/**
 * The URL of the postgres role, through which every db:* script connects (PLAN.md 11). It has no
 * default, and a host off the loopback interface needs the OPOS_ENV of its environment, so a
 * script never reaches a hosted project by accident.
 */
export function migrationUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_MIGRATION_URL?.trim()
  if (!url) throw new Error('DATABASE_MIGRATION_URL is not set; run pnpm infra:init')
  return reachableUrl('DATABASE_MIGRATION_URL', url, env)
}
