import { Trans } from '@lingui/react/macro'
import { useMatch, useNavigate } from 'react-router'
import { useCurrentTenant } from '../../tenants'
import { useEditionBySlug } from '../hooks/use-editions'

const label = (
  <span className="text-muted">
    <Trans>Edition</Trans>
  </span>
)

/**
 * The edition of the top bar: inside an edition, always under the label "Edition", a
 * switch to the other editions the member sees, opening on their dashboard, or the edition's name
 * when it is the only one. The bar stands above every route of the tenant, so the edition comes
 * from the address.
 */
export function EditionSwitch() {
  const match = useMatch('/:tenantSlug/editions/:editionSlug/*')
  const { tenant } = useCurrentTenant()
  const navigate = useNavigate()
  const { data: editions, edition } = useEditionBySlug(match?.params.editionSlug)

  if (!edition) return null
  if (!editions || editions.length < 2) {
    return (
      <span className="flex items-center gap-2 text-sm">
        {label}
        <span>{edition.name}</span>
      </span>
    )
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      {label}
      <select
        className="rounded-box border-line bg-surface border px-2 py-1 text-sm"
        value={edition.slug}
        onChange={(event) => void navigate(`/${tenant.slug}/editions/${event.target.value}`)}
      >
        {editions.map((other) => (
          <option key={other.id} value={other.slug}>
            {other.name}
          </option>
        ))}
      </select>
    </label>
  )
}
