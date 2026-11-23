import { Trans, useLingui } from '@lingui/react/macro'
import { usePageTitle } from '../../../shared/lib/page-title'
import { NoPermissionView, PageHeader } from '../../../shared/ui'
import { atLeast, useCurrentTenant } from '../../tenants'
import { ProviderAccountSection } from '../components/provider-account-section'
import { SellerSection } from '../components/seller-section'

/**
 * What the convention sets once before any of its editions sells (`/settings/shop`): the seller's
 * details and its own payment provider account. Reading needs shop>=read, changing shop=write.
 * What one edition sets is in the edition's own menu.
 */
export function ShopSettingsPage() {
  const { t } = useLingui()
  const { tenant, access } = useCurrentTenant()
  usePageTitle(t`Shop`, tenant.name)
  const canWrite = atLeast(access.shop, 'write')

  if (!atLeast(access.shop, 'read')) return <NoPermissionView />

  return (
    <>
      <PageHeader title={<Trans>Shop</Trans>} description={tenant.name} />
      <SellerSection canWrite={canWrite} />
      <ProviderAccountSection canWrite={canWrite} />
    </>
  )
}
