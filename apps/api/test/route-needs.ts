// What every tenant route of the contract needs, shared by the tests that call
// each route by its need: route-requirements.test.ts and the concurrent writes of
// tenants-editions.test.ts.

export type Level = 'read' | 'write'
export type Need =
  /** Signed in, with or without a place in the team. */
  | { scope: 'account' }
  | { scope: 'member' }
  | { scope: 'tenant'; resource: 'settings' | 'branding' | 'shop'; level: Level }
  | { scope: 'edition'; resource: 'program' | 'websiteContent' | 'tickets'; level: Level }

const anyMember: Need = { scope: 'member' }
const anyAccount: Need = { scope: 'account' }
const settings = (level: Level): Need => ({ scope: 'tenant', resource: 'settings', level })
const branding = (level: Level): Need => ({ scope: 'tenant', resource: 'branding', level })
const shop = (level: Level): Need => ({ scope: 'tenant', resource: 'shop', level })
const program = (level: Level): Need => ({ scope: 'edition', resource: 'program', level })
const tickets = (level: Level): Need => ({ scope: 'edition', resource: 'tickets', level })

/** Tenant routes and what each needs; a head passes every one (PRODUCT.md 5). */
export const tenantRequirements: Record<string, Need> = {
  'tenants.current': anyMember,
  'tenants.update': settings('write'),
  'tenants.members.list': settings('read'),
  'tenants.members.invite': settings('write'),
  'tenants.members.update': settings('write'),
  'tenants.members.remove': settings('write'),
  'branding.get': branding('read'),
  'branding.putLogo': branding('write'),
  'branding.removeLogo': branding('write'),
  'shop.seller.get': shop('read'),
  'shop.seller.put': shop('write'),
  'shop.providerAccount.get': shop('read'),
  'shop.providerAccount.put': shop('write'),
  'shop.providerAccount.remove': shop('write'),
  'shop.edition.get': tickets('read'),
  'shop.edition.update': tickets('write'),
  'shop.edition.open': tickets('write'),
  'shop.edition.close': tickets('write'),
  'shop.documents.list': tickets('read'),
  'shop.documents.create': tickets('write'),
  'shop.documents.update': tickets('write'),
  'shop.documents.publishVersion': tickets('write'),
  'shop.documents.remove': tickets('write'),
  'shop.consents.list': tickets('read'),
  'shop.consents.create': tickets('write'),
  'shop.consents.update': tickets('write'),
  'shop.consents.remove': tickets('write'),
  'catalog.addOns.list': tickets('read'),
  'catalog.addOns.create': tickets('write'),
  'catalog.addOns.update': tickets('write'),
  'catalog.addOns.remove': tickets('write'),
  'catalog.addOns.putPicture': tickets('write'),
  'catalog.addOns.removePicture': tickets('write'),
  'catalog.addOns.file': tickets('read'),
  'catalog.customFields.list': tickets('read'),
  'catalog.customFields.create': tickets('write'),
  'catalog.customFields.update': tickets('write'),
  'catalog.customFields.remove': tickets('write'),
  'catalog.merchandise.list': tickets('read'),
  'catalog.merchandise.create': tickets('write'),
  'catalog.merchandise.update': tickets('write'),
  'catalog.merchandise.remove': tickets('write'),
  'catalog.merchandise.putVariants': tickets('write'),
  'catalog.merchandise.putStock': tickets('write'),
  'catalog.merchandise.addPicture': tickets('write'),
  'catalog.merchandise.removePicture': tickets('write'),
  'catalog.merchandise.putSizeChart': tickets('write'),
  'catalog.merchandise.removeSizeChart': tickets('write'),
  'catalog.merchandise.file': tickets('read'),
  'catalog.ticketTypes.list': tickets('read'),
  'catalog.ticketTypes.create': tickets('write'),
  'catalog.ticketTypes.update': tickets('write'),
  'catalog.ticketTypes.remove': tickets('write'),
  'editions.list': anyMember,
  'editions.create': settings('write'),
  'editions.get': anyMember,
  'editions.update': settings('write'),
  'editions.remove': settings('write'),
  'editions.activate': settings('write'),
  'editions.members.list': settings('read'),
  'editions.members.put': settings('write'),
  'editions.members.remove': settings('write'),
  'program.list': program('read'),
  'program.create': program('write'),
  'program.update': program('write'),
  'program.remove': program('write'),
  'program.speakers.put': program('write'),
  'orders.list': tickets('read'),
  'orders.get': tickets('read'),
  'orders.emails': tickets('read'),
  'orders.email': tickets('read'),
  'orders.createManual': tickets('write'),
  'orders.updateHolder': tickets('write'),
  'orders.changeEmail': tickets('write'),
  'orders.swapVariant': tickets('write'),
  'orders.cancel': tickets('write'),
  'orders.markPaid': tickets('write'),
  'orders.decline': tickets('write'),
  'orders.resendConfirmation': tickets('write'),
  'orders.handOut': tickets('write'),
  'orders.takeBackHandOut': tickets('write'),
  'orders.productionNumbers': tickets('read'),
  'orders.productionNumbersExport': tickets('read'),
  // The reports of an edition's sales (docs/specs/0010-sales-reports.md).
  'sales.get': tickets('read'),
  'sales.ticketHolders': tickets('read'),
  'sales.merchandisePickList': tickets('read'),
  'sales.payments': tickets('read'),
  'discountCodes.list': tickets('read'),
  'discountCodes.create': tickets('write'),
  'discountCodes.update': tickets('write'),
  'discountCodes.remove': tickets('write'),
  'scanners.list': tickets('read'),
  'scanners.get': tickets('read'),
  'scanners.create': tickets('write'),
  'scanners.renewPairing': tickets('write'),
  'scanners.revoke': tickets('write'),
  'checkout.placeOrder': anyAccount,
  'checkout.startPaymentAttempt': anyAccount,
  // An account's own orders in the convention (docs/specs/0009-buyer-self-service.md).
  'myOrders.list': anyAccount,
  'myOrders.resendConfirmation': anyAccount,
  'engagement.like': anyAccount,
  'engagement.unlike': anyAccount,
}
