import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { RequireEdition } from '../../common/decorators/require-edition.decorator'
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
  ) {}

  @Implement(contract.scanners.list)
  @RequireEdition('tickets', 'read')
  list() {
    return implement(contract.scanners.list).handler(({ input }) =>
      this.scanners.list(input.params.editionId),
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
