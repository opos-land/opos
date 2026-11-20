import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { GlobalDbService } from '../../common/database/global-db.service'
import { hashOf } from '../checkout/codes'
import { scannerRevoked } from './scanner.errors'

/**
 * Names the scanner of a request by the device's token in `Authorization: Bearer`, before
 * anything of the request is read: no token and an unknown one answer alike, and tell nothing
 * of the body. The token is looked up across tenants by its hash, which answers the scanner and
 * its tenant alone; whether the device still stands, and still holds that token, is judged in
 * that tenant's transaction.
 */
@Injectable()
export class ScannerGuard implements CanActivate {
  constructor(
    private readonly global: GlobalDbService,
    private readonly context: TenantContextService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const { headers } = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>()
    const authorization = typeof headers.authorization === 'string' ? headers.authorization : ''
    const token = /^Bearer (\S+)$/.exec(authorization)?.[1]
    if (!token) throw scannerRevoked()
    const tokenHash = hashOf(token)
    const scanner = await this.global.scannerByToken(tokenHash)
    if (!scanner) throw scannerRevoked()
    this.context.setScanner({ ...scanner, tokenHash })
    return true
  }
}
