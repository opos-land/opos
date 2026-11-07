import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Database = PostgresJsDatabase<typeof schema> & { $client: postgres.Sql }

export interface ConnectionOptions {
  max?: number
}

/**
 * How long a runtime session may let a statement, an idle transaction and a whole transaction hold
 * a connection. `pnpm db:roles` writes them as settings of the runtime roles, so a
 * session has them from its first query, through a pooler too; past a bound Postgres cancels the
 * statement or ends the session.
 */
export const RUNTIME_TIMEOUTS = {
  statement_timeout: '15s',
  idle_in_transaction_session_timeout: '15s',
  transaction_timeout: '30s',
}

function connect(url: string, applicationName: string, options: ConnectionOptions): Database {
  const client = postgres(url, {
    max: options.max ?? 10,
    connection: { application_name: applicationName },
    onnotice: () => {},
  })
  return drizzle({ client, schema, casing: 'snake_case' })
}

export const appDb = (url: string, options: ConnectionOptions = {}) =>
  connect(url, 'opos-app', options)

export const globalDb = (url: string, options: ConnectionOptions = {}) =>
  connect(url, 'opos-app-global', options)

export const migrationDb = (url: string, options: ConnectionOptions = {}) =>
  connect(url, 'opos-migration', { max: 1, ...options })
