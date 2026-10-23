import { createParamDecorator } from '@nestjs/common'
import { TenantContextService } from '../als/tenant-context.service'

/** The account JwtAuthGuard verified for this request. */
export const CurrentAccount = createParamDecorator(() => {
  const { account } = TenantContextService.store()
  if (!account) throw new Error('No account in the request store: JwtAuthGuard did not run')
  return account
})
