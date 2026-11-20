import { adminContract } from './admin'
import { authContract } from './auth'
import { brandingContract } from './branding'
import { orderLinksContract } from './buyer-orders'
import { catalogContract } from './catalog'
import { checkoutContract, paymentsContract } from './checkout'
import { discountCodesContract } from './discount-codes'
import { editionsContract } from './editions'
import { engagementContract } from './engagement'
import { healthContract } from './health'
import { invitationsContract } from './invitations'
import { meContract } from './me'
import { ordersContract } from './orders'
import { programContract } from './program'
import { publicContract } from './public'
import { scannerContract, scannersContract } from './scanner'
import { shopContract } from './shop'
import { tenantsContract } from './tenants'

/** The API contract: the API implements it, clients call through it. */
export const contract = {
  health: healthContract,
  auth: authContract,
  me: meContract,
  tenants: tenantsContract,
  branding: brandingContract,
  editions: editionsContract,
  invitations: invitationsContract,
  program: programContract,
  public: publicContract,
  shop: shopContract,
  catalog: catalogContract,
  checkout: checkoutContract,
  orders: ordersContract,
  orderLinks: orderLinksContract,
  discountCodes: discountCodesContract,
  scanners: scannersContract,
  scanner: scannerContract,
  payments: paymentsContract,
  engagement: engagementContract,
  admin: adminContract,
}

export type Contract = typeof contract

export * from './admin'
export * from './auth'
export * from './auth-mfa'
export * from './branding'
export * from './buyer-orders'
export * from './catalog'
export * from './checkout'
export * from './common'
export * from './discount-codes'
export * from './edition-shop'
export * from './editions'
export * from './engagement'
export * from './errors'
export * from './files'
export * from './health'
export * from './invitations'
export * from './me'
export * from './orders'
export * from './program'
export * from './public'
export * from './scanner'
export * from './shop'
export * from './tenants'
