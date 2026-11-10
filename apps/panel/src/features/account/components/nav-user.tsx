import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheckIcon, ChevronsUpDownIcon, LogOutIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ErrorMessage,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '../../../shared/ui'
import { signOut } from '../../auth'
import { accountOptions } from '../api/account'

/** Two letters for the avatar: the initials of the name, else the start of the address. */
function initials(name: string, email: string) {
  const words = name.split(/\s+/).filter(Boolean)
  const first = words[0]?.[0]
  const last = words.length > 1 ? words.at(-1)?.[0] : undefined
  return (first && last ? first + last : (name || email).slice(0, 2)).toUpperCase()
}

/**
 * The account in the sidebar's footer: who is signed in, with a menu leading to the account page
 * and signing out. The avatar repeats the name, so assistive technology skips it.
 */
export function NavUser() {
  const { isMobile } = useSidebar()
  const account = useQuery(accountOptions())
  // A failed sign-out leaves the cookies set, so it is shown rather than dropped.
  const [signOutError, setSignOutError] = useState<unknown>(null)

  const leave = async () => setSignOutError(await signOut())

  const email = account.data?.email ?? ''
  const name = [account.data?.firstName, account.data?.lastName].filter(Boolean).join(' ')
  const who = (
    <>
      <Avatar aria-hidden>
        <AvatarFallback>{initials(name, email)}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{name || email || <Trans>Account</Trans>}</span>
        {name && <span className="truncate text-xs">{email}</span>}
      </div>
    </>
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />}
          >
            {who}
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-fit"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">{who}</div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link to="/account" />}>
                <BadgeCheckIcon />
                <Trans>Account</Trans>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void leave()}>
              <LogOutIcon />
              <Trans>Sign out</Trans>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      {Boolean(signOutError) && (
        <SidebarMenuItem>
          <ErrorMessage error={signOutError} />
        </SidebarMenuItem>
      )}
    </SidebarMenu>
  )
}
