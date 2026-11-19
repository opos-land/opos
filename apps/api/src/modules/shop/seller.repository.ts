import { Injectable } from '@nestjs/common'
import { type Seller, type SellerDetails } from '@opos/contract'
import { shopSellers } from '@opos/db'
import { eq } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'

const columns = {
  sellerName: shopSellers.sellerName,
  sellerAddress: shopSellers.sellerAddress,
  sellerRegistrationNumber: shopSellers.sellerRegistrationNumber,
  contactEmail: shopSellers.contactEmail,
}

const EMPTY: SellerDetails = {
  sellerName: null,
  sellerAddress: null,
  sellerRegistrationNumber: null,
  contactEmail: null,
}

/** The details are complete once every part is set (docs/specs/0002-shop-setup.md, S5). */
export const isComplete = (details: SellerDetails) =>
  Object.values(details).every((part) => part !== null)

const toSeller = (details: SellerDetails): Seller => ({
  ...details,
  currency: 'PLN',
  complete: isComplete(details),
})

/** The seller's details of the tenant in context, one row a tenant; RLS keeps it inside. */
@Injectable()
export class SellerRepository {
  constructor(private readonly context: TenantContextService) {}

  /** The details, each part empty for a convention that has set none. */
  async get(): Promise<Seller> {
    const [row] = await this.context
      .tx()
      .select(columns)
      .from(shopSellers)
      .where(eq(shopSellers.tenantId, this.context.tenant().id))
    return toSeller(row ?? EMPTY)
  }

  async put(details: SellerDetails): Promise<Seller> {
    const [row] = await this.context
      .tx()
      .insert(shopSellers)
      .values({ tenantId: this.context.tenant().id, ...details })
      .onConflictDoUpdate({ target: shopSellers.tenantId, set: details })
      .returning(columns)
    return toSeller(row!)
  }
}
