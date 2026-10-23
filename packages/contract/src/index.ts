import { initContract } from '@ts-rest/core'
import { healthContract } from './health'
import { meContract } from './me'
import { tenantsContract } from './tenants'

const c = initContract()

export const contract = c.router(
  {
    health: healthContract,
    me: meContract,
    tenants: tenantsContract,
  },
  { strictStatusCodes: true },
)

export * from './common'
export * from './errors'
export * from './health'
export * from './me'
export * from './tenants'
