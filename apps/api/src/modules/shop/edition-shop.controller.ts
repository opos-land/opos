import { Controller } from '@nestjs/common'
import { contract, type EditionShop, type UpdateEditionShop } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { RequireEdition } from '../../common/decorators/require-edition.decorator'
import { reminderWindow } from '../reminders/reminder-window'
import { type EditionShopSettings, EditionShopsRepository } from './edition-shops.repository'
import { missingOf, ShopConditions } from './shop-conditions'
import { shopNotReady } from './shop.errors'

/** A change as the row takes it: the two ages apart, the deadline as a moment. */
export function settingsOf(body: UpdateEditionShop): EditionShopSettings {
  const { ageBands, merchPreorderDeadline, ...rest } = body
  return {
    ...rest,
    ...(ageBands !== undefined && {
      teenFromAge: ageBands?.teenFromAge ?? null,
      adultFromAge: ageBands?.adultFromAge ?? null,
    }),
    ...(merchPreorderDeadline !== undefined && {
      merchPreorderDeadline:
        merchPreorderDeadline === null ? null : new Date(merchPreorderDeadline),
    }),
  }
}

/**
 * The shop of an edition, behind the tickets permission of the edition
 * (docs/specs/0002-shop-setup.md): whether it is open, what opening asks for, its FAQ address and
 * the settings of the edition's catalog (docs/specs/0003-catalog.md). A tenant-level permission
 * grants none of it: an org with the shop permission alone opens no shop.
 */
@Controller()
export class EditionShopController {
  constructor(
    private readonly shops: EditionShopsRepository,
    private readonly conditions: ShopConditions,
    private readonly context: TenantContextService,
  ) {}

  /** When the reminder goes out: 9:00 on its day in the convention's time zone; null for none. */
  private async reminderDueAt(editionId: string, daysBefore: number | null) {
    const startsAt = daysBefore === null ? undefined : await this.shops.startsAt(editionId)
    if (daysBefore === null || !startsAt) return null
    return reminderWindow(startsAt, daysBefore, this.context.tenant().timezone).from.toISOString()
  }

  private async shown(editionId: string): Promise<EditionShop> {
    const shop = await this.shops.find(editionId)
    return {
      open: shop.openedAt !== null,
      openedAt: shop.openedAt?.toISOString() ?? null,
      faqUrl: shop.faqUrl,
      ageBands:
        shop.teenFromAge === null || shop.adultFromAge === null
          ? null
          : { teenFromAge: shop.teenFromAge, adultFromAge: shop.adultFromAge },
      guardianConsentFormUrl: shop.guardianConsentFormUrl,
      merchPreorderDeadline: shop.merchPreorderDeadline?.toISOString() ?? null,
      merchOnlyEnabled: shop.merchOnlyEnabled,
      salesClosedMessage: shop.salesClosedMessage,
      pickupInformation: shop.pickupInformation,
      openingHours: shop.openingHours,
      reminderDaysBefore: shop.reminderDaysBefore,
      reminderDueAt: await this.reminderDueAt(editionId, shop.reminderDaysBefore),
      reminderSentAt: shop.reminderSentAt?.toISOString() ?? null,
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
      await this.shops.set(editionId, settingsOf(input.body))
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
