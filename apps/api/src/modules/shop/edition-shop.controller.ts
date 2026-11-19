import { Controller } from '@nestjs/common'
import { contract, type EditionShop } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { RequireEdition } from '../../common/decorators/require-edition.decorator'
import { EditionShopsRepository } from './edition-shops.repository'
import { missingOf, ShopConditions } from './shop-conditions'
import { shopNotReady } from './shop.errors'

/**
 * The shop of an edition, behind the tickets permission of the edition
 * (docs/specs/0002-shop-setup.md): whether it is open, what opening asks for, and its FAQ address.
 * A tenant-level permission grants none of it: an org with the shop permission alone opens no
 * shop.
 */
@Controller()
export class EditionShopController {
  constructor(
    private readonly shops: EditionShopsRepository,
    private readonly conditions: ShopConditions,
  ) {}

  private async shown(editionId: string): Promise<EditionShop> {
    const shop = await this.shops.find(editionId)
    return {
      open: shop.openedAt !== null,
      openedAt: shop.openedAt?.toISOString() ?? null,
      faqUrl: shop.faqUrl,
      conditions: await this.conditions.of(editionId),
    }
  }

  @Implement(contract.shop.edition.get)
  @RequireEdition('tickets', 'read')
  get() {
    return implement(contract.shop.edition.get).handler(({ input }) =>
      this.shown(input.params.editionId),
    )
  }

  @Implement(contract.shop.edition.update)
  @RequireEdition('tickets', 'write')
  update() {
    return implement(contract.shop.edition.update).handler(async ({ input }) => {
      const { editionId } = input.params
      if (input.body.faqUrl !== undefined) await this.shops.setFaqUrl(editionId, input.body.faqUrl)
      return this.shown(editionId)
    })
  }

  /**
   * The conditions are read under the tenant's write lock, which every write that could take one
   * away waits for: nothing they rest on changes between this check and the commit.
   */
  @Implement(contract.shop.edition.open)
  @RequireEdition('tickets', 'write')
  open() {
    return implement(contract.shop.edition.open).handler(async ({ input }) => {
      const { editionId } = input.params
      const missing = missingOf(await this.conditions.of(editionId))
      if (missing.length > 0) throw shopNotReady(missing)
      await this.shops.open(editionId)
      return this.shown(editionId)
    })
  }

  /** Closing stops new orders alone; what the shop holds stays as it is. */
  @Implement(contract.shop.edition.close)
  @RequireEdition('tickets', 'write')
  close() {
    return implement(contract.shop.edition.close).handler(async ({ input }) => {
      await this.shops.close(input.params.editionId)
      return this.shown(input.params.editionId)
    })
  }
}
