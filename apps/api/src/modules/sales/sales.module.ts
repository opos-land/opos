import { Module } from '@nestjs/common'
import { CatalogModule } from '../catalog/catalog.module'
import { SalesController } from './sales.controller'
import { SalesRepository } from './sales.repository'
import { SalesService } from './sales.service'

/** The reports of an edition's sales (docs/specs/0010-sales-reports.md). */
@Module({
  imports: [CatalogModule],
  controllers: [SalesController],
  providers: [SalesRepository, SalesService],
})
export class SalesModule {}
