import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Database = PostgresJsDatabase<typeof schema> & { $client: postgres.Sql }

export interface ConnectionOptions {
  max?: number
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
  connect(url, 'opos-migrator', { max: 1, ...options })
