import { initContract } from '@ts-rest/core'
import { editionsContract } from './editions'
import { healthContract } from './health'
import { meContract } from './me'
import { tenantsContract } from './tenants'

const c = initContract()

export const contract = c.router(
  {
    health: healthContract,
    me: meContract,
    tenants: tenantsContract,
    editions: editionsContract,
  },
  { strictStatusCodes: true },
)

export * from './common'
export * from './editions'
export * from './errors'
export * from './health'
export * from './me'
export * from './tenants'
