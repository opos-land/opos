import { Module } from '@nestjs/common'
import { BrandingModule } from '../branding/branding.module'
import { CatalogModule } from '../catalog/catalog.module'
import { ShopModule } from '../shop/shop.module'
import { PublicController } from './public.controller'
import { PublicRepository } from './public.repository'

@Module({
  imports: [BrandingModule, ShopModule, CatalogModule],
  controllers: [PublicController],
  providers: [PublicRepository],
})
export class PublicModule {}
