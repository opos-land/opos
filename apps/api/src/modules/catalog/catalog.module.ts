import { Module } from '@nestjs/common'
import { AddOnsController } from './add-ons.controller'
import { AddOnsRepository } from './add-ons.repository'
import { CustomFieldsController } from './custom-fields.controller'
import { CustomFieldsRepository } from './custom-fields.repository'
import { MerchandiseController } from './merchandise.controller'
import { MerchandiseRepository } from './merchandise.repository'
import { TicketTypesController } from './ticket-types.controller'
import { TicketTypesRepository } from './ticket-types.repository'

/** What an edition sells and on what terms (docs/specs/0003-catalog.md). */
@Module({
  controllers: [
    TicketTypesController,
    AddOnsController,
    CustomFieldsController,
    MerchandiseController,
  ],
  providers: [
    TicketTypesRepository,
    AddOnsRepository,
    CustomFieldsRepository,
    MerchandiseRepository,
  ],
  // The public route that serves a shown item's pictures reads which file is for everyone.
  exports: [MerchandiseRepository],
})
export class CatalogModule {}
