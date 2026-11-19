import { type UpdateEditionShop, updateEditionShopSchema } from '@opos/contract'
import { wholeNumber } from './add-on-form'

/**
 * What the two fields of the age bands ask the API to set: both ages, or none while both fields
 * are empty. Null for anything the contract would refuse.
 */
export function ageBandsBody(
  teen: string,
  adult: string,
): Pick<UpdateEditionShop, 'ageBands'> | null {
  if (!teen.trim() && !adult.trim()) return { ageBands: null }
  const ages = { teenFromAge: wholeNumber(teen), adultFromAge: wholeNumber(adult) }
  const parsed = updateEditionShopSchema.safeParse({ ageBands: ages })
  return parsed.success ? { ageBands: parsed.data.ageBands } : null
}
