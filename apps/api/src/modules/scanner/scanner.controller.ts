import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { AsScanner } from './scanner.guard'
import { ScannerService } from './scanner.service'

/**
 * What a phone asks as a scanner (docs/specs/0007-scanner.md): no session and no membership. The
 * pairing route takes a code in its body; the others take the device's token in
 * `Authorization: Bearer`, which ScannerGuard reads before anything of the request, counting the
 * request against the scanner, and the service judges the device behind it at every request.
 */
@Controller()
export class ScannerController {
  constructor(private readonly service: ScannerService) {}

  @Implement(contract.scanner.pair)
  pair() {
    return implement(contract.scanner.pair).handler(({ input }) =>
      this.service.pair(input.body.code),
    )
  }

  @Implement(contract.scanner.scan)
  @AsScanner('scannerScans')
  scan() {
    return implement(contract.scanner.scan).handler(({ input }) =>
      this.service.scan(input.body.code),
    )
  }

  @Implement(contract.scanner.handOut)
  @AsScanner('scannerHandOuts')
  handOut() {
    return implement(contract.scanner.handOut).handler(({ input }) =>
      this.service.handOut(input.body),
    )
  }
}
