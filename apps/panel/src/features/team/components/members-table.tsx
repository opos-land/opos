import { Trans, useLingui } from '@lingui/react/macro'
import { type Member } from '@opos/contract'
import {
  Badge,
  LinkRow,
  RowLink,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/ui'
import { useCurrentTenant, useTenantTime } from '../../tenants'
import { canManage, memberName } from '../model/member'
import { SettingsLabel, ShopLabel } from './permission-labels'

function LevelText({ member, level }: { member: Member; level: Member['settingsAccess'] }) {
  if (member.role === 'head') return <Trans>Full access</Trans>
  if (level === 'write') return <Trans>Write</Trans>
  if (level === 'read') return <Trans>Read</Trans>
  return <Trans>No access</Trans>
}

/**
 * The team, one row per membership. Where the panel offers a change (`canManage`), the whole row
 * opens the member's page; the name inside it stays the link a keyboard and a screen reader reach.
 */
export function MembersTable({
  members,
  accountId,
}: {
  members: Member[]
  accountId: string | undefined
}) {
  const { t } = useLingui()
  const { tenant, access } = useCurrentTenant()
  const time = useTenantTime()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">
            <Trans>Member</Trans>
          </TableHead>
          <TableHead scope="col">
            <Trans>Role</Trans>
          </TableHead>
          <TableHead scope="col">
            <SettingsLabel />
          </TableHead>
          <TableHead scope="col">
            <ShopLabel />
          </TableHead>
          <TableHead scope="col">
            <Trans>Access until</Trans>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => {
          const isSelf = member.account.id === accountId
          const name = memberName(member)
          const page = canManage(access, member, isSelf)
            ? `/${tenant.slug}/settings/team/${member.id}`
            : undefined
          return (
            <LinkRow key={member.id} to={page}>
              <TableHead scope="row" className="font-normal">
                {page ? (
                  <RowLink to={page}>{name}</RowLink>
                ) : (
                  <span className="font-medium">{name}</span>
                )}
                {isSelf && <span className="text-muted-foreground ml-1">({t`you`})</span>}
                {name !== member.account.email && (
                  <span className="text-muted-foreground block text-xs">
                    {member.account.email}
                  </span>
                )}
              </TableHead>
              <TableCell>
                {member.role === 'head' ? <Trans>Head organizer</Trans> : <Trans>Organizer</Trans>}
              </TableCell>
              <TableCell>
                <LevelText member={member} level={member.settingsAccess} />
              </TableCell>
              <TableCell>
                <LevelText member={member} level={member.shopConfigAccess} />
              </TableCell>
              <TableCell>
                {member.expiresAt ? time.format(member.expiresAt) : <Trans>No end date</Trans>}
                {member.expired && (
                  <Badge variant="destructive" className="ml-2">
                    <Trans>expired</Trans>
                  </Badge>
                )}
              </TableCell>
            </LinkRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
