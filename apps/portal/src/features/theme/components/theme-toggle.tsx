import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { type Theme } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MoonIcon, SunIcon } from 'lucide-react'
import { useSession } from '../../../shared/lib/session'
import { chooseSignedOutTheme, useShownTheme } from '../../../shared/lib/theme'
import { Button } from '../../../shared/ui'
import { mergeSavedTheme, saveThemeOptions } from '../api/theme'

/** The button itself: whether the dark theme is on, and a press asking for the other theme. */
function ToggleButton({
  onToggle,
  disabled = false,
}: {
  onToggle: (next: Theme) => void
  disabled?: boolean
}) {
  const { t } = useLingui()
  const dark = useShownTheme() === 'dark'
  const label = t`Dark theme`

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={dark}
      title={label}
      disabled={disabled}
      onClick={() => onToggle(dark ? 'light' : 'dark')}
    >
      {dark ? <MoonIcon /> : <SunIcon />}
    </Button>
  )
}

/** A signed-in account keeps the theme on the account; AccountTheme shows it once saved. */
function AccountToggle() {
  const queryClient = useQueryClient()
  const save = useMutation({
    ...saveThemeOptions(),
    meta: { success: msg`The interface theme is saved.` },
    onSuccess: (saved) => mergeSavedTheme(queryClient, saved),
  })

  return <ToggleButton onToggle={(theme) => save.mutate({ body: { theme } })} />
}

/**
 * Switches between the light and the dark theme on any screen, signed in or not: on the account
 * when one is signed in, else in this browser. The system's theme comes back from the account page.
 */
export function ThemeToggle() {
  const status = useSession((state) => state.status)
  const signedIn = useSession((state) => state.account !== null)

  if (signedIn) return <AccountToggle />
  return <ToggleButton onToggle={chooseSignedOutTheme} disabled={status === 'loading'} />
}
