import postgres from 'postgres'
import { migrationUrl } from '../migration-url'
import { applyRoles } from '../roles'

function required(name: string) {
  const value = process.env[name]
  if (!value) {
    console.error(`${name} is not set; run pnpm infra:init`)
    process.exit(1)
  }
  return value
}

const passwords = {
  app: required('OPOS_APP_PASSWORD'),
  appGlobal: required('OPOS_APP_GLOBAL_PASSWORD'),
}

const sql = postgres(migrationUrl(), { max: 1, onnotice: () => {} })

try {
  await sql.begin((tx) => applyRoles(tx, passwords))
  console.log('The runtime roles and the defaults of PLAN.md 4.6 are in place.')
} finally {
  await sql.end()
}
