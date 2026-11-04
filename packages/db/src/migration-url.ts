import postgres from 'postgres'

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]']
const REMOTE_ENVS = ['dev', 'production']

/** Every host on the loopback interface, or OPOS_ENV dev or production. Names the host, not the URL. */
function requireReachable(name: string, hosts: string[], env: NodeJS.ProcessEnv): void {
  if (REMOTE_ENVS.includes(env.OPOS_ENV ?? '')) return
  const remote = hosts.find((host) => !LOOPBACK_HOSTS.includes(host))
  if (remote === undefined) return
  throw new Error(
    `${name} names the remote host ${remote}; OPOS_ENV must be dev or production to reach it`,
  )
}

/** The URL of a service a db:* script reaches with `fetch`, so `new URL` reads its host as `fetch` does. */
export function reachableUrl(
  name: string,
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  let host: string
  try {
    host = new URL(value).hostname
  } catch {
    throw new Error(`${name} is not a URL`)
  }
  requireReachable(name, [host], env)
  return value
}

/**
 * Every host postgres.js would use for `url`, a host list and `PGHOST` for a URL naming none
 * included, asked of postgres.js itself: a client opens nothing until its first query. It cuts each
 * host at its first `:`, so `new URL` names a single IPv6 address, which comes back as `[` or `[2001`.
 */
function databaseHosts(url: string): string[] {
  const { host } = postgres(url).options
  return host.length === 1 && host[0]?.startsWith('[') ? [new URL(url).hostname] : host
}

/**
 * The URL of the postgres role, through which every db:* script connects (PLAN.md 11). It has no
 * default, and a host off the loopback interface needs the OPOS_ENV of its environment, so a
 * script never reaches a hosted project by accident.
 */
export function migrationUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_MIGRATION_URL?.trim()
  if (!url) throw new Error('DATABASE_MIGRATION_URL is not set; run pnpm infra:init')
  // postgres.js cuts the authority at its first @ and `new URL` at its last: with two, the guard and
  // the clients could read different hosts. The sentence repeats no part of the URL.
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(url)?.[1] ?? ''
  if (authority.split('@').length > 2) {
    throw new Error(
      'DATABASE_MIGRATION_URL holds more than one @ in its authority; percent-encode an @ in the password as %40',
    )
  }
  let hosts: string[]
  try {
    hosts = databaseHosts(url)
  } catch {
    throw new Error('DATABASE_MIGRATION_URL is not a URL')
  }
  requireReachable('DATABASE_MIGRATION_URL', hosts, env)
  return url
}
