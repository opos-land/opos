import { Trans } from '@lingui/react/macro'
import { useNavigate, useParams } from 'react-router'
import { AreaFrame, atLeast, SidebarLink, useCurrentTenant } from '../../tenants'
import { useEditionBySlug } from '../hooks/use-editions'

const caption = 'text-muted text-xs font-semibold tracking-wide uppercase'

/**
 * The edition area (PLAN.md 8), where most members work: the menu of everything about one edition,
 * its settings and team access included, with a switch to the member's other editions. Until the
 * edition is known, or when the member does not see it, there is no menu and the page says why.
 */
export function EditionLayout() {
  const { editionSlug } = useParams()
  const { tenant, access } = useCurrentTenant()
  const navigate = useNavigate()
  const { data: editions, edition } = useEditionBySlug(editionSlug)

  if (!edition) return <AreaFrame />

  const convention = `/${tenant.slug}`
  const base = `${convention}/editions/${edition.slug}`
  const level = access.edition(edition.id)
  const others = editions ?? [edition]

  return (
    <AreaFrame
      menu={{
        label: edition.name,
        header: (
          <>
            {others.length > 1 ? (
              <label className="flex flex-col gap-1">
                <span className={caption}>
                  <Trans>Edition</Trans>
                </span>
                <select
                  className="rounded-box border-line bg-surface border px-2 py-1 text-sm"
                  value={edition.slug}
                  onChange={(event) =>
                    void navigate(`${convention}/editions/${event.target.value}`)
                  }
                >
                  {others.map((other) => (
                    <option key={other.id} value={other.slug}>
                      {other.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className={caption}>{edition.name}</p>
            )}
          </>
        ),
        links: (
          <>
            <SidebarLink to={base} end>
              <Trans>Dashboard</Trans>
            </SidebarLink>
            {atLeast(level.program, 'read') && (
              <SidebarLink to={`${base}/program`}>
                <Trans>Programme</Trans>
              </SidebarLink>
            )}
            {atLeast(access.settings, 'read') && (
              <>
                <SidebarLink to={`${base}/access`}>
                  <Trans>Access</Trans>
                </SidebarLink>
                <SidebarLink to={`${base}/settings`}>
                  <Trans>Edition settings</Trans>
                </SidebarLink>
              </>
            )}
          </>
        ),
      }}
    />
  )
}
