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
   * The code an order takes, or undefined where it cannot: the row of the code is locked first,
   * the last lock an order takes, and the code is then read again, so the order is priced by the
   * terms the code has under that lock and counts its uses alone. A code an org ended or changed
   * while the order waited is the one it finds.
   */
  async taken(editionId: string, entry: string, at: Date): Promise<StoredDiscount | undefined> {
    const seen = await this.codes.find(editionId, entry.trim().toLowerCase())
    if (!seen) return undefined
    const locked = await this.codes.lock(editionId, seen.id)
    if (!locked) return undefined
    const code = await this.usable(editionId, entry, at)
    if (!code) return undefined
    if (code.usageLimit !== null && (await this.codes.uses(code.id)) >= code.usageLimit) {
      return undefined
    }
    return code
  }

  /**
   * Whether one more order may hold the code, as a quote shows it: read with no lock, since an
   * order that then takes the code counts again under the lock of its row.
   */
  async hasUse(editionId: string, codeId: string): Promise<boolean> {
    const code = await this.codes.limit(editionId, codeId)
    if (!code) return false
    return code.usageLimit === null || (await this.codes.uses(codeId)) < code.usageLimit
  }
}
