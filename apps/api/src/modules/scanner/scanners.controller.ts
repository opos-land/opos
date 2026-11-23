import { Controller } from '@nestjs/common'
import { contract, type Scanner } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RequireEdition } from '../../common/decorators/require-edition.decorator'
import { decideTenant } from '../../common/permissions/permissions'
import { ScannerService } from './scanner.service'
import { ScannersRepository } from './scanners.repository'

/**
 * The scanners of an edition as its orgs manage them, behind the tickets permission of the
 * edition (docs/specs/0007-scanner.md, D2-D11).
 */
@Controller()
export class ScannersController {
  constructor(
    private readonly scanners: ScannersRepository,
    private readonly service: ScannerService,
    private readonly context: TenantContextService,
  ) {}

  /**
   * Who is in the team, and under which address, is behind the settings permission: an org who
   * reads the tickets alone is told the address behind its own scanners, and of another's only
   * that an org enabled it.
   */
  private shown<T extends Scanner>(scanner: T): T {
    if (decideTenant(this.context.membership(), 'settings', 'read') === 'allow') return scanner
    const own = this.context.account().email
    return { ...scanner, enabledBy: scanner.enabledBy === own ? own : null }
  }

  @Implement(contract.scanners.list)
  @RequireEdition('tickets', 'read')
  list() {
    return implement(contract.scanners.list).handler(async ({ input }) =>
      (await this.scanners.list(input.params.editionId)).map((scanner) => this.shown(scanner)),
    )
  }

  /** One scanner with what it handed out: the names on its orders are behind the same permission. */
  @Implement(contract.scanners.get)
  @RequireEdition('tickets', 'read')
  get() {
    return implement(contract.scanners.get).handler(async ({ input }) => {
      const { editionId, scannerId } = input.params
      const scanner = await this.scanners.get(editionId, scannerId)
      return this.shown({
        ...scanner,
        handOuts: await this.scanners.handOuts(editionId, scanner.id),
      })
    })
  }

  /** Any org with tickets write access pairs any scanner of the edition again, whoever enabled it. */
  @Implement(contract.scanners.renewPairing)
  @RequireEdition('tickets', 'write')
  renewPairing() {
    return implement(contract.scanners.renewPairing).handler(async ({ input }) =>
      this.shown(await this.service.pairAgain(input.params.editionId, input.params.scannerId)),
    )
  }

  @Implement(contract.scanners.create)
  @RequireEdition('tickets', 'write')
  create() {
    return implement(contract.scanners.create).handler(({ input }) =>
      this.service.enable(input.params.editionId, input.body),
    )
  }

  /** Any org with tickets write access revokes any scanner of the edition, whoever enabled it. */
  @Implement(contract.scanners.revoke)
  @RequireEdition('tickets', 'write')
  revoke() {
    return implement(contract.scanners.revoke).handler(async ({ input }) => {
      const { editionId, scannerId } = input.params
      await this.scanners.revoke(editionId, scannerId, new Date())
      return this.scanners.get(editionId, scannerId)
    })
  }
}
