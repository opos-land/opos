import { Injectable } from '@nestjs/common'
import {
  type CreateScanner,
  type EnabledScanner,
  MAX_SCANNERS,
  PAIRING_MINUTES,
  type PairedScanner,
  type ScanResult,
  SCANNER_DAYS_AFTER_EDITION,
} from '@opos/contract'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { GlobalDbService } from '../../common/database/global-db.service'
import { notFound } from '../../common/errors/api-error'
import { RouteRateLimiter } from '../../common/rate-limit/route-rate-limit'
import { invalidField } from '../catalog/catalog.errors'
import { hashOf, secretToken } from '../checkout/codes'
import { alreadyHandedOut } from '../order-management/order-management.errors'
import {
  pairingCodeRefused,
  scanNotValid,
  scannerEnded,
  scannerLimitReached,
  scannerNameTaken,
  scannerOutlivesOrg,
  scannerRevoked,
  scannerStopped,
} from './scanner.errors'
import { ScannersRepository, type StandingScanner } from './scanners.repository'
import { ScansRepository } from './scans.repository'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/**
 * The scanners of an edition and what a scanner does (docs/specs/0007-scanner.md). An org's part
 * runs in its request's tenant transaction. A device comes with no tenant: its pairing code or
 * its token is looked up across tenants by its hash, which answers the scanner and its tenant
 * alone, and everything else is judged in that tenant's own transaction, at every request.
 */
@Injectable()
export class ScannerService {
  constructor(
    private readonly scanners: ScannersRepository,
    private readonly scans: ScansRepository,
    private readonly global: GlobalDbService,
    private readonly context: TenantContextService,
    private readonly rateLimiter: RouteRateLimiter,
  ) {}

  /**
   * Enables a scanner of the edition for the org of the request, and answers its pairing code:
   * the only time the code is told. It runs under the tenant's write lock, which judged the org
   * again: the scanner ends a day after the edition's last day unless the org sets less, and
   * never later than the org's own access. With no earlier end to keep, none is written: the
   * scanner follows its edition, and its end is read from the edition's last day from then on.
   */
  async enable(editionId: string, body: CreateScanner, now = new Date()): Promise<EnabledScanner> {
    const membership = this.context.membership()
    const editionEnd = await this.scanners.editionEnd(editionId)
    if (!membership || !editionEnd) throw notFound('edition')
    const latest = new Date(editionEnd.getTime() + SCANNER_DAYS_AFTER_EDITION * DAY)
    const own = membership.expiresAt
    // An org whose own access ends earlier enables no scanner past that end.
    let expiresAt = own && own < latest ? own : null
    if (body.expiresAt !== undefined) {
      const asked = new Date(body.expiresAt)
      if (asked > latest) {
        throw invalidField('expiresAt', 'A scanner ends no later than a day after its edition')
      }
      if (own && asked > own) throw scannerOutlivesOrg()
      expiresAt = asked
    }
    if ((expiresAt ?? latest) <= now) {
      throw invalidField('expiresAt', 'The scanner would have ended already')
    }
    if ((await this.scanners.enabled(editionId, now)) >= MAX_SCANNERS) {
      throw scannerLimitReached(MAX_SCANNERS)
    }
    if (await this.scanners.nameTaken(editionId, body.name)) throw scannerNameTaken()

    const pairingCode = secretToken()
    const pairingExpiresAt = new Date(now.getTime() + PAIRING_MINUTES * MINUTE)
    const id = await this.scanners.insert({
      tenantId: this.context.tenant().id,
      editionId,
      name: body.name,
      enabledByMembershipId: membership.id,
      pairingCodeHash: hashOf(pairingCode),
      pairingExpiresAt,
      expiresAt,
    })
    return {
      ...(await this.scanners.get(editionId, id)),
      pairingCode,
      pairingExpiresAt: pairingExpiresAt.toISOString(),
    }
  }

  /**
   * Gives a scanner of the edition a new pairing code (D14) and answers it: the only time that
   * code is told. The phone that held the scanner holds it no more from this moment, whether or
   * not another opens the new code. A scanner of another edition is not found; one that was
   * revoked or has ended, or whose org has left, is refused, and so is an org whose own access
   * ends before the scanner does.
   */
  async pairAgain(editionId: string, scannerId: string, now = new Date()): Promise<EnabledScanner> {
    const membership = this.context.membership()
    const scanner = await this.scanners.get(editionId, scannerId)
    if (!membership) throw notFound('scanner')
    // The phone the code pairs holds the scanner until the scanner ends: an org whose own
    // access ends before that hands no scanner on, as it enables none that outlives it.
    if (membership.expiresAt && new Date(scanner.expiresAt) > membership.expiresAt) {
      throw scannerOutlivesOrg()
    }
    const pairingCode = secretToken()
    const pairingExpiresAt = new Date(now.getTime() + PAIRING_MINUTES * MINUTE)
    const renewed = await this.scanners.renewPairing(
      editionId,
      scannerId,
      { codeHash: hashOf(pairingCode), expiresAt: pairingExpiresAt },
      now,
    )
    if (!renewed) throw scannerEnded()
    return {
      ...(await this.scanners.get(editionId, scannerId)),
      pairingCode,
      pairingExpiresAt: pairingExpiresAt.toISOString(),
    }
  }

  /**
   * A phone spends a pairing code and becomes the scanner: it is handed the token, once. A code
   * that is unknown, used or expired, and one of a scanner that no longer stands, are refused
   * alike.
   */
  async pair(code: string, now = new Date()): Promise<PairedScanner> {
    await this.rateLimiter.consume('scannerPairings', `ip:${this.context.clientAddress()}`)
    const pairingCodeHash = hashOf(code)
    const found = await this.global.scannerByPairingCode(pairingCodeHash)
    if (!found) throw pairingCodeRefused()
    return this.context.withTenant(found.tenantId, async () => {
      // Locked: of two phones that open one code at the same moment, one becomes the scanner.
      // Asked for by the code again: a new one may have replaced it since it was found.
      const scanner = await this.scanners.standing(found.tenantId, found.id, now, {
        pairingCodeHash,
      })
      // A scanner its org stops pairs no phone: its code is refused like any that does not work.
      if (!scanner || scanner.stopped || scanner.pairingExpiresAt <= now) {
        throw pairingCodeRefused()
      }
      const names = await this.scanners.names(found.tenantId, scanner.editionId)
      if (!names) throw pairingCodeRefused()
      const token = secretToken()
      await this.scanners.pair(
        found.tenantId,
        scanner.id,
        { pairingCodeHash, tokenHash: hashOf(token) },
        now,
      )
      return {
        token,
        name: scanner.name,
        ...names,
        expiresAt: scanner.expiresAt.toISOString(),
      }
    })
  }

  /** Reads a QR code as the scanner the token names: S1-S5. A scan marks nothing by itself. */
  scan(code: string): Promise<ScanResult> {
    return this.asScanner((scanner) => this.read(scanner, code))
  }

  /**
   * Marks entry or lines of one order of the code as handed out. None is marked when one of them
   * was already: the answer names when and by which scanner.
   */
  handOut(
    body: { code: string; orderId: string; lineIds: readonly string[] },
    at = new Date(),
  ): Promise<ScanResult> {
    return this.asScanner(async (scanner) => {
      const { orders } = await this.read(scanner, body.code)
      // A scanner marks nothing of an order it did not scan.
      const order = orders.find((shown) => shown.orderId === body.orderId)
      if (!order) throw notFound('order')
      const own = new Set(
        [order.entry, ...order.addOns, ...order.items].flatMap((line) => line?.lineId ?? []),
      )
      if (body.lineIds.some((lineId) => !own.has(lineId))) throw notFound('line')
      const marked = await this.scans.handOut(
        scanner.tenantId,
        order.orderId,
        body.lineIds,
        scanner.id,
        at,
      )
      const missed = body.lineIds.find((lineId) => !marked.includes(lineId))
      if (missed) {
        const mark = await this.scans.mark(scanner.tenantId, missed)
        // Thrown inside the transaction: what this request marked is undone with it.
        throw alreadyHandedOut(missed, mark?.handedOutAt ?? at, mark?.scanner)
      }
      return this.read(scanner, body.code)
    })
  }

  /** The orders a QR code opens for the scanner, or "Not valid" with the reason. */
  private async read(scanner: StandingScanner, code: string): Promise<ScanResult> {
    const found = await this.scans.code(scanner.tenantId, hashOf(code))
    if (!found) throw scanNotValid('unknown')
    // Told as another edition's, and nothing of that edition's order is read.
    if (found.editionId !== scanner.editionId) throw scanNotValid('other-edition')
    if (found.replacedAt) throw scanNotValid('replaced')
    const orders = await this.scans.orders(scanner.tenantId, scanner.editionId, found.id)
    // Every order on the code that is not canceled; refused once every one is.
    const valid = orders.filter((order) => order.status === 'paid')
    if (valid.length === 0) throw scanNotValid(orders.length > 0 ? 'canceled' : 'unknown')
    return { orders: await this.scans.shown(scanner.tenantId, valid) }
  }

  /**
   * Runs `fn` as the scanner the request's token named, in its tenant's transaction. The
   * device's access is judged here at every request: that it still holds the token the request
   * came with, was not revoked and has not ended, and the org who enabled it. An org who left
   * the team ends it like a revocation; one whose access has ended or who no longer writes the
   * tickets of its edition stops it for as long as that lasts, which is told apart so that the
   * phone keeps its token (docs/ARCHITECTURE.md, Modules waiting for their domain owner). A
   * suspended tenant is refused
   * where its transaction opens. The request was counted against the scanner where its token
   * named it, in ScannerGuard.
   */
  private async asScanner<T>(
    fn: (scanner: StandingScanner) => Promise<T>,
    now = new Date(),
  ): Promise<T> {
    const found = this.context.scanner()
    return this.context.withTenant(found.tenantId, async () => {
      const scanner = await this.scanners.standing(found.tenantId, found.id, now, {
        tokenHash: found.tokenHash,
      })
      if (!scanner) throw scannerRevoked()
      if (scanner.stopped) throw scannerStopped()
      await this.scanners.touch(found.tenantId, scanner.id, now)
      return fn(scanner)
    })
  }
}
