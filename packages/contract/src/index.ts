import { initContract } from '@ts-rest/core'
import { healthContract } from './health'

const c = initContract()

export const contract = c.router(
  {
    health: healthContract,
  },
  { strictStatusCodes: true },
)

export * from './common'
export * from './health'
