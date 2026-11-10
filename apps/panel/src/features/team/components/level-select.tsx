import { useLingui } from '@lingui/react/macro'
import { type ComponentProps } from 'react'
import { NativeSelect, NativeSelectOption } from '../../../shared/ui'

/** A permission value (PRODUCT.md 5): none, read or write. */
export function LevelSelect(props: ComponentProps<typeof NativeSelect>) {
  const { t } = useLingui()
  return (
    <NativeSelect {...props}>
      <NativeSelectOption value="none">{t`No access`}</NativeSelectOption>
      <NativeSelectOption value="read">{t`Read`}</NativeSelectOption>
      <NativeSelectOption value="write">{t`Write`}</NativeSelectOption>
    </NativeSelect>
  )
}
