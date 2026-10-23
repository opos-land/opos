import { type Level } from '../als/tenant-context.service'
import { type EditionResource } from '../permissions/permissions'
import { tenantRoute } from './require-tenant.decorator'

/** A tenant route that also needs an edition-level permission on the `:editionId` of the path. */
export const RequireEdition = (
  resource: EditionResource,
  level: Level,
  param = 'editionId',
): MethodDecorator => tenantRoute({ kind: 'edition', resource, level, param })
