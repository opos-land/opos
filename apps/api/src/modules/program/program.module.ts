import { Module } from '@nestjs/common'
import { ProgramController } from './program.controller'
import { ProgramRepository } from './program.repository'

@Module({
  controllers: [ProgramController],
  providers: [ProgramRepository],
})
export class ProgramModule {}
