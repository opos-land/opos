import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

export type Database = PostgresJsDatabase & { $client: postgres.Sql }

export interface ConnectionOptions {
  max?: number
}

function connect(url: string, applicationName: string, options: ConnectionOptions): Database {
  const client = postgres(url, {
    max: options.max ?? 10,
    connection: { application_name: applicationName },
    onnotice: () => {},
  })
  return drizzle({ client })
}

export const appDb = (url: string, options: ConnectionOptions = {}) =>
  connect(url, 'opos-app', options)

export const globalDb = (url: string, options: ConnectionOptions = {}) =>
  connect(url, 'opos-app-global', options)

export const migrationDb = (url: string, options: ConnectionOptions = {}) =>
  connect(url, 'opos-migrator', { max: 1, ...options })
