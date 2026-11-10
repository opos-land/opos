import { Trans } from '@lingui/react/macro'
import { ArrowLeftIcon } from 'lucide-react'
import { Link } from 'react-router'
import { buttonVariants } from '../../../shared/ui'
import { useCurrentTenant } from '../../tenants'

/** The way back from a page of the team to its table. */
export function BackToTeam() {
  const { tenant } = useCurrentTenant()
  return (
    <Link to={`/${tenant.slug}/settings/team`} className={buttonVariants({ variant: 'outline' })}>
      <ArrowLeftIcon data-icon="inline-start" />
      <Trans>Back to the team</Trans>
    </Link>
  )
}
