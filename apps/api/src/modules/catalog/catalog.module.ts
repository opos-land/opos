import { Module } from '@nestjs/common'
import { AddOnsController } from './add-ons.controller'
import { AddOnsRepository } from './add-ons.repository'
import { CustomFieldsController } from './custom-fields.controller'
import { CustomFieldsRepository } from './custom-fields.repository'

/** What an edition sells and on what terms (docs/specs/0003-catalog.md). */
@Module({
  controllers: [AddOnsController, CustomFieldsController],
  providers: [AddOnsRepository, CustomFieldsRepository],
})
export class CatalogModule {}
