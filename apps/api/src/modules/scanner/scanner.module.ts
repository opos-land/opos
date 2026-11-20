import { Module } from '@nestjs/common'
import { ScannerController } from './scanner.controller'
import { ScannerGuard } from './scanner.guard'
import { ScannerService } from './scanner.service'
import { ScannersController } from './scanners.controller'
import { ScannersRepository } from './scanners.repository'
import { ScansRepository } from './scans.repository'

/** The scanners of an edition and what a scanner does (docs/specs/0007-scanner.md). */
@Module({
  controllers: [ScannersController, ScannerController],
  providers: [ScannersRepository, ScansRepository, ScannerService, ScannerGuard],
})
export class ScannerModule {}
