import { z } from 'zod'
import { AGE_BANDS } from './catalog'
import { publicRoute, scannerRoute, tenantRoute, timestamp } from './common'
import { MAX_HAND_OUT_LINES, QR_CODE_PATTERN } from './orders'

// The scanners of an edition (docs/specs/0007-scanner.md): devices with no account, enabled by
// an org with tickets write access, that read a buyer's QR code at the gate and at the desk.

/** The most scanners an edition has enabled at a time. */
export const MAX_SCANNERS = 20

/** How long a pairing code works, and it works once. */
export const PAIRING_MINUTES = 15

/** How long after the edition's last day a scanner's access ends, unless the org sets less. */
export const SCANNER_DAYS_AFTER_EDITION = 1

/** A scanner as the panel lists it. */
export const scannerSchema = z.object({
  id: z.uuid(),
  /** Such as the gate it stands at; unique among the edition's scanners that still stand. */
  name: z.string(),
  /** The org who enabled it, by the email of its account; null once that org left the team. */
  enabledBy: z.string().nullable(),
  /** Whether a phone spent its pairing code. */
  paired: z.boolean(),
  lastUsedAt: timestamp.nullable(),
  expiresAt: timestamp,
  revokedAt: timestamp.nullable(),
})

export type Scanner = z.infer<typeof scannerSchema>

export const createScannerSchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  /** An earlier end than a day after the edition's last day. */
  expiresAt: timestamp.optional(),
})

export type CreateScanner = z.infer<typeof createScannerSchema>

/**
 * A scanner just enabled, with its pairing code: the only secret an org ever sees, shown once.
 * The panel draws it as a QR code and as a link that carries it after the `#`.
 */
export const enabledScannerSchema = scannerSchema.extend({
  pairingCode: z.string(),
  pairingExpiresAt: timestamp,
})

export type EnabledScanner = z.infer<typeof enabledScannerSchema>

/** The most orders a scanner's page lists of what it handed out: the ones it marked last. */
export const MAX_LISTED_HAND_OUTS = 100

/**
 * What a scanner handed out (D15): the lines that name it as the one that marked them. A mark an
 * org made in the panel, and one taken back, are not the scanner's.
 */
export const scannerHandOutsSchema = z.object({
  /** How many orders it marked something of. */
  orders: z.number().int().min(0),
  /** How many lines it marked in all. */
  lines: z.number().int().min(0),
  firstAt: timestamp.nullable(),
  lastAt: timestamp.nullable(),
  /** The orders, the one marked last first, at most `MAX_LISTED_HAND_OUTS` of them. */
  latest: z.array(
    z.object({
      orderId: z.uuid(),
      number: z.string(),
      holderName: z.string(),
      /** How many lines of the order the scanner marked. */
      lines: z.number().int().min(1),
      lastAt: timestamp,
    }),
  ),
})

/** A scanner as its own page shows it: what the list tells of it, and what it handed out. */
export const scannerDetailSchema = scannerSchema.extend({ handOuts: scannerHandOutsSchema })

export type ScannerDetail = z.infer<typeof scannerDetailSchema>

/** A pairing code, spent by the phone that becomes the scanner. */
export const pairScannerSchema = z.strictObject({ code: z.string().min(1).max(200) })

/**
 * What the paired phone keeps: its token, handed over once and shown on no screen, and what it
 * shows of itself.
 */
export const pairedScannerSchema = z.object({
  token: z.string(),
  name: z.string(),
  editionName: z.string(),
  conventionName: z.string(),
  /** The convention's time zone: the scanner shows every moment in it, never in the phone's. */
  timezone: z.string(),
  expiresAt: timestamp,
})

export type PairedScanner = z.infer<typeof pairedScannerSchema>

/** A QR code as a scanner reads it. It reads nothing else: no name, email or number. */
export const scanSchema = z.strictObject({ code: z.string().regex(QR_CODE_PATTERN) })

/** Why a QR code is "Not valid". */
export const SCAN_REFUSALS = ['unknown', 'other-edition', 'replaced', 'canceled'] as const

export type ScanRefusal = (typeof SCAN_REFUSALS)[number]

const handOutState = {
  handedOutAt: timestamp.nullable(),
  /** The scanner that marked it; null for a mark an org made in the panel. */
  handedOutBy: z.string().nullable(),
}

/**
 * What a scan shows of a QR code: every order on it that is not canceled, each with its ticket
 * holder, its entry and its items, and whether each was already handed out. No email address.
 */
export const scanResultSchema = z.object({
  orders: z.array(
    z.object({
      orderId: z.uuid(),
      number: z.string(),
      holderName: z.string(),
      /** Null for an order with no ticket: it shows no entry, its items alone. */
      ageBand: z.enum(AGE_BANDS).nullable(),
      /** Entry: the ticket's line, with the perks handed out with it. */
      entry: z
        .object({
          lineId: z.uuid(),
          ticketType: z.string(),
          perks: z.array(z.string()),
          ...handOutState,
        })
        .nullable(),
      addOns: z.array(z.object({ lineId: z.uuid(), name: z.string(), ...handOutState })),
      items: z.array(
        z.object({
          lineId: z.uuid(),
          name: z.string(),
          /** The labels of the variant's values, in the order of its item's axes. */
          variant: z.array(z.string()),
          quantity: z.number().int(),
          ...handOutState,
        }),
      ),
    }),
  ),
})

export type ScanResult = z.infer<typeof scanResultSchema>

/**
 * Entry or items of one order marked as handed out, under the QR code the scanner read: a
 * scanner marks nothing of an order it did not scan.
 */
export const scanHandOutSchema = z.strictObject({
  code: z.string().regex(QR_CODE_PATTERN),
  orderId: z.uuid(),
  lineIds: z
    .array(z.uuid())
    .min(1)
    .max(MAX_HAND_OUT_LINES)
    .refine((ids) => new Set(ids).size === ids.length, 'A line is named once'),
})

const edition = z.object({ params: z.object({ editionId: z.string() }) })
const scanner = z.object({ params: z.object({ editionId: z.string(), scannerId: z.string() }) })

/** What an org does with the scanners of an edition. */
export const scannersContract = {
  list: tenantRoute
    .route({
      method: 'GET',
      path: '/editions/{editionId}/scanners',
      summary:
        "The edition's scanners: each with its name, who enabled it, when it was last used and when its access ends; needs tickets>=read",
    })
    .input(edition)
    .output(z.array(scannerSchema)),
  create: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/scanners',
      successStatus: 201,
      summary:
        'Enables a scanner and answers its pairing code, once; refused with scanner.limit-reached, scanner.name-taken or scanner.outlives-org; needs tickets=write',
    })
    .input(edition.extend({ body: createScannerSchema }))
    .output(enabledScannerSchema),
  get: tenantRoute
    .route({
      method: 'GET',
      path: '/editions/{editionId}/scanners/{scannerId}',
      summary:
        'One scanner of the edition with what it handed out: how many orders and lines, when, and the orders it marked last; needs tickets>=read',
    })
    .input(scanner)
    .output(scannerDetailSchema),
  renewPairing: tenantRoute
    .route({
      method: 'POST',
      path: '/editions/{editionId}/scanners/{scannerId}/pairing-code',
      summary:
        'Gives a scanner a new pairing code and answers it, once: the phone that held the scanner holds it no more; refused with scanner.ended for a scanner revoked or ended or whose org has left, and with scanner.outlives-org for an org whose own access ends before the scanner does; needs tickets=write',
    })
    .input(scanner)
    .output(enabledScannerSchema),
  revoke: tenantRoute
    .route({
      method: 'DELETE',
      path: '/editions/{editionId}/scanners/{scannerId}',
      summary:
        'Revokes a scanner, whoever enabled it: it reads and records nothing from then on; needs tickets=write',
    })
    .input(scanner)
    .output(scannerSchema),
}

/** What a phone asks: to become a scanner, and then, as one, to read and to hand out. */
export const scannerContract = {
  pair: publicRoute
    .route({
      method: 'POST',
      path: '/scanner/pair',
      summary:
        "Spends a pairing code and answers the device's token, once; refused with scanner.code-refused for a code unknown, used or expired",
    })
    .input(z.object({ body: pairScannerSchema }))
    .output(pairedScannerSchema),
  scan: scannerRoute
    .route({
      method: 'POST',
      path: '/scanner/scans',
      summary:
        'Reads a QR code: every order on it that is not canceled, with what was handed out; refused with scan.not-valid and its reason',
    })
    .input(z.object({ body: scanSchema }))
    .output(scanResultSchema),
  handOut: scannerRoute
    .route({
      method: 'POST',
      path: '/scanner/hand-outs',
      summary:
        'Marks entry or lines of one order of a QR code as handed out; refused with scan.already-handed-out, its time and its scanner',
    })
    .input(z.object({ body: scanHandOutSchema }))
    .output(scanResultSchema),
}
