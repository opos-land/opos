import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Database = PostgresJsDatabase<typeof schema> & { $client: postgres.Sql }

export interface ConnectionOptions {
  max?: number
}

/**
 * How long the runtime pools let a statement, an idle transaction and a whole transaction hold a
 * connection (PLAN.md 4.6). Sent as startup parameters, so every session has them from its first
 * query; past a bound Postgres cancels the statement or ends the session.
 */
export const RUNTIME_TIMEOUTS = {
  statement_timeout: '15s',
  idle_in_transaction_session_timeout: '15s',
  transaction_timeout: '30s',
}

function connect(
  url: string,
  applicationName: string,
  options: ConnectionOptions,
  parameters: Record<string, string> = {},
): Database {
  const client = postgres(url, {
    max: options.max ?? 10,
    connection: { application_name: applicationName, ...parameters },
    onnotice: () => {},
  })
  return drizzle({ client, schema, casing: 'snake_case' })
}

export const appDb = (url: string, options: ConnectionOptions = {}) =>
  connect(url, 'opos-app', options, RUNTIME_TIMEOUTS)

export const globalDb = (url: string, options: ConnectionOptions = {}) =>
  connect(url, 'opos-app-global', options, RUNTIME_TIMEOUTS)

export const migrationDb = (url: string, options: ConnectionOptions = {}) =>
  connect(url, 'opos-migrator', { max: 1, ...options })
