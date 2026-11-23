import { Module } from '@nestjs/common'
import { BrandingModule } from '../branding/branding.module'
import { CatalogModule } from '../catalog/catalog.module'
import { ShopModule } from '../shop/shop.module'
import { PublicConvention } from './public-convention'
import { PublicController } from './public.controller'
import { PublicRepository } from './public.repository'

@Module({
  imports: [BrandingModule, ShopModule, CatalogModule],
  controllers: [PublicController],
  providers: [PublicRepository, PublicConvention],
  // The shop's public routes find their convention and their published edition the same way.
  exports: [PublicRepository, PublicConvention],
})
export class PublicModule {}
