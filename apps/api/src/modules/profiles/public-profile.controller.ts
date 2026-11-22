import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { detectLocale } from '@opos/i18n'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { GlobalDbService } from '../../common/database/global-db.service'
import { notFound } from '../../common/errors/api-error'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { isUuid } from '../../common/uuid'
import { FilesService } from '../files/files.service'
import { AVATAR_KIND } from '../files/kinds'
import { ProfileNotices } from './profile-notices.service'
import { ProfileReportsRepository } from './profile-reports.service'

/**
 * What anyone reads of an account, with no sign-in and outside every tenant
 * (docs/adr/0071-let-anyone-read-the-profile-an-account-published.md): a published profile by its
 * public identifier, and an avatar by the identifier of its file. The account's own identifier
 * never comes in or goes out.
 */
@Controller()
export class PublicProfileController {
  constructor(
    private readonly global: GlobalDbService,
    private readonly files: FilesService,
    private readonly reports: ProfileReportsRepository,
    private readonly notices: ProfileNotices,
    private readonly limiter: RouteRateLimiter,
    private readonly context: TenantContextService,
  ) {}

  /**
   * A profile that is withdrawn, one taken down, one never published and an identifier that names
   * none answer alike, in the same words: nobody tells a hidden profile from one that never was.
   */
  @Implement(contract.public.profile)
  profile() {
    return implement(contract.public.profile).handler(async ({ input }) => {
      const { profileId } = input.params
      const profile = isUuid(profileId) ? await this.global.publishedProfile(profileId) : undefined
      if (!profile) throw notFound('profile')
      return profile
    })
  }

  /**
   * A variant of an avatar, for anyone. Only a file an avatar points at now is read: a replaced
   * one, a removed one and any file of another kind are not found. The account comes from the
   * pointer's own row, and the storage is read outside every transaction.
   */
  @Implement(contract.public.avatarFile)
  avatarFile() {
    return implement(contract.public.avatarFile).handler(async ({ input }) => {
      const { fileId, variant } = input.params
      const accountId = isUuid(fileId) ? await this.global.avatarOwner(fileId) : undefined
      if (!accountId) throw notFound('file')
      const file = await this.files.open(AVATAR_KIND, fileId, { variant, accountId })
      return this.files.answer(file, { forEveryone: true })
    })
  }

  /**
   * A report of a published profile, from anyone, counted against its sender's address first. A
   * profile that is not published answers as its page does; a kept report and one beyond the
   * profile's limit answer alike, with nothing. The email that the report arrived goes to the
   * address the report gave, in the language of the page it came from, once the report is kept.
   */
  @Implement(contract.public.reportProfile)
  reportProfile() {
    return implement(contract.public.reportProfile).handler(async ({ input }) => {
      await this.limiter.consume('profileReports', `ip:${this.context.clientAddress()}`)
      const { profileId } = input.params
      const locale = detectLocale({ acceptLanguage: input.headers['accept-language'] })
      const outcome = isUuid(profileId)
        ? await this.reports.add(profileId, input.body, locale)
        : 'not-found'
      if (outcome === 'not-found') throw notFound('profile')
      if (outcome === 'kept' && input.body.email) {
        await this.notices.reportReceived(input.body.email, locale)
      }
    })
  }
}
