import { type MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import {
  DOCUMENT_TYPES,
  type DocumentKind,
  MAX_DOCUMENT_SIZE,
  SHOP_CONDITIONS,
  type ShopCondition,
} from '@opos/contract'
import { ORPCError } from '@orpc/client'

/**
 * Why a chosen file cannot be a version of a document, told beside the field before anything is
 * sent: its type, or its size. The API checks both again, against the bytes.
 */
export function documentProblem(file: File): 'type' | 'size' | null {
  if (!(DOCUMENT_TYPES as readonly string[]).includes(file.type)) return 'type'
  if (file.size > MAX_DOCUMENT_SIZE) return 'size'
  return null
}

/** The address a published version is downloaded from, without sign-in. */
export const versionUrl = (apiUrl: string, tenantSlug: string, versionId: string) =>
  `${apiUrl.replace(/\/+$/, '')}/public/tenants/${tenantSlug}/document-versions/${versionId}`

/** The size of a file as the interface language writes it, in the unit that keeps it short. */
export function fileSize(bytes: number, locale: string) {
  const [value, unit] =
    bytes >= 1024 * 1024
      ? [bytes / (1024 * 1024), 'megabyte']
      : bytes >= 1024
        ? [bytes / 1024, 'kilobyte']
        : [bytes, 'byte']
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value)
}

export const KIND_LABELS: Record<DocumentKind, MessageDescriptor> = {
  'shop-terms': msg`Shop terms`,
  'privacy-policy': msg`Privacy policy`,
  'edition-rules': msg`Edition rules`,
  other: msg`Other document`,
}

/** What each condition of opening the shop asks for, as the shop screen lists them. */
export const CONDITION_LABELS: Record<ShopCondition, MessageDescriptor> = {
  'provider-account': msg`The convention’s payment provider account is connected and ready to sell.`,
  'seller-details': msg`The seller’s details of the convention are complete.`,
  'shop-terms': msg`The shop terms have a published version.`,
  'privacy-policy': msg`The privacy policy has a published version.`,
}

/** The conditions a refused opening names as missing; none for any other error. */
export function missingConditions(error: unknown): ShopCondition[] {
  if (!(error instanceof ORPCError) || error.code !== 'shop.not-ready') return []
  const named = (error.data ?? {}) as Record<string, unknown>
  return SHOP_CONDITIONS.filter((condition) => Object.hasOwn(named, condition))
}
