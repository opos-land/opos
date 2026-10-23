import { initContract } from '@ts-rest/core'
import { healthContract } from './health'
import { meContract } from './me'

const c = initContract()

export const contract = c.router(
  {
    health: healthContract,
    me: meContract,
  },
  { strictStatusCodes: true },
)

export * from './common'
export * from './errors'
export * from './health'
export * from './me'
