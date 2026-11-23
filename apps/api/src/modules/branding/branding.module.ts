import { Module } from '@nestjs/common'
import { BrandingController } from './branding.controller'
import { LogoRepository } from './logo.repository'

@Module({
  controllers: [BrandingController],
  providers: [LogoRepository],
  exports: [LogoRepository],
})
export class BrandingModule {}
