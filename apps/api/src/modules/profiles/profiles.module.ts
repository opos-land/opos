import { Module } from '@nestjs/common'
import { MyProfileController } from './my-profile.controller'
import { MyProfileRepository } from './my-profile.repository'

/** The public profile (docs/specs/0016-public-profile.md). */
@Module({
  controllers: [MyProfileController],
  providers: [MyProfileRepository],
})
export class ProfilesModule {}
