import { Module } from '@nestjs/common'
import { BrandingModule } from '../branding/branding.module'
import { ShopModule } from '../shop/shop.module'
import { PublicController } from './public.controller'
import { PublicRepository } from './public.repository'

@Module({
  imports: [BrandingModule, ShopModule],
  controllers: [PublicController],
  providers: [PublicRepository],
})
export class PublicModule {}
