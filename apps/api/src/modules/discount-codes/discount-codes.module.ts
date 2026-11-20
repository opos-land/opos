import { Module } from '@nestjs/common'
import { DiscountCodesController } from './discount-codes.controller'
import { DiscountCodesRepository } from './discount-codes.repository'

/** The discount codes an org sets for an edition (docs/specs/0008-discount-codes.md). */
@Module({
  controllers: [DiscountCodesController],
  providers: [DiscountCodesRepository],
})
export class DiscountCodesModule {}
