import { Module } from '@nestjs/common'
import { MailModule } from '../mail/mail.module'
import { MyProfileController } from './my-profile.controller'
import { MyProfileRepository } from './my-profile.repository'
import { ProfileNotices } from './profile-notices.service'
import { ProfileReportsCleanup, ProfileReportsRepository } from './profile-reports.service'
import { PublicProfileController } from './public-profile.controller'

/** The public profile (docs/specs/0016-public-profile.md). */
@Module({
  imports: [MailModule],
  controllers: [MyProfileController, PublicProfileController],
  providers: [MyProfileRepository, ProfileReportsRepository, ProfileReportsCleanup, ProfileNotices],
  exports: [ProfileNotices],
})
export class ProfilesModule {}
