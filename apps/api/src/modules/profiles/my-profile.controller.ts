import { Controller, UseGuards } from '@nestjs/common'
import { contract, type MyProfile } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { FilesService } from '../files/files.service'
import { AVATAR_KIND } from '../files/kinds'
import { TakesFile } from '../files/takes-file.decorator'
import { MyProfileRepository } from './my-profile.repository'

/**
 * The label an avatar is kept under: the name it was uploaded under reaches no reader, and a file
 * for everyone would hand it out (docs/specs/0016-public-profile.md, Files).
 */
const AVATAR_LABEL = 'avatar'

/** The profile of the signed-in account: what it holds, its avatar, its publication. */
@Controller()
@UseGuards(JwtAuthGuard)
export class MyProfileController {
  constructor(
    private readonly profiles: MyProfileRepository,
    private readonly files: FilesService,
    private readonly context: TenantContextService,
  ) {}

  /** Runs a change in the account's own transaction and answers the profile as it leaves it. */
  private change(apply: () => Promise<unknown>): Promise<MyProfile> {
    return this.context.accountTransaction(async () => {
      await apply()
      return this.profiles.find()
    })
  }

  @Implement(contract.profile.get)
  get() {
    return implement(contract.profile.get).handler(() => this.profiles.find())
  }

  @Implement(contract.profile.update)
  update() {
    return implement(contract.profile.update).handler(({ input }) =>
      this.change(() => this.profiles.setContent(input.body)),
    )
  }

  /**
   * The new avatar takes the place of the old in one transaction: the old pointer and its file
   * go, the file just received is kept and pointed at. The old file's objects leave the bucket
   * after the commit, and a rollback keeps the avatar the account had.
   */
  @Implement(contract.profile.putAvatar)
  @TakesFile(AVATAR_KIND)
  putAvatar() {
    return implement(contract.profile.putAvatar).handler(() =>
      this.change(async () => {
        await this.releaseAvatar()
        const kept = await this.files.keep({ ...this.files.received(), name: AVATAR_LABEL })
        await this.profiles.setAvatar(kept.id)
      }),
    )
  }

  @Implement(contract.profile.removeAvatar)
  removeAvatar() {
    return implement(contract.profile.removeAvatar).handler(() =>
      this.context.accountTransaction(() => this.releaseAvatar()),
    )
  }

  @Implement(contract.profile.publish)
  publish() {
    return implement(contract.profile.publish).handler(() =>
      this.change(() => this.profiles.publish()),
    )
  }

  @Implement(contract.profile.withdraw)
  withdraw() {
    return implement(contract.profile.withdraw).handler(() =>
      this.change(() => this.profiles.withdraw()),
    )
  }

  @Implement(contract.profile.requestReview)
  requestReview() {
    return implement(contract.profile.requestReview).handler(() =>
      this.change(() => this.profiles.requestReview()),
    )
  }

  private async releaseAvatar() {
    const fileId = await this.profiles.clearAvatar()
    if (fileId) await this.files.release(AVATAR_KIND, fileId)
  }
}
