import { Controller } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RequireEdition } from '../../common/decorators/require-edition.decorator'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { ProgramRepository, speakerAccountNotFound } from './program.repository'

@Controller()
export class ProgramController {
  constructor(
    private readonly program: ProgramRepository,
    private readonly context: TenantContextService,
    private readonly rateLimiter: RouteRateLimiter,
  ) {}

  @Implement(contract.program.list)
  @RequireEdition('program', 'read')
  list() {
    return implement(contract.program.list).handler(({ input }) =>
      this.program.list(input.params.editionId),
    )
  }

  @Implement(contract.program.create)
  @RequireEdition('program', 'write')
  create() {
    return implement(contract.program.create).handler(({ input }) =>
      this.program.create(input.params.editionId, input.body),
    )
  }

  @Implement(contract.program.update)
  @RequireEdition('program', 'write')
  update() {
    return implement(contract.program.update).handler(({ input }) =>
      this.program.update(input.params.editionId, input.params.programItemId, input.body),
    )
  }

  @Implement(contract.program.remove)
  @RequireEdition('program', 'write')
  remove() {
    return implement(contract.program.remove).handler(({ input }) =>
      this.program.remove(input.params.editionId, input.params.programItemId),
    )
  }

  @Implement(contract.program.speakers.put)
  @RequireEdition('program', 'write')
  putSpeakers() {
    return implement(contract.program.speakers.put).handler(async ({ input }) => {
      const { editionId, programItemId } = input.params
      const item = await this.program.get(editionId, programItemId)
      const emails = [...new Set(input.body.emails.map((email) => email.toLowerCase()))]
      // Counted before the lookup, so an address without an account costs as much as one with it.
      const speaking = await this.program.speakingInEdition(editionId, emails)
      for (const email of emails) {
        if (speaking.has(email)) continue
        await this.rateLimiter.consume('speakers', `tenant:${this.context.tenant().id}`)
      }
      const accounts = await this.program.confirmedAccounts(emails)
      const missing = emails.find((email) => !accounts.some((account) => account.email === email))
      if (missing) throw speakerAccountNotFound(missing)
      await this.program.replaceSpeakers(item.id, accounts)
      return this.program.get(editionId, item.id)
    })
  }
}
