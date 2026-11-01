import { editionsContract } from './editions'
import { healthContract } from './health'
import { invitationsContract } from './invitations'
import { meContract } from './me'
import { programContract } from './program'
import { publicContract } from './public'
import { tenantsContract } from './tenants'

/** The API contract (PLAN.md 5): the API implements it, clients call through it. */
export const contract = {
  health: healthContract,
  me: meContract,
  tenants: tenantsContract,
  editions: editionsContract,
  invitations: invitationsContract,
  program: programContract,
  public: publicContract,
}

export type Contract = typeof contract

export * from './common'
export * from './editions'
export * from './errors'
export * from './health'
export * from './invitations'
export * from './me'
export * from './program'
export * from './public'
export * from './tenants'
