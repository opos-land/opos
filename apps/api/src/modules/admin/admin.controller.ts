import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { AdminDbService } from './admin-db.service'
import { AdminProfilesDb } from './admin-profiles.db'
import { ProfileModerationService } from './profile-moderation.service'
import { RequireAdmin } from './require-admin.decorator'
import { TwoFactorResetService } from './two-factor-reset.service'
import { FilesService } from '../files/files.service'

// The routes of the admin application: @RequireAdmin applies JwtAuthGuard and AdminGuard. None
// opens a tenant transaction, and none grants the admin role or takes it away.
@Controller()
export class AdminController {
  constructor(
    private readonly admin: AdminDbService,
    private readonly context: TenantContextService,
    private readonly limiter: RouteRateLimiter,
    private readonly twoFactor: TwoFactorResetService,
    private readonly files: FilesService,
    private readonly profiles: AdminProfilesDb,
    private readonly moderation: ProfileModerationService,
  ) {}

  /** The admin of the request, after one more write on the counter the admin's writes share. */
  private async writing(): Promise<string> {
    const { id } = this.context.account()
    await this.limiter.consume('adminWrites', `account:${id}`)
    return id
  }

  @Implement(contract.admin.tenants)
  @RequireAdmin()
  tenants() {
    return implement(contract.admin.tenants).handler(() => this.admin.tenants())
  }

  @Implement(contract.admin.tenant)
  @RequireAdmin()
  tenant() {
    return implement(contract.admin.tenant).handler(({ input }) =>
      this.admin.tenant(input.params.tenantId),
    )
  }

  @Implement(contract.admin.createTenant)
  @RequireAdmin()
  createTenant() {
    return implement(contract.admin.createTenant).handler(async ({ input }) =>
      this.admin.createTenant(input.body, await this.writing()),
    )
  }

  @Implement(contract.admin.renameTenant)
  @RequireAdmin()
  renameTenant() {
    return implement(contract.admin.renameTenant).handler(async ({ input }) =>
      this.admin.renameTenant(input.params.tenantId, input.body.slug, await this.writing()),
    )
  }

  @Implement(contract.admin.suspendTenant)
  @RequireAdmin()
  suspendTenant() {
    return implement(contract.admin.suspendTenant).handler(async ({ input }) =>
      this.admin.setSuspended(input.params.tenantId, true, await this.writing()),
    )
  }

  @Implement(contract.admin.restoreTenant)
  @RequireAdmin()
  restoreTenant() {
    return implement(contract.admin.restoreTenant).handler(async ({ input }) =>
      this.admin.setSuspended(input.params.tenantId, false, await this.writing()),
    )
  }

  @Implement(contract.admin.deleteTenant)
  @RequireAdmin({ fresh: true })
  deleteTenant() {
    return implement(contract.admin.deleteTenant).handler(async ({ input }) => {
      await this.admin.deleteTenant(input.params.tenantId, await this.writing())
      // Its files' rows went with it; their objects go now, or with the sweep.
      await this.files.forgetTenant(input.params.tenantId)
    })
  }

  @Implement(contract.admin.resetTwoFactor)
  @RequireAdmin({ fresh: true })
  resetTwoFactor() {
    return implement(contract.admin.resetTwoFactor).handler(async ({ input }) =>
      this.twoFactor.reset(input.body.email, await this.writing()),
    )
  }

  @Implement(contract.admin.actions)
  @RequireAdmin()
  actions() {
    return implement(contract.admin.actions).handler(({ input }) => this.admin.actions(input.query))
  }

  // The admin's side of the public profile (docs/specs/0016-public-profile.md, T1-T14). Taking a
  // profile down and restoring it reverse each other on the same screen, so neither asks for a
  // fresh sign-in.

  @Implement(contract.admin.profileReports)
  @RequireAdmin()
  profileReports() {
    return implement(contract.admin.profileReports).handler(({ input }) =>
      this.profiles.reports(input.query),
    )
  }

  @Implement(contract.admin.profileReport)
  @RequireAdmin()
  profileReport() {
    return implement(contract.admin.profileReport).handler(({ input }) =>
      this.profiles.report(input.params.reportId),
    )
  }

  @Implement(contract.admin.closeProfileReport)
  @RequireAdmin()
  closeProfileReport() {
    return implement(contract.admin.closeProfileReport).handler(async ({ input }) =>
      this.moderation.closeReport(input.params.reportId, await this.writing()),
    )
  }

  @Implement(contract.admin.takenDownProfiles)
  @RequireAdmin()
  takenDownProfiles() {
    return implement(contract.admin.takenDownProfiles).handler(() => this.profiles.takenDown())
  }

  /** A lookup, which changes nothing and leaves no entry; it counts with the admin's writes. */
  @Implement(contract.admin.findAccount)
  @RequireAdmin()
  findAccount() {
    return implement(contract.admin.findAccount).handler(async ({ input }) => {
      await this.writing()
      return { accountId: await this.profiles.findAccount(input.body.email) }
    })
  }

  @Implement(contract.admin.profile)
  @RequireAdmin()
  profile() {
    return implement(contract.admin.profile).handler(({ input }) =>
      this.profiles.profile(input.params.accountId),
    )
  }

  @Implement(contract.admin.takeDownProfile)
  @RequireAdmin()
  takeDownProfile() {
    return implement(contract.admin.takeDownProfile).handler(async ({ input }) =>
      this.moderation.takeDown(input.params.accountId, input.body, await this.writing()),
    )
  }

  @Implement(contract.admin.restoreProfile)
  @RequireAdmin()
  restoreProfile() {
    return implement(contract.admin.restoreProfile).handler(async ({ input }) =>
      this.moderation.restore(input.params.accountId, await this.writing()),
    )
  }

  @Implement(contract.admin.clearAccountName)
  @RequireAdmin()
  clearAccountName() {
    return implement(contract.admin.clearAccountName).handler(async ({ input }) =>
      this.moderation.clearName(input.params.accountId, input.body.reason, await this.writing()),
    )
  }
}
