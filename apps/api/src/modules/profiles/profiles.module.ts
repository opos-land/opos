import { Module } from '@nestjs/common'
import { MyProfileController } from './my-profile.controller'
import { MyProfileRepository } from './my-profile.repository'
import { PublicProfileController } from './public-profile.controller'

/** The public profile (docs/specs/0016-public-profile.md). */
@Module({
  controllers: [MyProfileController, PublicProfileController],
  providers: [MyProfileRepository],
})
export class ProfilesModule {}
