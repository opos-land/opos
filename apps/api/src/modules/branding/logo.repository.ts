import { Injectable } from '@nestjs/common'
import { type Logo } from '@opos/contract'
import { tenantLogos, uploadedFiles } from '@opos/db'
import { eq } from 'drizzle-orm'
import { TenantContextService } from '../../common/als/tenant-context.service'

/**
 * The logo of the tenant in context: a row of tenant_logos pointing at the convention's own file,
 * there only while it has a logo. RLS keeps every query inside the tenant, and the queries name
 * the tenant themselves too, since what they answer decides which file anyone may read.
 */
@Injectable()
export class LogoRepository {
  constructor(private readonly context: TenantContextService) {}

  private tenantId() {
    return this.context.tenant().id
  }

  /** The logo with the width and height of its picture, or null. */
  async find(tenantId = this.tenantId()): Promise<Logo | null> {
    const [row] = await this.context
      .tx()
      .select({
        fileId: tenantLogos.fileId,
        width: uploadedFiles.width,
        height: uploadedFiles.height,
      })
      .from(tenantLogos)
      .innerJoin(uploadedFiles, eq(uploadedFiles.id, tenantLogos.fileId))
      .where(eq(tenantLogos.tenantId, tenantId))
    // A logo is an image, whose row always holds both.
    if (!row?.width || !row.height) return null
    return { fileId: row.fileId, width: row.width, height: row.height }
  }

  /** Removes the pointer and answers the file it pointed at, for the caller to release. */
  async clear(): Promise<string | undefined> {
    const [gone] = await this.context
      .tx()
      .delete(tenantLogos)
      .where(eq(tenantLogos.tenantId, this.tenantId()))
      .returning({ fileId: tenantLogos.fileId })
    return gone?.fileId
  }

  /** Points the logo at a file just kept; the tenant has none at that moment. */
  async set(fileId: string) {
    await this.context.tx().insert(tenantLogos).values({ tenantId: this.tenantId(), fileId })
  }
}
