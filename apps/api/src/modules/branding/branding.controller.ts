import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { RequireTenant } from '../../common/decorators/require-tenant.decorator'
import { FilesService } from '../files/files.service'
import { LOGO_KIND } from '../files/kinds'
import { TakesFile } from '../files/takes-file.decorator'
import { LogoRepository } from './logo.repository'

/** A convention's branding, behind the branding permission: today its logo. */
@Controller()
export class BrandingController {
  constructor(
    private readonly logos: LogoRepository,
    private readonly files: FilesService,
  ) {}

  @Implement(contract.branding.get)
  @RequireTenant('branding', 'read')
  get() {
    return implement(contract.branding.get).handler(async () => ({
      logo: await this.logos.find(),
    }))
  }

  /**
   * The new logo takes the place of the old in one transaction: the old pointer and its file go,
   * the file just received is kept and pointed at. The old file's objects leave the bucket after
   * the commit, and a rollback keeps the logo the convention had.
   */
  @Implement(contract.branding.putLogo)
  @RequireTenant('branding', 'write')
  @TakesFile(LOGO_KIND)
  putLogo() {
    return implement(contract.branding.putLogo).handler(async () => {
      await this.release()
      const kept = await this.files.keep(this.files.received())
      await this.logos.set(kept.id)
      return { logo: await this.logos.find() }
    })
  }

  @Implement(contract.branding.removeLogo)
  @RequireTenant('branding', 'write')
  removeLogo() {
    return implement(contract.branding.removeLogo).handler(() => this.release())
  }

  private async release() {
    const fileId = await this.logos.clear()
    if (fileId) await this.files.release(LOGO_KIND, fileId)
  }
}
