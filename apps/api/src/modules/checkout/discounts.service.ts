import { Injectable } from '@nestjs/common'
import { DiscountsRepository, type StoredDiscount } from './discounts.repository'

/**
 * A discount code as a buyer uses it (docs/specs/0008-discount-codes.md, K1-K8). It runs in the
 * transaction of the tenant the shop's address named.
 */
@Injectable()
export class Discounts {
  constructor(private readonly codes: DiscountsRepository) {}

  /**
   * The code a buyer entered, when it may be used at `at`: known in the edition, inside its
   * window and not ended. Read without regard to case; a text that is no code is unknown.
   */
  async usable(editionId: string, entry: string, at: Date): Promise<StoredDiscount | undefined> {
    const found = await this.codes.find(editionId, entry.trim().toLowerCase())
    if (!found || found.endedAt) return undefined
    if (at.getTime() < found.validFrom.getTime() || at.getTime() >= found.validUntil.getTime()) {
      return undefined
    }
    return found
  }

  /**
   * Whether one more order may hold the code. `locked` takes the lock of the code's row first, so
   * the count is the caller's alone: for an order being placed, or taking its use again. Without
   * it the answer is what a quote shows, and placing counts again.
   */
  async hasUse(editionId: string, codeId: string, locked: boolean): Promise<boolean> {
    if (locked) {
      const code = await this.codes.lock(editionId, codeId)
      if (!code) return false
      return code.usageLimit === null || (await this.codes.uses(codeId)) < code.usageLimit
    }
    const code = await this.codes.limit(editionId, codeId)
    if (!code) return false
    return code.usageLimit === null || (await this.codes.uses(codeId)) < code.usageLimit
  }
}
