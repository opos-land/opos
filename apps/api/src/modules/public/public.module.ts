import { Module } from '@nestjs/common'
import { PublicController } from './public.controller'
import { PublicRepository } from './public.repository'

@Module({
  controllers: [PublicController],
  providers: [PublicRepository],
})
export class PublicModule {}
