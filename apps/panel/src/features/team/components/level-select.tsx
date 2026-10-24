import { useLingui } from '@lingui/react/macro'
import { type SelectHTMLAttributes } from 'react'
import { inputClass } from '../../../shared/ui'

/** A permission value (PRODUCT.md 5.3): none, read or write. */
export function LevelSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { t } = useLingui()
  return (
    <select {...props} className={inputClass}>
      <option value="none">{t`No access`}</option>
      <option value="read">{t`Read`}</option>
      <option value="write">{t`Write`}</option>
    </select>
  )
}
